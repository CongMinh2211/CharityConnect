import { Pool, type QueryResultRow } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(text, values)).rows;
}
export async function audit(actorId: string | null, action: string, entityId: string, previousValue: unknown, newValue: unknown): Promise<void> {
  await pool.query(
    "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,previous_value,new_value) VALUES($1,$2,'CAMPAIGN',$3,$4,$5)",
    [actorId, action, entityId, previousValue, newValue]
  );
}

