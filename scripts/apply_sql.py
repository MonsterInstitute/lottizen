#!/usr/bin/env python3
"""Run a .sql file against the Supabase Postgres, via whichever channel is available.

DDL (CREATE TABLE, RLS, REVOKE, setval) cannot go through the service-role REST
key — PostgREST has no raw-SQL path. This helper uses, in priority order:

  1. Management API  — if SUPABASE_ACCESS_TOKEN (a personal access token, sbp_…)
     is set. POSTs the SQL to /v1/projects/{ref}/database/query. Preferred:
     revocable, no DB password needed.
  2. Direct Postgres — if a connection string is in .env.migrate (git-ignored).
     Uses psycopg.

Usage:
    export SUPABASE_ACCESS_TOKEN=sbp_...          # OR put a conn string in .env.migrate
    python scripts/apply_sql.py supabase/migrations/0001_init.sql
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = ROOT / ".env.local"
ENV_MIGRATE = ROOT / ".env.migrate"


def load_env(path: Path) -> None:
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def project_ref() -> str:
    url = os.environ.get("SUPABASE_URL", "")
    m = re.search(r"https://([a-z0-9]+)\.supabase\.co", url)
    if not m:
        sys.exit("✗ Could not derive project ref from SUPABASE_URL.")
    return m.group(1)


def run_via_management_api(sql: str, token: str) -> None:
    import json
    import ssl
    import urllib.request

    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()

    ref = project_ref()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json",
                 "User-Agent": "lottizen-migrate/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            print(f"✓ Management API applied SQL (HTTP {resp.status}).")
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ Management API error {e.code}: {e.read().decode()[:300]}")


def run_via_psycopg(sql: str) -> None:
    conn_text = ENV_MIGRATE.read_text() if ENV_MIGRATE.exists() else ""
    m = re.search(r"postgres(?:ql)?://[^\s\"']+", conn_text)
    if not m:
        sys.exit("✗ No SUPABASE_ACCESS_TOKEN and no postgres:// URL in .env.migrate.")
    try:
        import psycopg
    except ImportError:
        sys.exit('✗ psycopg not installed. Run: pip install "psycopg[binary]"')
    with psycopg.connect(m.group(0), autocommit=True) as pg:
        pg.execute(sql)
    print("✓ Applied SQL via direct Postgres connection.")


def main() -> int:
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/apply_sql.py <file.sql>")
    sql = Path(sys.argv[1]).read_text()
    load_env(ENV_LOCAL)

    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if token:
        run_via_management_api(sql, token)
    else:
        run_via_psycopg(sql)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
