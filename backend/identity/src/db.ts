import { Pool, type QueryResultRow } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export interface AuditContext {
  actorRole?: string | null;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  previousValue: unknown,
  newValue: unknown,
  context: AuditContext = {}
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, previous_value, new_value, actor_role, reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      actorId, action, entityType, entityId, previousValue, newValue,
      context.actorRole ?? null, context.reason ?? null, context.ip ?? null, context.userAgent ?? null,
    ]
  );
}
