import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "./auth";
import { audit, query } from "./db";
import { isPasswordReused, updatePasswordWithHistory } from "./passwords";
import { revokeAllRefreshTokens } from "./tokens";
import { rateLimit } from "./rateLimit";
import type { AuthRequest, Role } from "./types";

// Chống lạm dụng đặt lại mật khẩu (dò email / spam gửi mail) theo IP.
const resetRequestLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, scope: "pwd-reset-request", message: "Bạn yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau." });
const resetConfirmLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, scope: "pwd-reset-confirm", message: "Quá nhiều lần thử. Vui lòng thử lại sau." });

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,18}$/, "Số điện thoại không hợp lệ").optional().nullable(),
  province: z.string().trim().min(2).max(120).optional().nullable(),
  address: z.string().trim().min(4).max(300).optional().nullable(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải có dạng YYYY-MM-DD").optional().nullable(),
  organization_name: z.string().trim().min(2).max(200).optional().nullable(),
});
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});
const setPasswordSchema = z.object({ new_password: z.string().min(8).max(128) });
const resetRequestSchema = z.object({ email: z.string().email() });
const resetConfirmSchema = z.object({ token: z.string().min(32).max(256), new_password: z.string().min(8).max(128) });
const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
  reason: z.string().trim().max(500).optional(),
});
const adminProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  reason: z.string().trim().min(3).max(500),
}).refine((input) => input.name !== undefined || input.email !== undefined, {
  message: "Cần cung cấp tên hoặc email cần cập nhật",
});
const adminPasswordResetSchema = z.object({ reason: z.string().trim().min(3).max(500) });

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const accountRouter = Router();

accountRouter.patch("/profile", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const before = (await query<{ id: string; email: string; name: string; role: Role; phone: string | null; province: string | null; address: string | null; date_of_birth: string | null; organization_name: string | null }>(
      "SELECT id,email,name,role,phone,province,address,date_of_birth,organization_name FROM users WHERE id=$1",
      [req.user!.sub],
    ))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    const rows = await query<{ id: string; email: string; name: string; role: Role; phone: string | null; province: string | null; address: string | null; date_of_birth: string | null; organization_name: string | null }>(
      `UPDATE users SET name=$1,phone=COALESCE($2,phone),province=COALESCE($3,province),address=COALESCE($4,address),
       date_of_birth=COALESCE($5,date_of_birth),organization_name=COALESCE($6,organization_name),updated_at=now()
       WHERE id=$7 RETURNING id,email,name,role,phone,province,address,date_of_birth,organization_name`,
      [input.name, input.phone ?? null, input.province ?? null, input.address ?? null, input.date_of_birth ?? null, input.organization_name ?? null, req.user!.sub],
    );
    const updatedFields = Object.keys(input).filter((key) => key !== "name" && input[key as keyof typeof input] !== undefined);
    await audit(req.user!.sub, "PROFILE_UPDATED", "USER", req.user!.sub, { fields: ["name"] }, { fields: ["name", ...updatedFields] });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

accountRouter.post("/auth/change-password", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const rows = await query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id=$1", [req.user!.sub]);
    const user = rows[0];
    if (!user?.password_hash) {
      res.status(409).json({ message: "Tài khoản Google chưa có mật khẩu. Hãy dùng chức năng Quên mật khẩu để tạo mật khẩu đầu tiên." });
      return;
    }
    if (!(await bcrypt.compare(input.current_password, user.password_hash))) {
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

// Google cung cấp bằng chứng đăng nhập, không cung cấp mật khẩu cho CharityConnect.
// Người dùng Google đã xác thực có thể tự tạo mật khẩu cục bộ; DB chỉ lưu bcrypt hash.
accountRouter.post("/auth/set-password", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const input = setPasswordSchema.parse(req.body);
    const user = (await query<{ password_hash: string | null; google_connected: boolean }>(
      "SELECT password_hash,(google_subject IS NOT NULL) AS google_connected FROM users WHERE id=$1",
      [req.user!.sub],
    ))[0];
    if (!user) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    if (!user.google_connected) {
      res.status(409).json({ message: "Chức năng này chỉ dùng để tạo mật khẩu cục bộ lần đầu cho tài khoản Google." });
      return;
    }
    if (user.password_hash) {
      res.status(409).json({ message: "Tài khoản đã có mật khẩu. Hãy dùng chức năng đổi mật khẩu." });
      return;
    }
    const passwordHash = await bcrypt.hash(input.new_password, 12);
    const rows = await query<{ id: string }>(
      `WITH updated AS (
         UPDATE users SET password_hash=$1,updated_at=now()
         WHERE id=$2 AND google_subject IS NOT NULL AND password_hash IS NULL
         RETURNING id
       ), logged AS (
         INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,new_value,actor_role,ip_address,user_agent)
         SELECT $2,'LOCAL_PASSWORD_CREATED','USER',id::text,
                jsonb_build_object('provider','LOCAL_PASSWORD'),$3,$4,$5 FROM updated
       )
       SELECT id FROM updated`,
      [passwordHash, req.user!.sub, req.user!.role, req.ip, req.headers["user-agent"] ?? null],
    );
    if (!rows[0]) { res.status(409).json({ message: "Mật khẩu cục bộ đã được tạo ở một phiên khác." }); return; }
    res.status(201).json({ message: "Đã tạo mật khẩu đăng nhập CharityConnect. Mật khẩu Google không được lưu trong hệ thống." });
  } catch (error) { next(error); }
});

accountRouter.post("/auth/password-reset/request", resetRequestLimiter, async (req, res, next) => {
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

accountRouter.post("/auth/password-reset/confirm", resetConfirmLimiter, async (req, res, next) => {
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
    const limit = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.limit);
    const offset = z.coerce.number().int().min(0).default(0).parse(req.query.offset);
    const totalRows = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users
       WHERE ($1::user_role IS NULL OR role=$1) AND ($2::user_status IS NULL OR status=$2)`,
      [role ?? null, status ?? null],
    );
    const rows = await query(
      `SELECT u.id,u.email,u.name,u.role,COALESCE(u.status::text,'ACTIVE') AS status,u.created_at,u.updated_at,
              (u.google_subject IS NOT NULL) AS google_connected,
              (u.password_hash IS NOT NULL) AS has_local_password,
              CASE
                WHEN u.google_subject IS NOT NULL AND u.password_hash IS NOT NULL THEN 'GOOGLE_AND_PASSWORD'
                WHEN u.google_subject IS NOT NULL THEN 'GOOGLE'
                ELSE 'PASSWORD'
              END AS auth_provider,
              (SELECT count(*)::int FROM account_sessions s
               WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>now()) AS active_session_count,
              EXISTS(SELECT 1 FROM account_sessions s
               WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>now()
                 AND s.last_seen_at>=now()-interval '15 minutes') AS is_online,
              (SELECT max(s.last_seen_at) FROM account_sessions s WHERE s.user_id=u.id) AS last_login_at
       FROM users u
       WHERE ($1::user_role IS NULL OR u.role=$1) AND ($2::user_status IS NULL OR u.status=$2)
       ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`,
      [role ?? null, status ?? null, limit, offset],
    );
    res.setHeader("X-Total-Count", totalRows[0]?.count ?? "0");
    res.json(rows);
  } catch (error) { next(error); }
});

// Admin chỉ được sửa tên/email đăng nhập, không được đổi role hay xem password hash.
// Nếu email đổi, tất cả session và refresh token bị thu hồi nguyên tử trong cùng câu lệnh SQL.
accountRouter.patch("/admin/users/:id/profile", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const input = adminProfileSchema.parse(req.body);
    const rows = await query<{
      id: string; email: string; name: string; role: Role; status: string;
      google_connected: boolean; has_local_password: boolean; auth_provider: string;
      revoked_session_count: number; revoked_refresh_token_count: number;
    }>(
      `WITH previous_user AS MATERIALIZED (
         SELECT id,email,name,role,COALESCE(status::text,'ACTIVE') AS status,
                google_subject,password_hash FROM users WHERE id=$3 FOR UPDATE
       ), updated_user AS (
         UPDATE users u SET name=COALESCE($1,u.name),email=COALESCE($2,u.email),updated_at=now()
         FROM previous_user p WHERE u.id=p.id
         RETURNING u.id,u.email,u.name,u.role,COALESCE(u.status::text,'ACTIVE') AS status,
                   u.google_subject,u.password_hash,u.created_at,u.updated_at
       ), revoked_sessions AS (
         UPDATE account_sessions s SET revoked_at=now()
         FROM previous_user p,updated_user u
         WHERE s.user_id=u.id AND s.revoked_at IS NULL AND p.email IS DISTINCT FROM u.email
         RETURNING s.id
       ), revoked_tokens AS (
         UPDATE refresh_tokens t SET revoked_at=now()
         FROM previous_user p,updated_user u
         WHERE t.user_id=u.id AND t.revoked_at IS NULL AND p.email IS DISTINCT FROM u.email
         RETURNING t.id
       ), logged AS (
         INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,previous_value,new_value,actor_role,reason,ip_address,user_agent)
         SELECT $4,'USER_PROFILE_UPDATED_BY_ADMIN','USER',u.id::text,
                jsonb_build_object('email',p.email,'name',p.name,'role',p.role,'status',p.status),
                jsonb_build_object('email',u.email,'name',u.name,'role',u.role,'status',u.status),
                $5,$6,$7,$8
         FROM previous_user p JOIN updated_user u ON u.id=p.id
       )
       SELECT u.id,u.email,u.name,u.role,u.status,u.created_at,u.updated_at,
              (u.google_subject IS NOT NULL) AS google_connected,
              (u.password_hash IS NOT NULL) AS has_local_password,
              CASE WHEN u.google_subject IS NOT NULL AND u.password_hash IS NOT NULL THEN 'GOOGLE_AND_PASSWORD'
                   WHEN u.google_subject IS NOT NULL THEN 'GOOGLE' ELSE 'PASSWORD' END AS auth_provider,
              (SELECT count(*)::int FROM revoked_sessions) AS revoked_session_count,
              (SELECT count(*)::int FROM revoked_tokens) AS revoked_refresh_token_count
       FROM updated_user u`,
      [input.name ?? null, input.email ?? null, req.params.id, req.user!.sub, req.user!.role,
        input.reason, req.ip, req.headers["user-agent"] ?? null],
    );
    const user = rows[0];
    if (!user) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    res.json(user);
  } catch (error) { next(error); }
});

// Admin chỉ khởi tạo email đặt lại mật khẩu. Token và mật khẩu không được trả về cho admin.
// Tài khoản Google có thể dùng liên kết này để tạo mật khẩu cục bộ đầu tiên.
accountRouter.post("/admin/users/:id/password-reset", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const input = adminPasswordResetSchema.parse(req.body);
    const token = randomBytes(32).toString("hex");
    const resetPath = `/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
    const rows = await query<{
      id: string; email: string; name: string; role: Role; status: string;
      google_connected: boolean; has_local_password: boolean;
    }>(
      `WITH target AS MATERIALIZED (
         SELECT id,email,name,role,COALESCE(status::text,'ACTIVE') AS status,
                google_subject,password_hash FROM users WHERE id=$1 FOR UPDATE
       ), invalidated AS (
         UPDATE password_reset_tokens r SET used_at=now()
         FROM target t WHERE r.user_id=t.id AND r.used_at IS NULL RETURNING r.id
       ), created AS (
         INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
         SELECT id,$2,now()+interval '30 minutes' FROM target RETURNING id,user_id
       ), queued AS (
         INSERT INTO email_outbox(event_id,template,recipient_user_id,payload)
         SELECT c.id::text,'PASSWORD_RESET',c.user_id,
                jsonb_build_object('reset_path',$3::text,'expires_minutes',30,'requested_by_admin',true)
         FROM created c
       ), logged AS (
         INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,new_value,actor_role,reason,ip_address,user_agent)
         SELECT $4,'ADMIN_PASSWORD_RESET_QUEUED','USER',t.id::text,
                jsonb_build_object('delivery','QUEUED','creates_local_password',t.password_hash IS NULL),
                $5,$6,$7,$8 FROM target t JOIN created c ON c.user_id=t.id
       )
       SELECT t.id,t.email,t.name,t.role,t.status,
              (t.google_subject IS NOT NULL) AS google_connected,
              (t.password_hash IS NOT NULL) AS has_local_password
       FROM target t JOIN created c ON c.user_id=t.id`,
      [req.params.id, sha256(token), resetPath, req.user!.sub, req.user!.role,
        input.reason, req.ip, req.headers["user-agent"] ?? null],
    );
    const user = rows[0];
    if (!user) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    res.status(202).json({
      message: "Đã gửi liên kết đặt lại mật khẩu đến email của người dùng.",
      delivery: "QUEUED",
      password_setup_required: !user.has_local_password,
      user,
    });
  } catch (error) { next(error); }
});

// Đăng xuất khẩn cấp mọi thiết bị mà không cần khóa tài khoản.
accountRouter.post("/admin/users/:id/revoke-sessions", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const input = adminPasswordResetSchema.parse(req.body);
    const rows = await query<{ id: string; revoked_session_count: number; revoked_refresh_token_count: number }>(
      `WITH target AS MATERIALIZED (
         SELECT id FROM users WHERE id=$1 FOR UPDATE
       ), revoked_sessions AS (
         UPDATE account_sessions s SET revoked_at=now() FROM target t
         WHERE s.user_id=t.id AND s.revoked_at IS NULL RETURNING s.id
       ), revoked_tokens AS (
         UPDATE refresh_tokens r SET revoked_at=now() FROM target t
         WHERE r.user_id=t.id AND r.revoked_at IS NULL RETURNING r.id
       ), logged AS (
         INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,new_value,actor_role,reason,ip_address,user_agent)
         SELECT $2,'ADMIN_SESSIONS_REVOKED','USER',t.id::text,
                jsonb_build_object(
                  'revoked_sessions',(SELECT count(*) FROM revoked_sessions),
                  'revoked_refresh_tokens',(SELECT count(*) FROM revoked_tokens)
                ),$3,$4,$5,$6 FROM target t
       )
       SELECT t.id,
              (SELECT count(*)::int FROM revoked_sessions) AS revoked_session_count,
              (SELECT count(*)::int FROM revoked_tokens) AS revoked_refresh_token_count
       FROM target t`,
      [req.params.id, req.user!.sub, req.user!.role, input.reason, req.ip, req.headers["user-agent"] ?? null],
    );
    if (!rows[0]) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    res.json({ message: "Đã đăng xuất tài khoản khỏi tất cả thiết bị.", ...rows[0] });
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
    const rows = await query<{
      id: string; email: string; name: string; role: Role; status: string;
      revoked_session_count: number; revoked_refresh_token_count: number;
    }>(
      `WITH previous_user AS MATERIALIZED (
         SELECT id,email,name,role,COALESCE(status::text,'ACTIVE') AS status FROM users WHERE id=$2 FOR UPDATE
       ), updated_user AS (
         UPDATE users u SET status=$1,updated_at=now()
         FROM previous_user p WHERE u.id=p.id
         RETURNING u.id,u.email,u.name,u.role,u.status,u.created_at,u.updated_at
       ), revoked_sessions AS (
         UPDATE account_sessions s SET revoked_at=now() FROM updated_user u
         WHERE s.user_id=u.id AND s.revoked_at IS NULL RETURNING s.id
       ), revoked_tokens AS (
         UPDATE refresh_tokens t SET revoked_at=now() FROM updated_user u
         WHERE t.user_id=u.id AND t.revoked_at IS NULL RETURNING t.id
       ), logged AS (
         INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,previous_value,new_value,actor_role,reason,ip_address,user_agent)
         SELECT $3,CASE WHEN $1='DISABLED' THEN 'USER_DISABLED' ELSE 'USER_ENABLED' END,
                'USER',u.id::text,
                jsonb_build_object('email',p.email,'name',p.name,'role',p.role,'status',p.status),
                jsonb_build_object('email',u.email,'name',u.name,'role',u.role,'status',u.status),
                $4,$5,$6,$7
         FROM previous_user p JOIN updated_user u ON u.id=p.id
       )
       SELECT u.*,
              (SELECT count(*)::int FROM revoked_sessions) AS revoked_session_count,
              (SELECT count(*)::int FROM revoked_tokens) AS revoked_refresh_token_count
       FROM updated_user u`,
      [input.status, req.params.id, req.user!.sub, req.user!.role, input.reason ?? null,
        req.ip, req.headers["user-agent"] ?? null],
    );
    if (!rows[0]) { res.status(404).json({ message: "Không tìm thấy tài khoản" }); return; }
    res.json(rows[0]);
  } catch (error) { next(error); }
});
