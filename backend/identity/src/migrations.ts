import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db";

export async function runMigrations(): Promise<void> {
  if (process.env.AUTO_MIGRATE_DB === "0") return;
  const sqlDir = path.resolve(__dirname, "../sql");
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const files = (await readdir(sqlDir)).filter((file) => /^\d+.*\.sql$/i.test(file)).sort();
  for (const file of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE version=$1", [file]);
    if (applied.rowCount) continue;
    const sql = await readFile(path.join(sqlDir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING", [file]);
    process.stdout.write(`identity-migration:${file}\n`);
  }
}
