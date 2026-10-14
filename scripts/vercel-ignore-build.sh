#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 skips the build, exit 1 builds.
# Only non-main branches are skipped. Every main build goes ahead — including
# redeploys of the same commit, because that is what the deploy hook does when
# site_json changes (scripts/trigger-deploy-if-changed.mjs), and docs-only
# commits are not skipped either for the same reason (a hook deploy of a
# docs-only HEAD must still rebuild with the new data).
# Build only main and CLI deploys (empty ref). Git deploys of every other
# branch are off in vercel.json (git.deploymentEnabled); this case is the second lock.
case "${VERCEL_GIT_COMMIT_REF:-}" in
  ""|main) ;;
  *) echo "Skip: branch $VERCEL_GIT_COMMIT_REF is not main"; exit 0 ;;
esac
echo "Build"; exit 1
