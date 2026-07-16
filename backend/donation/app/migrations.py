from __future__ import annotations

import os
from pathlib import Path
from typing import Any


async def run_migrations(pool: Any) -> None:
    if os.getenv("AUTO_MIGRATE_DB") == "0" or not hasattr(pool, "execute"):
        return
    sql_dir = Path(__file__).resolve().parents[1] / "sql"
    if not sql_dir.exists():
        return
    await pool.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    )
    for file in sorted(sql_dir.glob("[0-9]*.sql")):
        applied = await pool.fetchval("SELECT 1 FROM schema_migrations WHERE version=$1", file.name)
        if applied:
            continue
        await pool.execute(file.read_text(encoding="utf-8"))
        await pool.execute("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING", file.name)
        print(f"donation-migration:{file.name}", flush=True)
