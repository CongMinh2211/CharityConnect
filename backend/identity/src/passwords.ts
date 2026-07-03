import bcrypt from "bcryptjs";
import { query } from "./db";

const HISTORY_DEPTH = 5;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// Chặn dùng lại 1 trong 5 mật khẩu gần nhất (kể cả mật khẩu hiện tại).
export async function isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
  const rows = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id=$1
     UNION ALL
     (SELECT password_hash FROM password_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2)`,
    [userId, HISTORY_DEPTH],
  );
  for (const row of rows) {
    if (await bcrypt.compare(newPassword, row.password_hash)) return true;
  }
  return false;
}

// Lưu hash cũ vào lịch sử rồi cập nhật hash mới trong 1 lần gọi.
export async function updatePasswordWithHistory(userId: string, newHash: string): Promise<void> {
  await query(
    `WITH old AS (SELECT password_hash FROM users WHERE id=$1),
     archived AS (INSERT INTO password_history(user_id,password_hash) SELECT $1,password_hash FROM old)
     UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1`,
    [userId, newHash],
  );
}

export interface LockState { locked: boolean; remainingMinutes: number }

export async function checkLock(userId: string): Promise<LockState> {
  const rows = await query<{ remaining: string | null }>(
    `SELECT CASE WHEN locked_until IS NOT NULL AND locked_until>now()
       THEN ceil(extract(epoch FROM locked_until-now())/60)::text ELSE NULL END AS remaining
     FROM users WHERE id=$1`,
    [userId],
  );
  const remaining = rows[0]?.remaining;
  return { locked: remaining !== null && remaining !== undefined, remainingMinutes: Number(remaining ?? 0) };
}

// Trả về true nếu lần thất bại này khiến tài khoản bị khóa.
export async function registerFailedLogin(userId: string): Promise<boolean> {
  const rows = await query<{ failed_login_count: number }>(
    `UPDATE users SET failed_login_count=failed_login_count+1,
       locked_until=CASE WHEN failed_login_count+1>=$2 THEN now()+($3||' minutes')::interval ELSE locked_until END
     WHERE id=$1 RETURNING failed_login_count`,
    [userId, MAX_FAILED_LOGINS, String(LOCKOUT_MINUTES)],
  );
  return (rows[0]?.failed_login_count ?? 0) >= MAX_FAILED_LOGINS;
}

export async function resetFailedLogins(userId: string): Promise<void> {
  await query("UPDATE users SET failed_login_count=0,locked_until=NULL WHERE id=$1", [userId]);
}
