import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "./auth";
import { audit, query } from "./db";
import { isPasswordReused, updatePasswordWithHistory } from "./passwords";
import { revokeAllRefreshTokens } from "./tokens";
import type { AuthRequest, Role } from "./types";

const profileSchema = z.object({ name: z.string().trim().min(2).max(120) });
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});
const resetRequestSchema = z.object({ email: z.string().email() });
const resetConfirmSchema = z.object({ token: z.string().min(32).max(256), new_password: z.string().min(8).max(128) });
const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
  reason: z.string().trim().max(500).optional(),
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const accountRouter = Router();

accountRouter.patch("/profile", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const before = (await query<{ id: string; email: string; name: string; role: Role }>(
      "SELECT id,email,name,role FROM users WHERE id=$1",
      [req.user!.sub],
    ))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    const rows = await query<{ id: string; email: string; name: string; role: Role }>(
      "UPDATE users SET name=$1,updated_at=now() WHERE id=$2 RETURNING id,email,name,role",
      [input.name, req.user!.sub],
    );
    await audit(req.user!.sub, "PROFILE_UPDATED", "USER", req.user!.sub, { name: before.name }, { name: rows[0].name });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

accountRouter.post("/auth/change-password", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const rows = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [req.user!.sub]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(input.current_password, user.password_hash))) {
      res.status(401).json({ message: "Mật khẩu hiện tại không đúng" });
      return;
    }
    if (await isPasswordReused(req.user!.sub, input.new_password)) {
      res.status(409).json({ message: "Mật khẩu mới không được trùng 5 mật khẩu gần nhất" });
      return;
    }
    const passwordHash = await bcrypt.hash(input.new_password, 12);
    await updatePasswordWithHistory(req.user!.sub, passwordHash);
    await query(
      "UPDATE account_sessions SET revoked_at=now() WHERE user_id=$1 AND ($2::uuid IS NULL OR id<>$2) AND revoked_at IS NULL",
      [req.user!.sub, req.user!.session_id ?? null],
    );
    await revokeAllRefreshTokens(req.user!.sub);
    await audit(req.user!.sub, "PASSWORD_CHANGED", "USER", req.user!.sub, null, { sessions_revoked: "OTHER_ACTIVE_SESSIONS" }, {
      actorRole: req.user!.role, ip: req.ip, userAgent: req.headers["user-agent"] as string | undefined,
    });
    res.json({ message: "Đã đổi mật khẩu. Các phiên khác đã bị thu hồi." });
  } catch (error) { next(error); }
});

accountRouter.post("/auth/password-reset/request", async (req, res, next) => {
  try {
    const input = resetRequestSchema.parse(req.body);
    const users = await query<{ id: string; email: string; name: string }>(
      "SELECT id,email,name FROM users WHERE email=$1 AND COALESCE(status::text,'ACTIVE')='ACTIVE'",
      [input.email.toLowerCase()],
    );
    const user = users[0];
    if (user) {
      const token = randomBytes(32).toString("hex");
      const inserted = await query<{ id: string }>(
        `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
         VALUES($1,$2,now()+interval '30 minutes') RETURNING id`,
        [user.id, sha256(token)],
      );
      const resetPath = `/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
      await query(
        `INSERT INTO email_outbox(event_id,template,recipient_user_id,payload)
         VALUES($1,'PASSWORD_RESET',$2,$3::jsonb)
         ON CONFLICT(event_id,template) DO NOTHING`,
        [inserted[0]?.id ?? sha256(token), user.id, JSON.stringify({ reset_path: resetPath, expires_minutes: 30 })],
      );
      await audit(user.id, "PASSWORD_RESET_REQUESTED", "USER", user.id, null, { delivery: "QUEUED" });
    }
    res.json({ message: "Nếu email tồn tại, hệ thống đã gửi hướng dẫn đặt lại mật khẩu." });
  } catch (error) { next(error); }
});

accountRouter.post("/auth/password-reset/confirm", async (req, res, next) => {
  try {
    const input = resetConfirmSchema.parse(req.body);
    const tokenHash = sha256(input.token);
    const rows = await query<{ id: string; user_id: string }>(
      `SELECT id,user_id FROM password_reset_tokens
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()`,
      [tokenHash],
    );
    const tokenRow = rows[0];
    if (!tokenRow) { res.status(400).json({ message: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn" }); return; }
    if (await isPasswordReused(tokenRow.user_id, input.new_password)) {
      res.status(409).json({ message: "Mật khẩu mới không được trùng 5 mật khẩu gần nhất" });
      return;
    }
    const passwordHash = await bcrypt.hash(input.new_password, 12);
    await updatePasswordWithHistory(tokenRow.user_id, passwordHash);
    await query("UPDATE password_reset_tokens SET used_at=now() WHERE id=$1", [tokenRow.id]);
    await query("UPDATE account_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [tokenRow.user_id]);
    await revokeAllRefreshTokens(tokenRow.user_id);
    await audit(tokenRow.user_id, "PASSWORD_RESET_CONFIRMED", "USER", tokenRow.user_id, null, { sessions_revoked: "ALL" });
    res.json({ message: "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại." });
  } catch (error) { next(error); }
});

accountRouter.get("/sessions", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const rows = await query(
      `SELECT id,user_agent,ip_address,created_at,last_seen_at,expires_at,revoked_at,
              (id=$2::uuid) AS current
       FROM account_sessions WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user!.sub, req.user!.session_id ?? null],
    );
    res.json(rows);
  } catch (error) { next(error); }
});

accountRouter.delete("/sessions", authenticate, async (req: AuthRequest, res, next) => {
  try {
    await query("UPDATE account_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [req.user!.sub]);
    await audit(req.user!.sub, "SESSION_REVOKED", "USER", req.user!.sub, null, { scope: "ALL" });
    res.json({ message: "Đã đăng xuất tất cả phiên" });
  } catch (error) { next(error); }
});

accountRouter.delete("/sessions/:id", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const rows = await query(
      "UPDATE account_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id",
      [req.params.id, req.user!.sub],
    );
    if (!rows[0]) { res.status(404).json({ message: "Không tìm thấy phiên đăng nhập" }); return; }
    await audit(req.user!.sub, "SESSION_REVOKED", "SESSION", String(req.params.id), null, { scope: "ONE" });
    res.json({ message: "Đã thu hồi phiên" });
  } catch (error) { next(error); }
});

accountRouter.get("/me/audit-logs", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).default(30).parse(req.query.limit);
    const rows = await query(
      `SELECT id,actor_id,action,entity_type,entity_id,previous_value,new_value,created_at,'IDENTITY' AS service
       FROM audit_logs WHERE actor_id=$1::uuid OR entity_id=$1::text
       ORDER BY created_at DESC LIMIT $2`,
      [req.user!.sub, limit],
    );
    res.json(rows);
  } catch (error) { next(error); }
});

accountRouter.get("/admin/users", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const role = z.enum(["DONOR", "ORGANIZATION", "ADMIN"]).optional().parse(req.query.role);
    const status = z.enum(["ACTIVE", "DISABLED"]).optional().parse(req.query.status);
    const rows = await query(
      `SELECT id,email,name,role,COALESCE(status::text,'ACTIVE') AS status,created_at,updated_at
       FROM users
       WHERE ($1::user_role IS NULL OR role=$1) AND ($2::user_status IS NULL OR status=$2)
       ORDER BY created_at DESC`,
      [role ?? null, status ?? null],
    );
    res.json(rows);
  } catch (error) { next(error); }
});

accountRouter.patch("/admin/users/:id/status", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const input = userStatusSchema.parse(req.body);
    if (input.status === "DISABLED" && !input.reason) {
      res.status(400).json({ message: "Cần nhập lý do khóa tài khoản" });
      return;
    }
    if (req.params.id === req.user!.sub && input.status === "DISABLED") {
      res.status(409).json({ message: "Không thể tự khóa tài khoản quản trị đang dùng" });
      return;
    }
    const before = (await query("SELECT id,email,name,role,COALESCE(status::text,'ACTIVE') AS status FROM users WHERE id=$1", [req.params.id]))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    const rows = await query(
      "UPDATE users SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,email,name,role,status,created_at,updated_at",
      [input.status, req.params.id],
    );
    if (input.status === "DISABLED") {
      await query("UPDATE account_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [req.params.id]);
      await revokeAllRefreshTokens(String(req.params.id));
    }
    await audit(req.user!.sub, input.status === "DISABLED" ? "USER_DISABLED" : "USER_ENABLED", "USER", String(req.params.id), before, rows[0], {
      actorRole: req.user!.role, reason: input.reason, ip: req.ip, userAgent: req.headers["user-agent"] as string | undefined,
    });
    res.json(rows[0]);
  } catch (error) { next(error); }
});
