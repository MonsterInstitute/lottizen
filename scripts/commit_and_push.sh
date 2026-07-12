#!/usr/bin/env bash
# commit_and_push.sh — commit refreshed data and push to main, resilient to the
# race where several daily data workflows push near-simultaneously (they all
# accumulate into the shared binary data/lottizen.db, so a plain push loses and,
# worse, a rebase hits an unmergeable binary conflict).
#
# Strategy: commit once, then loop: fetch + rebase onto origin/main.
#   - rebase clean  -> push; on a lost race (push rejected) back off and retry.
#   - rebase conflict (concurrent lottizen.db write) -> reset HARD to origin/main
#     (which already has the other workflow's changes) and REPLAY our pipeline via
#     $REGEN_CMD so our draws append on top, then re-commit. Append-only scrapers +
#     deterministic stats make this safe and convergent.
#
# Inputs (env):
#   COMMIT_MSG      commit message
#   REGEN_CMD       shell command to regenerate data on top of latest origin
#   GIT_ADD_PATHS   paths to stage (space-separated)
set -uo pipefail

msg="${COMMIT_MSG:?COMMIT_MSG required}"
regen="${REGEN_CMD:?REGEN_CMD required}"
paths="${GIT_ADD_PATHS:?GIT_ADD_PATHS required}"

# Commit as the project owner's Vercel-recognized email. Vercel blocks production
# deployments whose git author isn't a recognized team member, so commits authored
# by an unrecognized "bot@lottizen.ca" were created BLOCKED and never built — the
# live site silently froze between human commits. Keeping the display name as the
# bot but using the owner's email lets Vercel resolve the author and build.
git config user.name "lottizen-bot"
git config user.email "l3rundong@gmail.com"

git add $paths
if git diff --staged --quiet; then
  echo "No data changes to commit."
  exit 0
fi
git commit -q -m "$msg"

for attempt in 1 2 3 4 5; do
  git fetch -q origin main || { echo "fetch failed (attempt $attempt)"; sleep $((attempt * 3)); continue; }
  if git rebase -q origin/main; then
    if git push -q origin HEAD:main; then
      echo "✓ pushed on attempt $attempt"
      exit 0
    fi
    echo "push rejected (someone pushed first) — retry $attempt after backoff"
    sleep $((attempt * 3))
  else
    echo "rebase conflict from a concurrent data write — replaying pipeline on latest origin"
    git rebase --abort 2>/dev/null || true
    git reset -q --hard origin/main
    eval "$regen"
    git add $paths
    if git diff --staged --quiet; then
      echo "No changes after replay (already current)."
      exit 0
    fi
    git commit -q -m "$msg"
  fi
done

echo "::error::commit_and_push exhausted retries — data NOT pushed"
exit 1
