#!/usr/bin/env bash
# freshness_issues.sh — turn `audit_site.py --freshness --json` output into GitHub
# issues. Opens (or comments on) one issue per stale game and auto-closes issues
# for games that have recovered. Idempotent by exact issue title, so re-runs never
# spawn duplicates. Requires: gh (authenticated via GH_TOKEN), jq, GITHUB_REPOSITORY.
set -euo pipefail

JSON="${1:?usage: freshness_issues.sh <freshness.json>}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"
PREFIX="Stale data:"

# Titles are keyed on the *oldest* missing draw (missing[] is newest-first, so
# [-1] is the first draw we lost). That stays constant while a game is stuck, so
# repeated runs update the same issue instead of opening a new one each day.
# (Portable array read — avoids bash-4 `mapfile` so this runs on macOS bash 3.2 too.)
desired_titles=()
while IFS= read -r line; do
  desired_titles+=("$line")
done < <(jq -r '.stale[] | "'"$PREFIX"' \(.name) (missing \(.missing[-1]))"' "$JSON")

open_or_comment() {
  local title="$1" body="$2" existing
  existing=$(gh issue list --repo "$REPO" --state open --limit 200 \
    --json number,title --jq "map(select(.title==\"$title\")) | .[0].number // empty")
  if [ -n "$existing" ]; then
    gh issue comment "$existing" --repo "$REPO" --body "$body" >/dev/null
    echo "updated #$existing — $title"
  else
    gh issue create --repo "$REPO" --title "$title" --body "$body" >/dev/null
    echo "opened — $title"
  fi
}

# 1) Open/update an issue for every currently-stale game.
jq -c '.stale[]' "$JSON" | while read -r g; do
  name=$(jq -r '.name'      <<<"$g")
  latest=$(jq -r '.latest'  <<<"$g")
  due=$(jq -r '.due'        <<<"$g")
  days=$(jq -r '.daysLate'  <<<"$g")
  miss=$(jq -r '.missing | join(", ")' <<<"$g")
  oldest=$(jq -r '.missing[-1]' <<<"$g")
  title="$PREFIX $name (missing $oldest)"
  body=$(printf '**%s** data is stale — the daily scrape has not appended a real draw.\n\n- Newest stored draw: `%s`\n- Most recent draw that is due: `%s` (%s days behind)\n- Missing draw date(s): %s\n\nJudged from the committed DB by `audit_site.py --freshness`, which does **not** trust the scrape exit code. The watchdog re-dispatches the data workflows to self-heal; this issue auto-closes once the missing draw lands. If it persists across cycles, the upstream source likely changed — check the scraper.' \
    "$name" "$latest" "$due" "$days" "$miss")
  open_or_comment "$title" "$body"
done

# 2) Auto-close any previously-open staleness issue whose game has recovered.
gh issue list --repo "$REPO" --state open --limit 200 --json number,title \
  --jq ".[] | select(.title | startswith(\"$PREFIX\")) | \"\(.number)\t\(.title)\"" \
  | while IFS=$'\t' read -r num title; do
      still_stale=false
      for t in ${desired_titles[@]+"${desired_titles[@]}"}; do
        [ "$t" = "$title" ] && { still_stale=true; break; }
      done
      if [ "$still_stale" = false ]; then
        gh issue comment "$num" --repo "$REPO" \
          --body "✅ Recovered — the missing draw(s) have landed. Auto-closing." >/dev/null
        gh issue close "$num" --repo "$REPO" >/dev/null
        echo "closed #$num — $title"
      fi
    done
