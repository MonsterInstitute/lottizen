"""ci_report.py — make scrape problems visible at the workflow level.

Scrapers keep last-good data on failure by design, so a broken source used to
leave a green run and surface only when the freshness watchdog noticed stale
data, sometimes days later. These helpers put the problem where it is seen
the same day:

  annotate()  a GitHub Actions ::error:: / ::warning:: line, which shows on
              the run's summary page and in the PR/commit checks UI
  summary()   markdown appended to the run summary ($GITHUB_STEP_SUMMARY)

Outside Actions they print plain text, so local runs read the same.

The scraper then exits non-zero when its failure threshold is crossed. Each
daily workflow runs the scrape step with continue-on-error (publish, deploy
and emails still run on last-good data) and fails the job at the very end if
the scrape step failed, which makes ci-failure-alert.yml open an issue.
"""
from __future__ import annotations

import os
import sys

IN_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"


def annotate(level: str, title: str, message: str) -> None:
    """level: 'error' | 'warning' | 'notice'."""
    message = message.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    if IN_ACTIONS:
        print(f"::{level} title={title}::{message}", flush=True)
    else:
        print(f"[{level.upper()}] {title}: {message}", file=sys.stderr, flush=True)


def summary(markdown: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as f:
            f.write(markdown.rstrip() + "\n\n")
    else:
        print(markdown, flush=True)
