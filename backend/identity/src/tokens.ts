import { createHash, randomBytes } from "node:crypto";
import { query } from "./db";
import type { Role } from "./types";

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface RefreshResult {
  userId: string;
  sessionId: string | null;
  email: string;
  name: string;
  role: Role;
  refreshToken: string;
}

// Phát refresh token mới (opaque 256-bit); DB chỉ lưu SHA-256 hash.
export async function issueRefreshToken(userId: string, sessionId: string | null): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await query(
    `INSERT INTO refresh_tokens(user_id,session_id,token_hash,expires_at)
     VALUES($1,$2,$3,now()+($4||' days')::interval)`,
    [userId, sessionId, sha256(token), String(REFRESH_TTL_DAYS)],
  );
  return token;
}

// Rotation: token cũ bị thu hồi, phát token mới, ghi replaced_by.
// Nếu token đã bị thu hồi mà vẫn được dùng lại (reuse) → thu hồi toàn bộ token của user.
export async function rotateRefreshToken(token: string): Promise<RefreshResult | "REUSED" | null> {
  const tokenHash = sha256(token);
  const rows = await query<{
    id: string; user_id: string; session_id: string | null; revoked_at: string | null;
    expired: boolean; email: string; name: string; role: Role; status: string;
  }>(
    `SELECT t.id,t.user_id,t.session_id,t.revoked_at,(t.expires_at<=now()) AS expired,
            u.email,u.name,u.role,COALESCE(u.status::text,'ACTIVE') AS status
     FROM refresh_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) {
    // Phát hiện reuse: thu hồi cả chuỗi token của user để chặn kẻ đánh cắp.
    await query("UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [row.user_id]);
    return "REUSED";
  }
  if (row.expired || row.status !== "ACTIVE") return null;
  const newToken = randomBytes(32).toString("hex");
  const inserted = await query<{ id: string }>(
    `INSERT INTO refresh_tokens(user_id,session_id,token_hash,expires_at)
     VALUES($1,$2,$3,now()+($4||' days')::interval) RETURNING id`,
    [row.user_id, row.session_id, sha256(newToken), String(REFRESH_TTL_DAYS)],
  );
  await query("UPDATE refresh_tokens SET revoked_at=now(),replaced_by=$2 WHERE id=$1", [row.id, inserted[0].id]);
  return { userId: row.user_id, sessionId: row.session_id, email: row.email, name: row.name, role: row.role, refreshToken: newToken };
}

export async function revokeRefreshToken(token: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    "UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING user_id",
    [sha256(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await query("UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
}
