import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { collectDefaultMetrics, Counter, Histogram, register } from "prom-client";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { audit, query } from "./db";
import { authenticate, authorize, internalOnly, signToken } from "./auth";
import type { AuthRequest, OrganizationStatus, Role } from "./types";
import { emailDeliveryMode } from "./notifications";
import { accountRouter } from "./account";
import { createAccountSession } from "./sessions";
import { buildCorsOptions, securityHeaders } from "./security";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "./tokens";
import { checkLock, registerFailedLogin, resetFailedLogins } from "./passwords";
import { rateLimit } from "./rateLimit";

// Rate limit theo IP cho các endpoint xác thực nhạy cảm (chống brute-force / spam).
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, scope: "auth-login", message: "Bạn đăng nhập quá nhiều lần. Vui lòng thử lại sau 1 phút." });
const registerLimiter = rateLimit({ windowMs: 60_000, max: 5, scope: "auth-register", message: "Bạn tạo tài khoản quá nhanh. Vui lòng thử lại sau 1 phút." });
const refreshLimiter = rateLimit({ windowMs: 60_000, max: 30, scope: "auth-refresh" });

collectDefaultMetrics({ prefix: "identity_" });
const requestCount = new Counter({ name: "identity_http_requests_total", help: "HTTP requests", labelNames: ["method", "route", "status"] });
const requestDuration = new Histogram({ name: "identity_http_request_duration_seconds", help: "HTTP latency", labelNames: ["method", "route"] });

const uploadDir = process.env.UPLOAD_DIR ?? path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });

const profileContactFields = {
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,18}$/, "Số điện thoại không hợp lệ").optional(),
  province: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().min(4).max(300).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải có dạng YYYY-MM-DD").optional(),
  organization_name: z.string().trim().min(2).max(200).optional(),
};
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["DONOR", "ORGANIZATION"]),
  terms_accepted: z.literal(true),
  ...profileContactFields,
}).superRefine((input, context) => {
  if (input.role === "ORGANIZATION" && !input.organization_name) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["organization_name"], message: "Vui lòng nhập tên tổ chức." });
  }
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const googleLoginSchema = z.object({
  credential: z.string().min(20),
  role: z.enum(["DONOR", "ORGANIZATION"]).default("DONOR"),
  terms_accepted: z.literal(true),
  name: z.string().trim().min(2).max(120).optional(),
  ...profileContactFields,
});
const preferenceSchema = z.object({ saved: z.boolean(), following: z.boolean() });
const googleClient = new OAuth2Client();

type GoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  emailIsAuthoritative: boolean;
};

class GoogleAuthenticationError extends Error {
  constructor(message: string, public readonly status = 401) {
    super(message);
  }
}

async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new GoogleAuthenticationError("Đăng nhập Google chưa được cấu hình trên máy chủ.", 503);

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const subject = payload?.sub;
    const email = payload?.email?.toLowerCase();
    if (!subject || !email || payload.email_verified !== true) {
      throw new GoogleAuthenticationError("Tài khoản Google chưa xác thực email.");
    }
    const emailIsAuthoritative = email.endsWith("@gmail.com") || Boolean(payload.hd);
    return { subject, email, name: payload.name?.trim() || email.split("@")[0], emailIsAuthoritative };
  } catch (error) {
    if (error instanceof GoogleAuthenticationError) throw error;
    throw new GoogleAuthenticationError("Không thể xác minh thông tin đăng nhập Google.");
  }
}

export const app = express();
app.use(securityHeaders);
app.use(cors(buildCorsOptions()));
app.use(express.json());
// API versioning: công bố phiên bản API hiện tại trên mọi response để client/gateway đối chiếu.
const API_VERSION = process.env.API_VERSION ?? "v1";
app.use((_req, res, next) => { res.setHeader("X-API-Version", API_VERSION); next(); });
app.use((req, res, next) => {
  const end = requestDuration.startTimer({ method: req.method, route: req.path });
  res.on("finish", () => {
    end();
    requestCount.inc({ method: req.method, route: req.route?.path ?? req.path, status: String(res.statusCode) });
  });
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "identity", email_delivery: emailDeliveryMode() }));
app.get("/openapi.json", (_req, res) => res.sendFile(path.resolve("openapi.json")));
app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/analytics/users/public", async (_req, res, next) => {
  try {
    const rows = await query<{
      donor_count: string; verified_organization_count: string;
    }>(`SELECT
          count(*) FILTER(WHERE u.role='DONOR')::text AS donor_count,
          count(*) FILTER(WHERE u.role='ORGANIZATION' AND o.status='VERIFIED')::text AS verified_organization_count
        FROM users u LEFT JOIN organization_profiles o ON o.user_id=u.id`);
    const row = rows[0] ?? { donor_count: "0", verified_organization_count: "0" };
    res.json({ as_of: new Date().toISOString(), totals: { donor_count: Number(row.donor_count), verified_organization_count: Number(row.verified_organization_count) } });
  } catch (error) { next(error); }
});

app.get("/analytics/users/admin", authenticate, authorize("ADMIN"), async (_req, res, next) => {
  try {
    const roles = await query("SELECT role,count(*)::bigint AS count FROM users GROUP BY role ORDER BY role");
    const organizations = await query("SELECT status,count(*)::bigint AS count FROM organization_profiles GROUP BY status ORDER BY status");
    res.json({ as_of: new Date().toISOString(), role_distribution: roles, organization_statuses: organizations });
  } catch (error) { next(error); }
});

app.post("/auth/register", registerLimiter, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const rows = await query<{ id: string; email: string; name: string; role: Role; phone: string | null; province: string | null; address: string | null; date_of_birth: string | null; organization_name: string | null }>(
      `WITH new_user AS (
         INSERT INTO users(email,password_hash,name,role,phone,province,address,date_of_birth,organization_name,terms_accepted_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         RETURNING id,email,name,role,phone,province,address,date_of_birth,organization_name
       ), queued AS (
         INSERT INTO email_outbox(event_id,template,recipient_user_id,payload)
         SELECT id::text,'WELCOME',id,jsonb_build_object('role',role) FROM new_user
       )
        SELECT id,email,name,role,phone,province,address,date_of_birth,organization_name FROM new_user`,
      [input.email.toLowerCase(), passwordHash, input.name, input.role, input.phone ?? null, input.province ?? null, input.address ?? null, input.date_of_birth ?? null, input.organization_name ?? null]
    );
    const user = rows[0];
    const sessionId = await createAccountSession(user.id, req);
    const refreshToken = await issueRefreshToken(user.id, sessionId);
    res.status(201).json({
      token: signToken({ sub: user.id, email: user.email, name: user.name, role: user.role, session_id: sessionId }),
      refresh_token: refreshToken,
      user, email_notification: "QUEUED",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const rows = await query<{ id: string; email: string; name: string; role: Role; password_hash: string | null; status?: "ACTIVE" | "DISABLED"; phone?: string | null; province?: string | null; address?: string | null; date_of_birth?: string | null; organization_name?: string | null }>(
      "SELECT id,email,name,role,password_hash,phone,province,address,date_of_birth,organization_name,COALESCE(status::text,'ACTIVE') AS status FROM users WHERE email=$1",
      [input.email.toLowerCase()]
    );
    const user = rows[0];
    if (!user) {
      res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
      return;
    }
    const lock = await checkLock(user.id);
    if (lock.locked) {
      res.status(423).json({ message: `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${lock.remainingMinutes} phút.` });
      return;
    }
    if (!user.password_hash || !(await bcrypt.compare(input.password, user.password_hash))) {
      const lockedNow = await registerFailedLogin(user.id);
      if (lockedNow) {
        await audit(user.id, "ACCOUNT_LOCKED", "USER", user.id, null, { cause: "TOO_MANY_FAILED_LOGINS" }, {
          ip: req.ip, userAgent: req.headers["user-agent"] as string | undefined,
        });
      }
      res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
      return;
    }
    if (user.status === "DISABLED") {
      res.status(403).json({ message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên." });
      return;
    }
    await resetFailedLogins(user.id);
    const { password_hash: _hidden, ...safeUser } = user;
    const sessionId = await createAccountSession(user.id, req);
    const refreshToken = await issueRefreshToken(user.id, sessionId);
    await audit(user.id, "LOGIN_SUCCEEDED", "USER", user.id, null, { session_id: sessionId }, {
      actorRole: user.role, ip: req.ip, userAgent: req.headers["user-agent"] as string | undefined,
    });
    res.json({
      token: signToken({ sub: user.id, email: user.email, name: user.name, role: user.role, session_id: sessionId }),
      refresh_token: refreshToken,
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/google", loginLimiter, async (req, res, next) => {
  try {
    const input = googleLoginSchema.parse(req.body);
    const identity = await verifyGoogleCredential(input.credential);
    const matched = await query<{ id: string; email: string; name: string; role: Role; status: "ACTIVE" | "DISABLED"; phone: string | null; province: string | null; address: string | null; date_of_birth: string | null; organization_name: string | null }>(
      "SELECT id,email,name,role,phone,province,address,date_of_birth,organization_name,COALESCE(status::text,'ACTIVE') AS status FROM users WHERE google_subject=$1",
      [identity.subject],
    );
    let user = matched[0];
    let created = false;

    if (!user) {
      const existingEmail = await query<{ id: string; email: string; name: string; role: Role; status: "ACTIVE" | "DISABLED"; google_subject: string | null }>(
        "SELECT id,email,name,role,COALESCE(status::text,'ACTIVE') AS status,google_subject FROM users WHERE email=$1",
        [identity.email],
      );
      const existing = existingEmail[0];
      if (existing?.status === "DISABLED") {
        res.status(403).json({ message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên." });
        return;
      }
      if (existing?.google_subject) {
        res.status(409).json({ message: "Tài khoản Google này đã được liên kết với một người dùng khác." });
        return;
      }
      if (existing && !identity.emailIsAuthoritative) {
        res.status(409).json({ message: "Email này đã có tài khoản. Hãy đăng nhập bằng mật khẩu trước để bảo vệ tài khoản." });
        return;
      }
      if (existing) {
        const linked = await query<{ id: string; email: string; name: string; role: Role; status: "ACTIVE" | "DISABLED"; phone: string | null; province: string | null; address: string | null; date_of_birth: string | null; organization_name: string | null }>(
          "UPDATE users SET google_subject=$1,updated_at=now() WHERE id=$2 AND google_subject IS NULL RETURNING id,email,name,role,phone,province,address,date_of_birth,organization_name,COALESCE(status::text,'ACTIVE') AS status",
          [identity.subject, existing.id],
        );
        user = linked[0];
        if (!user) {
          res.status(409).json({ message: "Không thể liên kết Google với tài khoản này." });
          return;
        }
        await audit(user.id, "GOOGLE_ACCOUNT_LINKED", "USER", user.id, null, { provider: "GOOGLE" }, { actorRole: user.role, ip: req.ip, userAgent: req.headers["user-agent"] as string | undefined });
      } else {
        const createdRows = await query<{ id: string; email: string; name: string; role: Role; status: "ACTIVE" | "DISABLED"; phone: string | null; province: string | null; address: string | null; date_of_birth: string | null; organization_name: string | null }>(
          `WITH new_user AS (
             INSERT INTO users(email,password_hash,name,role,google_subject,phone,province,address,date_of_birth,organization_name,terms_accepted_at)
             VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,now())
             RETURNING id,email,name,role,phone,province,address,date_of_birth,organization_name,COALESCE(status::text,'ACTIVE') AS status
           ), queued AS (
             INSERT INTO email_outbox(event_id,template,recipient_user_id,payload)
             SELECT id::text,'WELCOME',id,jsonb_build_object('role',role,'provider','GOOGLE') FROM new_user
           ) SELECT id,email,name,role,phone,province,address,date_of_birth,organization_name,status FROM new_user`,
          [identity.email, input.name ?? identity.name, input.role, identity.subject, input.phone ?? null, input.province ?? null, input.address ?? null, input.date_of_birth ?? null, input.organization_name ?? null],
        );
        user = createdRows[0];
        created = true;
      }
    }

    if (!user || user.status === "DISABLED") {
      res.status(403).json({ message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên." });
      return;
    }
    const sessionId = await createAccountSession(user.id, req);
    const refreshToken = await issueRefreshToken(user.id, sessionId);
    await audit(user.id, created ? "GOOGLE_ACCOUNT_CREATED" : "GOOGLE_LOGIN_SUCCEEDED", "USER", user.id, null, { provider: "GOOGLE", session_id: sessionId }, {
      actorRole: user.role, ip: req.ip, userAgent: req.headers["user-agent"] as string | undefined,
    });
    res.status(created ? 201 : 200).json({
      token: signToken({ sub: user.id, email: user.email, name: user.name, role: user.role, session_id: sessionId }),
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, phone: user.phone, province: user.province, address: user.address, date_of_birth: user.date_of_birth, organization_name: user.organization_name },
      ...(created ? { email_notification: "QUEUED" } : {}),
    });
  } catch (error) {
    if (error instanceof GoogleAuthenticationError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
});

const refreshSchema = z.object({ refresh_token: z.string().min(32).max(256) });

app.post("/auth/refresh", refreshLimiter, async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    const result = await rotateRefreshToken(input.refresh_token);
    if (result === "REUSED") {
      res.status(401).json({ message: "Refresh token đã bị dùng lại — toàn bộ phiên đã bị thu hồi vì lý do an toàn." });
      return;
    }
    if (!result) {
      res.status(401).json({ message: "Refresh token không hợp lệ hoặc đã hết hạn" });
      return;
    }
    res.json({
      token: signToken({ sub: result.userId, email: result.email, name: result.name, role: result.role, session_id: result.sessionId ?? undefined }),
      refresh_token: result.refreshToken,
    });
  } catch (error) { next(error); }
});

app.post("/auth/logout", async (req, res, next) => {
  try {
    const input = refreshSchema.partial().parse(req.body ?? {});
    if (input.refresh_token) {
      const userId = await revokeRefreshToken(input.refresh_token);
      if (userId) await audit(userId, "LOGOUT", "USER", userId, null, null, { ip: req.ip });
    }
    res.json({ message: "Đã đăng xuất" });
  } catch (error) { next(error); }
});

app.get("/profile", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const rows = await query("SELECT id,email,name,role,phone,province,address,date_of_birth,organization_name,created_at FROM users WHERE id=$1", [req.user!.sub]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.put("/profile", authenticate, async (req: AuthRequest, res, next) => {
  try {
    const name = z.string().trim().min(2).max(120).parse(req.body.name);
    const rows = await query("UPDATE users SET name=$1,updated_at=now() WHERE id=$2 RETURNING id,email,name,role,phone,province,address,date_of_birth,organization_name", [name, req.user!.sub]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.use(accountRouter);

app.get("/me/campaign-preferences", authenticate, authorize("DONOR"), async (req: AuthRequest, res, next) => {
  try {
    res.json(await query(
      "SELECT campaign_id,campaign_title,saved,following,updated_at FROM campaign_preferences WHERE user_id=$1 ORDER BY updated_at DESC",
      [req.user!.sub],
    ));
  } catch (error) { next(error); }
});

app.get("/me/campaign-preferences/:campaignId", authenticate, authorize("DONOR"), async (req: AuthRequest, res, next) => {
  try {
    const campaignId = z.string().uuid().parse(req.params.campaignId);
    const rows = await query(
      "SELECT campaign_id,campaign_title,saved,following,updated_at FROM campaign_preferences WHERE user_id=$1 AND campaign_id=$2",
      [req.user!.sub, campaignId],
    );
    res.json(rows[0] ?? { campaign_id: campaignId, saved: false, following: false });
  } catch (error) { next(error); }
});

app.put("/me/campaign-preferences/:campaignId", authenticate, authorize("DONOR"), async (req: AuthRequest, res, next) => {
  try {
    const campaignId = z.string().uuid().parse(req.params.campaignId);
    const input = preferenceSchema.parse(req.body);
    if (!input.saved && !input.following) {
      await query("DELETE FROM campaign_preferences WHERE user_id=$1 AND campaign_id=$2", [req.user!.sub, campaignId]);
      res.json({ campaign_id: campaignId, saved: false, following: false });
      return;
    }
    const campaignResponse = await fetch(`${process.env.CAMPAIGN_SERVICE_URL}/internal/campaigns/${campaignId}/owner`, {
      headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-internal-token" },
    });
    if (!campaignResponse.ok) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    const campaign = await campaignResponse.json() as { title: string };
    const rows = await query(
      `INSERT INTO campaign_preferences(user_id,campaign_id,campaign_title,saved,following)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(user_id,campaign_id) DO UPDATE SET campaign_title=EXCLUDED.campaign_title,saved=EXCLUDED.saved,
         following=EXCLUDED.following,updated_at=now()
       RETURNING campaign_id,campaign_title,saved,following,updated_at`,
      [req.user!.sub, campaignId, campaign.title, input.saved, input.following],
    );
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/me/notifications", authenticate, authorize("DONOR"), async (req: AuthRequest, res, next) => {
  try {
    const status = z.enum(["ALL", "UNREAD"]).default("ALL").parse(req.query.status);
    const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit);
    const cursor = z.coerce.date().optional().parse(req.query.cursor);
    const rows = await query(
      `SELECT id,event_id,type,campaign_id,title,message,path,read_at,created_at FROM user_notifications
       WHERE user_id=$1 AND ($2::text='ALL' OR read_at IS NULL) AND ($3::timestamptz IS NULL OR created_at<$3)
       ORDER BY created_at DESC LIMIT $4`,
      [req.user!.sub, status, cursor ?? null, limit],
    );
    const unread = await query<{ count: string }>("SELECT count(*)::text AS count FROM user_notifications WHERE user_id=$1 AND read_at IS NULL", [req.user!.sub]);
    res.json({ items: rows, unread_count: Number(unread[0]?.count ?? 0), next_cursor: rows.length === limit ? rows.at(-1)?.created_at : null });
  } catch (error) { next(error); }
});

app.patch("/me/notifications/read-all", authenticate, authorize("DONOR"), async (req: AuthRequest, res, next) => {
  try {
    await query("UPDATE user_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1", [req.user!.sub]);
    res.json({ unread_count: 0 });
  } catch (error) { next(error); }
});

app.patch("/me/notifications/:id/read", authenticate, authorize("DONOR"), async (req: AuthRequest, res, next) => {
  try {
    const rows = await query("UPDATE user_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *", [req.params.id, req.user!.sub]);
    if (!rows[0]) { res.status(404).json({ message: "Không tìm thấy thông báo" }); return; }
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/admin/audit-logs/identity", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
    res.json(await query(
      `SELECT id,actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value,reason,ip_address,user_agent,created_at,'IDENTITY' AS service
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]));
  } catch (error) { next(error); }
});

app.post("/organizations/application", authenticate, authorize("ORGANIZATION"), upload.single("document"), async (req: AuthRequest, res, next) => {
  try {
    const input = z.object({
      legalName: z.string().trim().min(3),
      registrationNumber: z.string().trim().min(3),
      description: z.string().trim().max(2000).default("")
    }).parse(req.body);
    const rows = await query<{ user_id: string; status: OrganizationStatus }>(
      `INSERT INTO organization_profiles(user_id,legal_name,registration_number,description,document_path,status,rejection_reason,submitted_at)
       VALUES ($1,$2,$3,$4,$5,'PENDING',NULL,now())
       ON CONFLICT (user_id) DO UPDATE SET legal_name=EXCLUDED.legal_name, registration_number=EXCLUDED.registration_number,
         description=EXCLUDED.description, document_path=COALESCE(EXCLUDED.document_path,organization_profiles.document_path),
         status='PENDING', rejection_reason=NULL, submitted_at=now()
       RETURNING user_id,status`,
      [req.user!.sub, input.legalName, input.registrationNumber, input.description, req.file?.path ?? null]
    );
    await audit(req.user!.sub, "ORGANIZATION_SUBMITTED", "ORGANIZATION", req.user!.sub, null, rows[0]);
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/organizations/me", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const rows = await query("SELECT * FROM organization_profiles WHERE user_id=$1", [req.user!.sub]);
    res.json(rows[0] ?? null);
  } catch (error) { next(error); }
});

app.get("/admin/organizations", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const status = z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional().parse(req.query.status);
    const rows = await query(
      `SELECT o.*,u.email,u.name FROM organization_profiles o JOIN users u ON u.id=o.user_id
       WHERE ($1::organization_status IS NULL OR o.status=$1) ORDER BY o.submitted_at ASC`, [status ?? null]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.patch("/admin/organizations/:id/status", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const organizationId = String(req.params.id);
    const input = z.object({ status: z.enum(["VERIFIED", "REJECTED"]), reason: z.string().trim().max(500).optional() }).parse(req.body);
    if (input.status === "REJECTED" && !input.reason) {
      res.status(400).json({ message: "Cần nhập lý do từ chối" });
      return;
    }
    const before = (await query<{ status: OrganizationStatus }>("SELECT status FROM organization_profiles WHERE user_id=$1", [organizationId]))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy tổ chức" }); return; }
    const rows = await query(
      `UPDATE organization_profiles SET status=$1,rejection_reason=$2,reviewed_at=now(),reviewed_by=$3
       WHERE user_id=$4 RETURNING *`, [input.status, input.reason ?? null, req.user!.sub, organizationId]
    );
    await audit(req.user!.sub, `ORGANIZATION_${input.status}`, "ORGANIZATION", organizationId, before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/internal/organizations/:userId/status", internalOnly, async (req, res, next) => {
  try {
    const rows = await query("SELECT status,legal_name FROM organization_profiles WHERE user_id=$1", [req.params.userId]);
    res.json(rows[0] ?? { status: null });
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "Dữ liệu không hợp lệ", issues: error.issues });
    return;
  }
  const pgError = error as { code?: string };
  if (pgError.code === "23505") {
    res.status(409).json({ message: "Email hoặc mã đăng ký đã tồn tại" });
    return;
  }
  res.status(500).json({ message: "Lỗi hệ thống Identity Service" });
});
