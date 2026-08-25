#!/usr/bin/env bash
# health_issues.sh <prefix> <problems.json> — generic version of
# freshness_issues.sh for any health-check script that emits a flat
# [{"title": "...", "body": "..."}] problems list (scripts/seo_health.py,
# scripts/billing_health.py). Opens/updates one issue per problem, idempotent
# by exact title, and auto-closes any previously-open issue under this
# prefix that's no longer in the current problems list. Requires: gh
# (authenticated via GH_TOKEN), jq, GITHUB_REPOSITORY.
set -euo pipefail

PREFIX="${1:?usage: health_issues.sh <prefix> <problems.json>}"
JSON="${2:?usage: health_issues.sh <prefix> <problems.json>}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"

desired_titles=()
while IFS= read -r line; do
  desired_titles+=("$line")
done < <(jq -r '.[].title' "$JSON")

# 1) Open/update an issue for every current problem.
jq -c '.[]' "$JSON" | while read -r p; do
  title=$(jq -r '.title' <<<"$p")
  body=$(jq -r '.body' <<<"$p")
  existing=$(gh issue list --repo "$REPO" --state open --limit 200 \
    --json number,title --jq "map(select(.title==\"$title\")) | .[0].number // empty")
  if [ -n "$existing" ]; then
    gh issue comment "$existing" --repo "$REPO" --body "$body" >/dev/null
    echo "updated #$existing — $title"
  else
    gh issue create --repo "$REPO" --title "$title" --body "$body" >/dev/null
    echo "opened — $title"
  fi
done

# 2) Auto-close any previously-open issue under this prefix that has recovered.
gh issue list --repo "$REPO" --state open --limit 200 --json number,title \
  --jq ".[] | select(.title | startswith(\"$PREFIX\")) | \"\(.number)\t\(.title)\"" \
  | while IFS=$'\t' read -r num title; do
      still=false
      for t in ${desired_titles[@]+"${desired_titles[@]}"}; do
        [ "$t" = "$title" ] && { still=true; break; }
      done
      if [ "$still" = false ]; then
        gh issue comment "$num" --repo "$REPO" \
          --body "✅ Recovered on the next run. Auto-closing." >/dev/null
        gh issue close "$num" --repo "$REPO" >/dev/null
        echo "closed #$num — $title"
      fi
    done
