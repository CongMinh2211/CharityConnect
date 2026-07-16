import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { collectDefaultMetrics, Counter, Histogram, register } from "prom-client";
import { createClient } from "redis";
import { z } from "zod";
import { authenticate, authorize, internalOnly } from "./auth";
import { audit, pool, query } from "./db";
import { buildCorsOptions, securityHeaders } from "./security";
import { canTransition, isDonationEligible } from "./state";
import type { AuthRequest, CampaignStatus, ImpactReportStatus } from "./types";

collectDefaultMetrics({ prefix: "campaign_" });
const requestCount = new Counter({ name: "campaign_http_requests_total", help: "HTTP requests", labelNames: ["method", "route", "status"] });
const requestDuration = new Histogram({ name: "campaign_http_request_duration_seconds", help: "HTTP latency", labelNames: ["method", "route"] });
const impactSubmitted = new Counter({ name: "campaign_impact_reports_submitted_total", help: "Impact reports submitted" });
const impactReviewed = new Counter({ name: "campaign_impact_reports_reviewed_total", help: "Impact reports reviewed", labelNames: ["status"] });
const impactReviewDuration = new Histogram({ name: "campaign_impact_review_duration_seconds", help: "Impact report review lead time" });
const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
redis.on("error", (error) => process.stderr.write(`redis:${String(error)}\n`));
void redis.connect();

const uploadDir = process.env.UPLOAD_DIR ?? path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });
const evidenceUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "application/pdf"].includes(file.mimetype));
  }
});
const categories = ["EMERGENCY", "EDUCATION", "HEALTH", "ENVIRONMENT", "COMMUNITY"] as const;
const internalUrl = (value: string | undefined, fallback: string): string => {
  const raw = value || fallback;
  return /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, "") : `http://${raw.replace(/\/$/, "")}`;
};
type OrganizationIdentity = { status: string | null; legal_name?: string; verification_expires_at?: string | null };

async function loadOrganizationIdentity(userId: string): Promise<OrganizationIdentity> {
  const response = await fetch(
    `${internalUrl(process.env.IDENTITY_SERVICE_URL, "localhost:3001")}/internal/organizations/${encodeURIComponent(userId)}/status`,
    {
      headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-internal-token" },
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (typeof response.status === "number" && response.status >= 400) {
    throw new Error(`Identity Service returned ${response.status}`);
  }
  return await response.json() as OrganizationIdentity;
}
const campaignInput = z.object({
  title: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(300),
  description: z.string().trim().min(30).max(10000),
  category: z.enum(categories),
  goalAmount: z.coerce.number().int().positive().max(100_000_000_000),
  endDate: z.coerce.date().refine((date) => date.getTime() > Date.now(), "Ngày kết thúc phải ở tương lai")
});
const impactReportInput = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(20).max(5000),
  amountUsed: z.coerce.number().int().positive().max(100_000_000_000),
  reportDate: z.coerce.date().refine((date) => date.getTime() <= Date.now(), "Ngày thực hiện không được ở tương lai"),
  milestoneId: z.string().uuid(),
  allocations: z.preprocess(
    (value) => typeof value === "string" ? JSON.parse(value) : value,
    z.array(z.object({ budget_item_id: z.string().uuid(), amount: z.coerce.number().int().positive() })).min(1).max(10),
  ),
});

const financialPlanInput = z.object({
  budget_items: z.array(z.object({ label: z.string().trim().min(2).max(120), planned_amount: z.coerce.number().int().positive() })).min(1).max(10),
  milestones: z.array(z.object({
    title: z.string().trim().min(3).max(160), description: z.string().trim().max(1000).default(""),
    target_date: z.coerce.date(), target_amount: z.coerce.number().int().positive(),
  })).min(1).max(8),
});

async function queueCampaignUpdate(campaignId: string, type: "CAMPAIGN_APPROVED" | "MILESTONE_UPDATED" | "IMPACT_VERIFIED", title: string, message: string): Promise<void> {
  const eventId = randomUUID();
  await query(
    `INSERT INTO campaign_outbox_events(id,event_type,payload) VALUES($1,'campaign.update',$2::jsonb)`,
    [eventId, JSON.stringify({ event_id: eventId, type, campaign_id: campaignId, campaign_title: title, title, message, path: `/chien-dich/${campaignId}` })],
  );
}

function removeUploaded(files: Express.Multer.File[]): void {
  for (const file of files) fs.rm(file.path, { force: true }, () => undefined);
}

function hasValidEvidenceSignature(file: Express.Multer.File): boolean {
  const bytes = fs.readFileSync(file.path).subarray(0, 8);
  if (file.mimetype === "application/pdf") return bytes.toString("ascii", 0, 4) === "%PDF";
  if (file.mimetype === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/png") return bytes.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

async function invalidatePublicCache(campaignId: string): Promise<void> {
  if (!redis.isReady) return;
  const keys: string[] = [];
  for await (const key of redis.scanIterator({ MATCH: "campaigns:public:*", COUNT: 100 })) keys.push(String(key));
  if (keys.length) await redis.del(keys);
  await redis.del(`campaign:${campaignId}`);
}

export const app = express();
app.use(securityHeaders);
app.use(cors(buildCorsOptions()));
app.use(express.json());
app.use((req, res, next) => {
  const end = requestDuration.startTimer({ method: req.method, route: req.path });
  res.on("finish", () => { end(); requestCount.inc({ method: req.method, route: req.route?.path ?? req.path, status: String(res.statusCode) }); });
  next();
});
app.get("/health", (_req, res) => res.json({ status: "ok", service: "campaign" }));
app.get("/openapi.json", (_req, res) => res.sendFile(path.resolve("openapi.json")));
app.get("/metrics", async (_req, res) => { res.setHeader("Content-Type", register.contentType); res.send(await register.metrics()); });

const analyticsPeriod = z.enum(["7d", "30d", "90d", "all"]);
function analyticsSince(period: z.infer<typeof analyticsPeriod>): string {
  return period === "all" ? "TRUE" : `created_at >= now() - interval '${period.slice(0, -1)} days'`;
}

async function campaignAnalytics(period: z.infer<typeof analyticsPeriod>, organizationId?: string): Promise<Record<string, unknown>> {
  const values: unknown[] = [];
  const ownerClause = organizationId ? `AND organization_id=$1` : "";
  if (organizationId) values.push(organizationId);
  const rows = await query<{
    campaign_count: string; active_count: string; closed_count: string; pending_count: string;
    goal_amount: string; raised_amount: string;
  }>(
    `SELECT count(*)::text AS campaign_count,
            count(*) FILTER(WHERE status='APPROVED' AND end_date>now())::text AS active_count,
            count(*) FILTER(WHERE status='CLOSED' OR end_date<=now())::text AS closed_count,
            count(*) FILTER(WHERE status='PENDING_REVIEW')::text AS pending_count,
            COALESCE(sum(goal_amount),0)::text AS goal_amount,
            COALESCE(sum(raised_amount),0)::text AS raised_amount
     FROM campaigns WHERE deleted_at IS NULL AND ${analyticsSince(period)} ${ownerClause}`,
    values,
  );
  const categoryDistribution = await query(
    `SELECT category,count(*)::bigint AS campaign_count,COALESCE(sum(raised_amount),0)::bigint AS raised_amount
     FROM campaigns WHERE deleted_at IS NULL AND ${analyticsSince(period)} ${ownerClause}
     GROUP BY category ORDER BY raised_amount DESC`,
    values,
  );
  const progress = await query(
    `SELECT id,title,category,goal_amount,raised_amount,status,
            LEAST(100,round(raised_amount::numeric*100/goal_amount,1)) AS progress_percent
     FROM campaigns WHERE deleted_at IS NULL AND ${analyticsSince(period)} ${ownerClause}
     ORDER BY raised_amount DESC LIMIT 8`,
    values,
  );
  const totals = rows[0] ?? {};
  return {
    period,
    as_of: new Date().toISOString(),
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value)])),
    category_distribution: categoryDistribution,
    campaign_progress: progress,
  };
}

app.get("/analytics/campaigns/public", async (req, res, next) => {
  try { res.json(await campaignAnalytics(analyticsPeriod.parse(req.query.period ?? "30d"))); }
  catch (error) { next(error); }
});

app.get("/analytics/campaigns/organization", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try { res.json(await campaignAnalytics(analyticsPeriod.parse(req.query.period ?? "30d"), req.user!.sub)); }
  catch (error) { next(error); }
});

app.get("/analytics/campaigns/admin", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try { res.json(await campaignAnalytics(analyticsPeriod.parse(req.query.period ?? "30d"))); }
  catch (error) { next(error); }
});

app.get("/campaigns", async (req, res, next) => {
  try {
    const category = z.enum(categories).optional().parse(req.query.category);
    const search = z.string().trim().max(100).optional().parse(req.query.search);
    const sort = z.enum(["newest", "ending_soon", "progress_desc"]).default("newest").parse(req.query.sort);
    const progressMin = z.coerce.number().min(0).max(100).default(0).parse(req.query.progress_min);
    const progressMax = z.coerce.number().min(0).max(100).default(100).parse(req.query.progress_max);
    const endingWithin = z.enum(["7", "30", "all"]).default("all").parse(req.query.ending_within);
    if (progressMin > progressMax) { res.status(400).json({ message: "Khoảng tiến độ không hợp lệ" }); return; }
    const cacheKey = `campaigns:public:${category ?? "all"}:${search ?? ""}:${sort}:${progressMin}:${progressMax}:${endingWithin}`;
    const cached = redis.isReady ? await redis.get(cacheKey) : null;
    if (cached) { res.json(JSON.parse(cached)); return; }
    const orderBy = sort === "ending_soon" ? "end_date ASC" : sort === "progress_desc" ? "raised_amount::numeric/goal_amount DESC" : "created_at DESC";
    const rows = await query(
      `SELECT id,organization_name,title,summary,category,goal_amount,raised_amount,image_path,end_date,status
       FROM campaigns WHERE status='APPROVED' AND end_date>now() AND deleted_at IS NULL
       AND ($1::campaign_category IS NULL OR category=$1)
       AND ($2::text IS NULL OR title ILIKE '%'||$2||'%' OR summary ILIKE '%'||$2||'%')
       AND raised_amount::numeric*100/goal_amount BETWEEN $3 AND $4
       AND ($5::int IS NULL OR end_date<=now()+make_interval(days=>$5))
       ORDER BY ${orderBy}`,
      [category ?? null, search || null, progressMin, progressMax, endingWithin === "all" ? null : Number(endingWithin)]
    );
    if (redis.isReady) await redis.setEx(cacheKey, 60, JSON.stringify(rows));
    res.json(rows);
  } catch (error) { next(error); }
});

app.get("/campaigns/:id", async (req, res, next) => {
  try {
    const cacheKey = `campaign:${req.params.id}`;
    const cached = redis.isReady ? await redis.get(cacheKey) : null;
    if (cached) { res.json(JSON.parse(cached)); return; }
    const rows = await query("SELECT * FROM campaigns WHERE id=$1 AND status='APPROVED' AND deleted_at IS NULL", [req.params.id]);
    if (!rows[0]) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    if (redis.isReady) await redis.setEx(cacheKey, 60, JSON.stringify(rows[0]));
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/campaigns/:id/financial-plan", async (req, res, next) => {
  try {
    const campaign = (await query<{ id: string; goal_amount: string }>("SELECT id,goal_amount FROM campaigns WHERE id=$1 AND status IN ('APPROVED','CLOSED') AND deleted_at IS NULL", [req.params.id]))[0];
    if (!campaign) { res.status(404).json({ message: "Không tìm thấy kế hoạch chiến dịch" }); return; }
    const budgetItems = await query(
      `SELECT b.id,b.label,b.planned_amount,b.sort_order,
              COALESCE(sum(a.amount) FILTER(WHERE r.status='VERIFIED'),0)::bigint AS actual_amount
       FROM campaign_budget_items b LEFT JOIN impact_report_allocations a ON a.budget_item_id=b.id
       LEFT JOIN impact_reports r ON r.id=a.report_id WHERE b.campaign_id=$1
       GROUP BY b.id ORDER BY b.sort_order,b.created_at`, [req.params.id],
    );
    const milestones = await query("SELECT id,title,description,target_date,target_amount,status,sort_order,updated_at FROM campaign_milestones WHERE campaign_id=$1 ORDER BY sort_order, target_date", [req.params.id]);
    res.json({ campaign_id: campaign.id, goal_amount: Number(campaign.goal_amount), budget_items: budgetItems, milestones });
  } catch (error) { next(error); }
});

app.put("/organization/campaigns/:id/financial-plan", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  const parsed = financialPlanInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Kế hoạch tài chính không hợp lệ", issues: parsed.error.issues }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query("SELECT id,goal_amount,status FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR UPDATE", [req.params.id, req.user!.sub]);
    const campaign = selected.rows[0];
    if (!campaign) { await client.query("ROLLBACK"); res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    if (!["DRAFT", "REJECTED"].includes(campaign.status)) { await client.query("ROLLBACK"); res.status(409).json({ message: "Chỉ sửa kế hoạch của bản nháp hoặc chiến dịch bị từ chối" }); return; }
    const budgetTotal = parsed.data.budget_items.reduce((sum, item) => sum + item.planned_amount, 0);
    if (budgetTotal !== Number(campaign.goal_amount)) { await client.query("ROLLBACK"); res.status(409).json({ message: "Tổng ngân sách phải bằng mục tiêu gây quỹ" }); return; }
    await client.query("DELETE FROM campaign_milestones WHERE campaign_id=$1", [campaign.id]);
    await client.query("DELETE FROM campaign_budget_items WHERE campaign_id=$1", [campaign.id]);
    for (const [index, item] of parsed.data.budget_items.entries()) {
      await client.query("INSERT INTO campaign_budget_items(campaign_id,label,planned_amount,sort_order) VALUES($1,$2,$3,$4)", [campaign.id, item.label, item.planned_amount, index]);
    }
    for (const [index, item] of parsed.data.milestones.entries()) {
      await client.query(
        "INSERT INTO campaign_milestones(campaign_id,title,description,target_date,target_amount,sort_order) VALUES($1,$2,$3,$4,$5,$6)",
        [campaign.id, item.title, item.description, item.target_date, item.target_amount, index],
      );
    }
    await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,new_value) VALUES($1,'FINANCIAL_PLAN_UPDATED','CAMPAIGN',$2,$3::jsonb)", [req.user!.sub, campaign.id, JSON.stringify(parsed.data)]);
    await client.query("COMMIT");
    res.json({ campaign_id: campaign.id, ...parsed.data });
  } catch (error) { await client.query("ROLLBACK"); next(error); } finally { client.release(); }
});

app.patch("/organization/campaigns/:id/milestones/:milestoneId/status", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const target = z.enum(["IN_PROGRESS", "SUBMITTED"]).parse(req.body.status);
    const rows = await query<{ id: string; status: string; title: string; campaign_title: string }>(
      `SELECT m.id,m.status,m.title,c.title AS campaign_title FROM campaign_milestones m JOIN campaigns c ON c.id=m.campaign_id
       WHERE m.id=$1 AND m.campaign_id=$2 AND c.organization_id=$3 AND c.status='APPROVED' AND c.deleted_at IS NULL`,
      [req.params.milestoneId, req.params.id, req.user!.sub],
    );
    const milestone = rows[0];
    if (!milestone) { res.status(404).json({ message: "Không tìm thấy mốc" }); return; }
    const valid = (milestone.status === "PLANNED" && target === "IN_PROGRESS") || (milestone.status === "IN_PROGRESS" && target === "SUBMITTED");
    if (!valid) { res.status(409).json({ message: "Chuyển trạng thái mốc không hợp lệ" }); return; }
    const updated = (await query("UPDATE campaign_milestones SET status=$1,updated_at=now() WHERE id=$2 RETURNING *", [target, milestone.id]))[0];
    await audit(req.user!.sub, "MILESTONE_UPDATED", milestone.id, milestone, updated);
    await queueCampaignUpdate(String(req.params.id), "MILESTONE_UPDATED", milestone.campaign_title, `Mốc “${milestone.title}” chuyển sang ${target}.`);
    res.json(updated);
  } catch (error) { next(error); }
});

app.get("/organization/campaigns", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try { res.json(await query("SELECT * FROM campaigns WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC", [req.user!.sub])); }
  catch (error) { next(error); }
});

app.post("/organization/campaigns", authenticate, authorize("ORGANIZATION"), upload.single("image"), async (req: AuthRequest, res, next) => {
  try {
    const input = campaignInput.parse(req.body);
    let organization: OrganizationIdentity;
    try {
      organization = await loadOrganizationIdentity(req.user!.sub);
    } catch {
      res.status(503).json({ message: "Không kết nối được Identity Service để kiểm tra tổ chức" });
      return;
    }
    if (organization.status !== "VERIFIED") { res.status(403).json({ message: "Tổ chức phải được xác minh trước khi tạo chiến dịch" }); return; }
    const rows = await query<{ id: string }>(
      `INSERT INTO campaigns(organization_id,organization_name,title,summary,description,category,goal_amount,image_path,end_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user!.sub, organization.legal_name ?? req.user!.name, input.title, input.summary, input.description, input.category, input.goalAmount, req.file?.path ?? null, input.endDate]
    );
    await query("INSERT INTO campaign_escrows(campaign_id,contract_state) VALUES($1,'CREATED') ON CONFLICT DO NOTHING", [rows[0].id]);
    await audit(req.user!.sub, "CAMPAIGN_CREATED", rows[0].id, null, rows[0]);
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});

app.put("/organization/campaigns/:id", authenticate, authorize("ORGANIZATION"), upload.single("image"), async (req: AuthRequest, res, next) => {
  try {
    const campaignId = String(req.params.id);
    const input = campaignInput.parse(req.body);
    const before = (await query<{ id: string; status: CampaignStatus }>("SELECT * FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL", [req.params.id, req.user!.sub]))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    if (!["DRAFT", "REJECTED"].includes(before.status)) { res.status(409).json({ message: "Chỉ có thể sửa bản nháp hoặc chiến dịch bị từ chối" }); return; }
    const rows = await query(
      `UPDATE campaigns SET title=$1,summary=$2,description=$3,category=$4,goal_amount=$5,end_date=$6,
       image_path=COALESCE($7,image_path),updated_at=now() WHERE id=$8 RETURNING *`,
      [input.title, input.summary, input.description, input.category, input.goalAmount, input.endDate, req.file?.path ?? null, req.params.id]
    );
    await audit(req.user!.sub, "CAMPAIGN_UPDATED", campaignId, before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.delete("/organization/campaigns/:id", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const before = (await query<{ id: string; status: CampaignStatus; title: string }>(
      "SELECT id,status,title FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL",
      [req.params.id, req.user!.sub],
    ))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    if (!["DRAFT", "REJECTED"].includes(before.status)) {
      res.status(409).json({ message: "Chỉ được xóa mềm chiến dịch nháp hoặc bị từ chối; dữ liệu đã duyệt là bất biến" });
      return;
    }
    const rows = await query("UPDATE campaigns SET deleted_at=now(),updated_at=now() WHERE id=$1 RETURNING id,status,title,deleted_at", [req.params.id]);
    await audit(req.user!.sub, "CAMPAIGN_SOFT_DELETED", String(req.params.id), before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.post("/organization/campaigns/:id/submit", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const campaignId = String(req.params.id);
    const before = (await query<{ status: CampaignStatus }>("SELECT status FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL", [req.params.id, req.user!.sub]))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    if (!canTransition(before.status, "PENDING_REVIEW")) { res.status(409).json({ message: "Trạng thái không cho phép nộp duyệt" }); return; }
    const plan = (await query<{ budget_total: string; milestone_count: string; goal_amount: string }>(
      `SELECT c.goal_amount::text,COALESCE(sum(b.planned_amount),0)::text AS budget_total,
              (SELECT count(*)::text FROM campaign_milestones m WHERE m.campaign_id=c.id) AS milestone_count
       FROM campaigns c LEFT JOIN campaign_budget_items b ON b.campaign_id=c.id WHERE c.id=$1 GROUP BY c.id`,
      [req.params.id],
    ))[0];
    if (!plan || Number(plan.budget_total) !== Number(plan.goal_amount) || Number(plan.milestone_count) < 1) {
      res.status(409).json({ message: "Cần hoàn thiện ngân sách bằng mục tiêu và ít nhất một mốc trước khi nộp duyệt" }); return;
    }
    let organization: OrganizationIdentity;
    try {
      organization = await loadOrganizationIdentity(req.user!.sub);
    } catch {
      res.status(503).json({ message: "Không kết nối được Identity Service để kiểm tra tổ chức" });
      return;
    }
    if (organization.status !== "VERIFIED") { res.status(403).json({ message: "Tổ chức chưa được xác minh" }); return; }
    const rows = await query("UPDATE campaigns SET status='PENDING_REVIEW',submitted_at=now(),rejection_reason=NULL,updated_at=now() WHERE id=$1 RETURNING *", [req.params.id]);
    await audit(req.user!.sub, "CAMPAIGN_SUBMITTED", campaignId, before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.post("/organization/campaigns/:id/close", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const campaignId = String(req.params.id);
    const before = (await query<{ status: CampaignStatus }>("SELECT status FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL", [req.params.id, req.user!.sub]))[0];
    if (!before || !canTransition(before.status, "CLOSED")) { res.status(409).json({ message: "Không thể đóng chiến dịch ở trạng thái hiện tại" }); return; }
    const rows = await query("UPDATE campaigns SET status='CLOSED',updated_at=now() WHERE id=$1 RETURNING *", [req.params.id]);
    await query("UPDATE campaign_escrows SET contract_state='CLOSED',updated_at=now() WHERE campaign_id=$1", [req.params.id]);
    await audit(req.user!.sub, "CAMPAIGN_CLOSED", campaignId, before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/admin/campaigns", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const status = z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "CLOSED"]).optional().parse(req.query.status);
    res.json(await query("SELECT * FROM campaigns WHERE deleted_at IS NULL AND ($1::campaign_status IS NULL OR status=$1) ORDER BY submitted_at ASC NULLS LAST", [status ?? null]));
  } catch (error) { next(error); }
});

app.get("/admin/campaign-risks", authenticate, authorize("ADMIN"), async (_req, res, next) => {
  try {
    const rows = await query<{
      id: string; title: string; organization_name: string; status: string; raised_amount: string; goal_amount: string;
      report_overdue: boolean; overdue_milestones: string; rejected_reports: string; stale_pending: string;
      closing_soon_low: boolean; escrow_mismatch: boolean;
    }>(
      `SELECT c.id,c.title,c.organization_name,c.status,c.raised_amount::text,c.goal_amount::text,
        (c.raised_amount>0 AND c.created_at<now()-interval '30 days' AND NOT EXISTS(
          SELECT 1 FROM impact_reports ir WHERE ir.campaign_id=c.id AND ir.deleted_at IS NULL AND ir.status='VERIFIED' AND ir.reviewed_at>=now()-interval '30 days'
        )) AS report_overdue,
        (SELECT count(*)::text FROM campaign_milestones m WHERE m.campaign_id=c.id AND m.target_date<current_date AND m.status<>'VERIFIED') AS overdue_milestones,
        (SELECT count(*)::text FROM impact_reports ir WHERE ir.campaign_id=c.id AND ir.deleted_at IS NULL AND ir.status='REJECTED' AND ir.reviewed_at>=now()-interval '90 days') AS rejected_reports,
        (SELECT count(*)::text FROM impact_reports ir WHERE ir.campaign_id=c.id AND ir.deleted_at IS NULL AND ir.status='PENDING_REVIEW' AND ir.submitted_at<now()-interval '48 hours') AS stale_pending,
        (c.status='APPROVED' AND c.end_date<=now()+interval '7 days' AND c.raised_amount::numeric/c.goal_amount<0.25) AS closing_soon_low,
        EXISTS(SELECT 1 FROM campaign_escrows e WHERE e.campaign_id=c.id AND (e.total_donated<>c.raised_amount OR e.released_amount+e.locked_amount<>e.total_donated)) AS escrow_mismatch
       FROM campaigns c WHERE c.deleted_at IS NULL AND c.status IN ('APPROVED','CLOSED','PENDING_REVIEW') ORDER BY c.created_at DESC`,
    );
    const assessments = rows.map((row) => {
      const signals: Array<{ code: string; points: number; explanation: string }> = [];
      if (row.report_overdue) signals.push({ code: "REPORT_OVERDUE", points: 35, explanation: "Không có báo cáo xác minh mới trong 30 ngày dù đã nhận quỹ." });
      const milestonePoints = Math.min(50, Number(row.overdue_milestones) * 25);
      if (milestonePoints) signals.push({ code: "MILESTONE_OVERDUE", points: milestonePoints, explanation: `${row.overdue_milestones} mốc đã quá hạn.` });
      const rejectionPoints = Math.min(30, Number(row.rejected_reports) * 15);
      if (rejectionPoints) signals.push({ code: "REPORT_REJECTED", points: rejectionPoints, explanation: `${row.rejected_reports} báo cáo bị từ chối trong 90 ngày.` });
      if (Number(row.stale_pending) > 0) signals.push({ code: "REVIEW_STALE", points: 20, explanation: "Có báo cáo chờ duyệt quá 48 giờ." });
      if (row.closing_soon_low) signals.push({ code: "LOW_PROGRESS_NEAR_END", points: 15, explanation: "Sắp kết thúc nhưng tiến độ gây quỹ dưới 25%." });
      if (row.escrow_mismatch) signals.push({ code: "ESCROW_MISMATCH", points: 40, explanation: "Số liệu escrow không khớp số tiền chiến dịch." });
      const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0));
      return { campaign_id: row.id, campaign_title: row.title, organization_name: row.organization_name, status: row.status, score, level: score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW", signals };
    }).sort((a, b) => b.score - a.score || a.campaign_title.localeCompare(b.campaign_title));
    res.json(assessments.map((item, index) => ({ ...item, priority_rank: index + 1 })));
  } catch (error) { next(error); }
});

app.get("/admin/audit-logs/campaign", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
    res.json(await query("SELECT id,actor_id,action,entity_type,entity_id,previous_value,new_value,created_at,'CAMPAIGN' AS service FROM audit_logs ORDER BY created_at DESC LIMIT $1", [limit]));
  } catch (error) { next(error); }
});

app.patch("/admin/campaigns/:id/status", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const campaignId = String(req.params.id);
    const input = z.object({ status: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().max(500).optional() }).parse(req.body);
    if (input.status === "REJECTED" && !input.reason) { res.status(400).json({ message: "Cần nhập lý do từ chối" }); return; }
    const before = (await query<{ status: CampaignStatus; organization_id: string }>(
      "SELECT status,organization_id FROM campaigns WHERE id=$1 AND deleted_at IS NULL",
      [req.params.id],
    ))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    if (!canTransition(before.status, input.status)) { res.status(409).json({ message: "Trạng thái chuyển không hợp lệ" }); return; }
    if (input.status === "APPROVED") {
      let organization: OrganizationIdentity;
      try {
        organization = await loadOrganizationIdentity(before.organization_id);
      } catch {
        res.status(503).json({ message: "Không kết nối được Identity Service để xác nhận tổ chức trước khi duyệt chiến dịch" });
        return;
      }
      if (organization.status !== "VERIFIED") {
        res.status(409).json({ message: "Không thể duyệt chiến dịch vì tổ chức chưa được xác minh hoặc xác minh đã hết hạn" });
        return;
      }
    }
    const rows = await query(
      "UPDATE campaigns SET status=$1,rejection_reason=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now() WHERE id=$4 RETURNING *",
      [input.status, input.reason ?? null, req.user!.sub, req.params.id]
    );
    await query("UPDATE campaign_escrows SET contract_state=$1,updated_at=now() WHERE campaign_id=$2", [input.status === "APPROVED" ? "DONATION_OPEN" : "CREATED", req.params.id]);
    await audit(req.user!.sub, `CAMPAIGN_${input.status}`, campaignId, before, rows[0]);
    if (input.status === "APPROVED") await queueCampaignUpdate(campaignId, "CAMPAIGN_APPROVED", String((rows[0] as { title?: string }).title ?? "Chiến dịch"), "Chiến dịch đã được phê duyệt và bắt đầu nhận quyên góp.");
    await invalidatePublicCache(campaignId);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/campaigns/:id/impact-reports", async (req, res, next) => {
  try {
    const reports = await query(
      `SELECT ir.id,ir.campaign_id,ir.title,ir.description,ir.amount_used,ir.report_date,
              ir.status,ir.reviewed_at,ir.created_at,
              COALESCE(json_agg(json_build_object(
                'id',ie.id,'original_name',ie.original_name,'mime_type',ie.mime_type,
                'size_bytes',ie.size_bytes,'sha256',ie.sha256,
                'url','/api/v1/impact-evidence/'||ie.id
              ) ORDER BY ie.created_at) FILTER (WHERE ie.id IS NOT NULL),'[]') AS evidence
       FROM impact_reports ir LEFT JOIN impact_evidence ie ON ie.report_id=ir.id
       WHERE ir.campaign_id=$1 AND ir.deleted_at IS NULL AND ir.status='VERIFIED'
       GROUP BY ir.id ORDER BY ir.report_date DESC`,
      [req.params.id]
    );
    res.json(reports);
  } catch (error) { next(error); }
});

app.get("/campaigns/:id/contract", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT e.campaign_id,e.total_donated,e.released_amount,e.locked_amount,e.contract_state,e.updated_at,
              COALESCE(json_agg(json_build_object('state',h.state,'amount',h.amount,'created_at',h.created_at)
                ORDER BY h.created_at) FILTER(WHERE h.id IS NOT NULL),'[]') AS history
       FROM campaign_escrows e JOIN campaigns c ON c.id=e.campaign_id
       LEFT JOIN escrow_state_history h ON h.campaign_id=e.campaign_id
       WHERE e.campaign_id=$1 AND c.deleted_at IS NULL AND c.status IN ('APPROVED','CLOSED') GROUP BY e.campaign_id`, [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ message: "Không tìm thấy escrow chiến dịch" }); return; }
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/impact-evidence/:id", async (req, res, next) => {
  try {
    const evidence = (await query<{ stored_path: string; original_name: string }>(
      `SELECT ie.stored_path,ie.original_name FROM impact_evidence ie
       JOIN impact_reports ir ON ir.id=ie.report_id WHERE ie.id=$1 AND ir.deleted_at IS NULL AND ir.status='VERIFIED'`,
      [req.params.id]
    ))[0];
    if (!evidence) { res.status(404).json({ message: "Không tìm thấy bằng chứng" }); return; }
    res.sendFile(path.resolve(evidence.stored_path), { headers: { "Content-Disposition": `inline; filename="${encodeURIComponent(evidence.original_name)}"` } });
  } catch (error) { next(error); }
});

app.post(
  "/organization/campaigns/:id/impact-reports",
  authenticate,
  authorize("ORGANIZATION"),
  evidenceUpload.array("evidence", 5),
  async (req: AuthRequest, res, next) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    try {
      const input = impactReportInput.parse(req.body);
      if (files.length < 1) { res.status(400).json({ message: "Cần tải lên từ 1 đến 5 file bằng chứng" }); return; }
      if (!files.every(hasValidEvidenceSignature)) {
        removeUploaded(files); res.status(400).json({ message: "Nội dung file không khớp định dạng JPG, PNG hoặc PDF" }); return;
      }
      const campaign = (await query<{ id: string; status: CampaignStatus; raised_amount: string }>(
        "SELECT id,status,raised_amount FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL",
        [req.params.id, req.user!.sub]
      ))[0];
      if (!campaign) { removeUploaded(files); res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
      if (!["APPROVED", "CLOSED"].includes(campaign.status)) {
        removeUploaded(files); res.status(409).json({ message: "Chỉ chiến dịch đã duyệt hoặc đã đóng mới nhận báo cáo" }); return;
      }
      const milestone = (await query<{ id: string; status: string }>("SELECT id,status FROM campaign_milestones WHERE id=$1 AND campaign_id=$2", [input.milestoneId, campaign.id]))[0];
      if (!milestone || !["IN_PROGRESS", "SUBMITTED"].includes(milestone.status)) {
        removeUploaded(files); res.status(409).json({ message: "Mốc báo cáo không hợp lệ hoặc chưa được thực hiện" }); return;
      }
      const allocationTotal = input.allocations.reduce((sum, item) => sum + item.amount, 0);
      if (allocationTotal !== input.amountUsed) {
        removeUploaded(files); res.status(409).json({ message: "Tổng phân bổ ngân sách phải bằng số tiền báo cáo" }); return;
      }
      const budgetIds = await query<{ id: string }>("SELECT id FROM campaign_budget_items WHERE campaign_id=$1 AND id=ANY($2::uuid[])", [campaign.id, input.allocations.map((item) => item.budget_item_id)]);
      if (budgetIds.length !== new Set(input.allocations.map((item) => item.budget_item_id)).size) {
        removeUploaded(files); res.status(409).json({ message: "Hạng mục ngân sách không thuộc chiến dịch" }); return;
      }
      const allocated = (await query<{ total: string }>(
        "SELECT COALESCE(SUM(amount_used),0)::text AS total FROM impact_reports WHERE campaign_id=$1 AND deleted_at IS NULL AND status IN ('PENDING_REVIEW','VERIFIED')",
        [req.params.id]
      ))[0];
      if (Number(allocated.total) + input.amountUsed > Number(campaign.raised_amount)) {
        removeUploaded(files); res.status(409).json({ message: "Số tiền báo cáo vượt quá số tiền chiến dịch đã nhận" }); return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`impact-report:${req.params.id}`]);
        const liveCampaign = await client.query("SELECT raised_amount FROM campaigns WHERE id=$1 FOR UPDATE", [req.params.id]);
        const liveAllocated = await client.query(
          "SELECT COALESCE(SUM(amount_used),0)::text AS total FROM impact_reports WHERE campaign_id=$1 AND deleted_at IS NULL AND status IN ('PENDING_REVIEW','VERIFIED')",
          [req.params.id]
        );
        if (Number(liveAllocated.rows[0].total) + input.amountUsed > Number(liveCampaign.rows[0].raised_amount)) {
          await client.query("ROLLBACK");
          removeUploaded(files);
          res.status(409).json({ message: "Số tiền báo cáo vượt quá số tiền chiến dịch đã nhận" });
          return;
        }
        const inserted = await client.query(
          `INSERT INTO impact_reports(campaign_id,organization_id,title,description,amount_used,report_date,milestone_id)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [req.params.id, req.user!.sub, input.title, input.description, input.amountUsed, input.reportDate, input.milestoneId]
        );
        const report = inserted.rows[0];
        for (const allocation of input.allocations) {
          await client.query("INSERT INTO impact_report_allocations(report_id,budget_item_id,amount) VALUES($1,$2,$3)", [report.id, allocation.budget_item_id, allocation.amount]);
        }
        for (const file of files) {
          const sha256 = createHash("sha256").update(fs.readFileSync(file.path)).digest("hex");
          await client.query(
            `INSERT INTO impact_evidence(report_id,original_name,stored_path,mime_type,size_bytes,sha256)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [report.id, file.originalname, file.path, file.mimetype, file.size, sha256]
          );
        }
        await client.query(
          "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,new_value) VALUES($1,'IMPACT_REPORT_SUBMITTED','IMPACT_REPORT',$2,$3::jsonb)",
          [req.user!.sub, report.id, JSON.stringify(report)]
        );
        await client.query("UPDATE campaign_escrows SET contract_state='USAGE_SUBMITTED',updated_at=now() WHERE campaign_id=$1", [req.params.id]);
        await client.query("COMMIT");
        impactSubmitted.inc();
        res.status(201).json({ ...report, evidence_count: files.length });
      } catch (error) {
        await client.query("ROLLBACK");
        removeUploaded(files);
        throw error;
      } finally { client.release(); }
    } catch (error) { if (!res.headersSent) removeUploaded(files); next(error); }
  }
);

app.get("/organization/campaigns/:id/impact-reports", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const campaign = (await query<{ id: string }>("SELECT id FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL", [req.params.id, req.user!.sub]))[0];
    if (!campaign) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    res.json(await query(
      `SELECT ir.*,COALESCE(json_agg(json_build_object('id',ie.id,'original_name',ie.original_name,'mime_type',ie.mime_type,'sha256',ie.sha256))
       FILTER (WHERE ie.id IS NOT NULL),'[]') AS evidence
       FROM impact_reports ir LEFT JOIN impact_evidence ie ON ie.report_id=ir.id
       WHERE ir.campaign_id=$1 AND ir.deleted_at IS NULL GROUP BY ir.id ORDER BY ir.created_at DESC`,
      [req.params.id]
    ));
  } catch (error) { next(error); }
});

app.patch("/organization/impact-reports/:id", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  const parsed = impactReportInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Báo cáo quỹ không hợp lệ", issues: parsed.error.issues }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{
      id: string; status: ImpactReportStatus; campaign_id: string; raised_amount: string;
    }>(
      `SELECT ir.id,ir.status,ir.campaign_id,c.raised_amount::text
       FROM impact_reports ir JOIN campaigns c ON c.id=ir.campaign_id
       WHERE ir.id=$1 AND ir.organization_id=$2 AND ir.deleted_at IS NULL AND c.deleted_at IS NULL FOR UPDATE`,
      [req.params.id, req.user!.sub],
    );
    const report = selected.rows[0];
    if (!report) { await client.query("ROLLBACK"); res.status(404).json({ message: "Không tìm thấy báo cáo quỹ" }); return; }
    if (!["DRAFT", "REJECTED"].includes(report.status)) {
      await client.query("ROLLBACK");
      res.status(409).json({ message: "Chỉ sửa báo cáo nháp hoặc bị từ chối; báo cáo đã gửi/đã duyệt bị khóa" });
      return;
    }
    const allocationTotal = parsed.data.allocations.reduce((sum, item) => sum + item.amount, 0);
    if (allocationTotal !== parsed.data.amountUsed) {
      await client.query("ROLLBACK");
      res.status(409).json({ message: "Tổng phân bổ ngân sách phải bằng số tiền báo cáo" });
      return;
    }
    const budgetIds = await client.query<{ id: string }>(
      "SELECT id FROM campaign_budget_items WHERE campaign_id=$1 AND id=ANY($2::uuid[])",
      [report.campaign_id, parsed.data.allocations.map((item) => item.budget_item_id)],
    );
    if (budgetIds.rows.length !== new Set(parsed.data.allocations.map((item) => item.budget_item_id)).size) {
      await client.query("ROLLBACK");
      res.status(409).json({ message: "Hạng mục ngân sách không thuộc chiến dịch" });
      return;
    }
    const allocated = await client.query<{ total: string }>(
      "SELECT COALESCE(SUM(amount_used),0)::text AS total FROM impact_reports WHERE campaign_id=$1 AND id<>$2 AND deleted_at IS NULL AND status IN ('PENDING_REVIEW','VERIFIED')",
      [report.campaign_id, report.id],
    );
    if (Number(allocated.rows[0].total) + parsed.data.amountUsed > Number(report.raised_amount)) {
      await client.query("ROLLBACK");
      res.status(409).json({ message: "Số tiền báo cáo vượt quá số tiền chiến dịch đã nhận" });
      return;
    }
    const updated = await client.query(
      `UPDATE impact_reports SET title=$1,description=$2,amount_used=$3,report_date=$4,milestone_id=$5,
         status='DRAFT',rejection_reason=NULL,updated_at=now()
       WHERE id=$6 RETURNING *`,
      [parsed.data.title, parsed.data.description, parsed.data.amountUsed, parsed.data.reportDate, parsed.data.milestoneId, report.id],
    );
    await client.query("DELETE FROM impact_report_allocations WHERE report_id=$1", [report.id]);
    for (const allocation of parsed.data.allocations) {
      await client.query("INSERT INTO impact_report_allocations(report_id,budget_item_id,amount) VALUES($1,$2,$3)", [report.id, allocation.budget_item_id, allocation.amount]);
    }
    await client.query(
      "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,previous_value,new_value) VALUES($1,'IMPACT_REPORT_UPDATED','IMPACT_REPORT',$2,$3::jsonb,$4::jsonb)",
      [req.user!.sub, report.id, JSON.stringify(report), JSON.stringify(updated.rows[0])],
    );
    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); next(error); } finally { client.release(); }
});

app.post("/organization/impact-reports/:id/submit", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const evidence = (await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM impact_evidence ie
       JOIN impact_reports ir ON ir.id=ie.report_id
       WHERE ir.id=$1 AND ir.organization_id=$2 AND ir.deleted_at IS NULL`,
      [req.params.id, req.user!.sub],
    ))[0];
    if (Number(evidence?.count ?? 0) < 1) { res.status(409).json({ message: "Cần ít nhất một bằng chứng trước khi gửi duyệt" }); return; }
    const before = (await query<{ id: string; status: ImpactReportStatus }>(
      "SELECT id,status FROM impact_reports WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL",
      [req.params.id, req.user!.sub],
    ))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy báo cáo quỹ" }); return; }
    if (!["DRAFT", "REJECTED"].includes(before.status)) { res.status(409).json({ message: "Chỉ gửi duyệt báo cáo nháp hoặc bị từ chối" }); return; }
    const rows = await query(
      "UPDATE impact_reports SET status='PENDING_REVIEW',submitted_at=now(),rejection_reason=NULL,updated_at=now() WHERE id=$1 RETURNING *",
      [req.params.id],
    );
    await audit(req.user!.sub, "IMPACT_REPORT_RESUBMITTED", String(req.params.id), before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.delete("/organization/impact-reports/:id", authenticate, authorize("ORGANIZATION"), async (req: AuthRequest, res, next) => {
  try {
    const before = (await query<{ id: string; status: ImpactReportStatus }>(
      "SELECT id,status FROM impact_reports WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL",
      [req.params.id, req.user!.sub],
    ))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy báo cáo quỹ" }); return; }
    if (!["DRAFT", "REJECTED"].includes(before.status)) {
      res.status(409).json({ message: "Chỉ xóa mềm báo cáo nháp hoặc bị từ chối; báo cáo đã gửi/đã duyệt bị khóa" });
      return;
    }
    const rows = await query("UPDATE impact_reports SET deleted_at=now(),updated_at=now() WHERE id=$1 RETURNING id,status,deleted_at", [req.params.id]);
    await audit(req.user!.sub, "IMPACT_REPORT_SOFT_DELETED", String(req.params.id), before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/admin/impact-reports", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const status = z.enum(["PENDING_REVIEW", "VERIFIED", "REJECTED"]).optional().parse(req.query.status);
    res.json(await query(
      `SELECT ir.*,c.title AS campaign_title,c.organization_name,
              COALESCE(json_agg(json_build_object('id',ie.id,'original_name',ie.original_name,'mime_type',ie.mime_type,'sha256',ie.sha256))
              FILTER (WHERE ie.id IS NOT NULL),'[]') AS evidence
       FROM impact_reports ir JOIN campaigns c ON c.id=ir.campaign_id
       LEFT JOIN impact_evidence ie ON ie.report_id=ir.id
       WHERE ir.deleted_at IS NULL AND ($1::impact_report_status IS NULL OR ir.status=$1)
       GROUP BY ir.id,c.title,c.organization_name ORDER BY ir.submitted_at`,
      [status ?? null]
    ));
  } catch (error) { next(error); }
});

app.patch("/admin/impact-reports/:id/status", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  const input = z.object({ status: z.enum(["VERIFIED", "REJECTED"]), reason: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ message: "Dữ liệu kiểm duyệt không hợp lệ" }); return; }
  if (input.data.status === "REJECTED" && !input.data.reason) { res.status(400).json({ message: "Cần nhập lý do từ chối" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT ir.*,c.title AS campaign_title FROM impact_reports ir
       JOIN campaigns c ON c.id=ir.campaign_id WHERE ir.id=$1 AND ir.deleted_at IS NULL AND c.deleted_at IS NULL FOR UPDATE`,
      [req.params.id]
    );
    const report = selected.rows[0];
    if (!report) { await client.query("ROLLBACK"); res.status(404).json({ message: "Không tìm thấy báo cáo" }); return; }
    if (report.status !== "PENDING_REVIEW") { await client.query("ROLLBACK"); res.status(409).json({ message: "Báo cáo đã được kiểm duyệt" }); return; }
    const updated = await client.query(
      `UPDATE impact_reports SET status=$1,rejection_reason=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now()
       WHERE id=$4 RETURNING *`,
      [input.data.status, input.data.reason ?? null, req.user!.sub, req.params.id]
    );
    await client.query(
      "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,previous_value,new_value) VALUES($1,$2,'IMPACT_REPORT',$3,$4::jsonb,$5::jsonb)",
      [req.user!.sub, `IMPACT_REPORT_${input.data.status}`, report.id, JSON.stringify(report), JSON.stringify(updated.rows[0])]
    );
    if (input.data.status === "VERIFIED") {
      const evidence = await client.query("SELECT original_name,mime_type,sha256 FROM impact_evidence WHERE report_id=$1 ORDER BY created_at", [report.id]);
      const createdAt = new Date().toISOString();
      const publicPayload = {
        report_id: report.id, campaign_id: report.campaign_id, campaign_title: report.campaign_title,
        title: report.title, amount_used: Number(report.amount_used), report_date: report.report_date,
        evidence_hashes: evidence.rows.map((item) => ({ name: item.original_name, mime_type: item.mime_type, sha256: item.sha256 }))
      };
      const event = {
        event_id: report.id, event_type: "FUND_USAGE_VERIFIED", campaign_id: report.campaign_id,
        entity_id: report.id, created_at: createdAt, public_payload: publicPayload
      };
      await client.query(
        "INSERT INTO campaign_outbox_events(id,event_type,payload) VALUES($1,'transparency.record',$2::jsonb) ON CONFLICT(id) DO NOTHING",
        [report.id, JSON.stringify(event)]
      );
      await client.query(
        `UPDATE campaign_escrows SET released_amount=released_amount+$1,locked_amount=GREATEST(0,locked_amount-$1),
           contract_state='FUND_RELEASED',updated_at=now() WHERE campaign_id=$2`,
        [report.amount_used, report.campaign_id]
      );
      await client.query(
        `INSERT INTO escrow_state_history(campaign_id,state,amount,source_event_id)
         VALUES($1,'FUND_RELEASED',$2,$3) ON CONFLICT(source_event_id,state) DO NOTHING`,
        [report.campaign_id, report.amount_used, report.id]
      );
      if (report.milestone_id) await client.query("UPDATE campaign_milestones SET status='VERIFIED',updated_at=now() WHERE id=$1", [report.milestone_id]);
    } else {
      await client.query(
        `UPDATE campaign_escrows SET contract_state=CASE WHEN locked_amount>0 THEN 'FUND_LOCKED' ELSE 'DONATION_OPEN' END,updated_at=now()
         WHERE campaign_id=$1`, [report.campaign_id]
      );
      if (report.milestone_id) await client.query("UPDATE campaign_milestones SET status='IN_PROGRESS',updated_at=now() WHERE id=$1", [report.milestone_id]);
    }
    await client.query("COMMIT");
    impactReviewed.inc({ status: input.data.status });
    if (report.submitted_at) impactReviewDuration.observe(Math.max(0, (Date.now() - new Date(report.submitted_at).getTime()) / 1000));
    if (input.data.status === "VERIFIED") await queueCampaignUpdate(String(report.campaign_id), "IMPACT_VERIFIED", String(report.campaign_title), `Báo cáo “${report.title}” đã được xác minh.`);
    await invalidatePublicCache(String(report.campaign_id));
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

const reportInput = z.object({
  category: z.enum(["FRAUD", "MISUSE", "FAKE_INFO", "DUPLICATE", "OTHER"]),
  detail: z.string().trim().min(10).max(2000),
  reporter_email: z.string().trim().email().max(200).optional().or(z.literal("")),
});

function makeReportCode(): string {
  return `BC-${new Date().getFullYear()}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

app.post("/campaigns/:id/reports", async (req, res, next) => {
  try {
    const parsed = reportInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Dữ liệu báo cáo không hợp lệ", issues: parsed.error.issues }); return; }
    const campaign = (await query<{ id: string; title: string }>("SELECT id,title FROM campaigns WHERE id=$1 AND deleted_at IS NULL", [req.params.id]))[0];
    if (!campaign) { res.status(404).json({ message: "Không tìm thấy chiến dịch" }); return; }
    const referenceCode = makeReportCode();
    const rows = await query<{ reference_code: string; status: string; created_at: string }>(
      `INSERT INTO campaign_reports(reference_code,campaign_id,reporter_email,category,detail)
       VALUES($1,$2,$3,$4,$5) RETURNING reference_code,status,created_at`,
      [referenceCode, campaign.id, parsed.data.reporter_email || null, parsed.data.category, parsed.data.detail]
    );
    res.status(201).json({
      ...rows[0], campaign_id: campaign.id, campaign_title: campaign.title,
      message: "Đã tiếp nhận báo cáo. Vui lòng lưu mã tiếp nhận để tra cứu kết quả xử lý.",
    });
  } catch (error) { next(error); }
});

app.get("/reports/:code", async (req, res, next) => {
  try {
    const row = (await query<{
      reference_code: string; category: string; status: string; resolution: string | null;
      campaign_id: string; created_at: string; reviewed_at: string | null; title: string;
    }>(
      `SELECT r.reference_code,r.category,r.status,r.resolution,r.campaign_id,r.created_at,r.reviewed_at,c.title
       FROM campaign_reports r JOIN campaigns c ON c.id=r.campaign_id WHERE r.reference_code=$1`,
      [req.params.code]
    ))[0];
    if (!row) { res.status(404).json({ message: "Không tìm thấy báo cáo với mã này" }); return; }
    res.json({
      reference_code: row.reference_code, category: row.category, status: row.status, resolution: row.resolution,
      campaign_id: row.campaign_id, campaign_title: row.title, created_at: row.created_at, reviewed_at: row.reviewed_at,
    });
  } catch (error) { next(error); }
});

app.get("/campaigns/:id/reports/public", async (req, res, next) => {
  try {
    const summary = (await query<{ total: string; resolved: string; open: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER(WHERE status IN ('RESOLVED','DISMISSED'))::text AS resolved,
              count(*) FILTER(WHERE status IN ('RECEIVED','REVIEWING'))::text AS open
       FROM campaign_reports WHERE campaign_id=$1`, [req.params.id]
    ))[0];
    const items = await query(
      `SELECT reference_code,category,status,resolution,created_at,reviewed_at
       FROM campaign_reports WHERE campaign_id=$1 AND status IN ('RESOLVED','DISMISSED')
       ORDER BY reviewed_at DESC NULLS LAST LIMIT 20`, [req.params.id]
    );
    res.json({ total: Number(summary.total), resolved: Number(summary.resolved), open: Number(summary.open), items });
  } catch (error) { next(error); }
});

app.get("/admin/reports", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const status = z.enum(["RECEIVED", "REVIEWING", "RESOLVED", "DISMISSED"]).optional().parse(req.query.status);
    const rows = await query(
      `SELECT r.*,c.title AS campaign_title FROM campaign_reports r JOIN campaigns c ON c.id=r.campaign_id
       WHERE ($1::text IS NULL OR r.status=$1) ORDER BY r.created_at ASC`, [status ?? null]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.patch("/admin/reports/:id/status", authenticate, authorize("ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const input = z.object({ status: z.enum(["REVIEWING", "RESOLVED", "DISMISSED"]), resolution: z.string().trim().max(1000).optional() }).parse(req.body);
    if ((input.status === "RESOLVED" || input.status === "DISMISSED") && !input.resolution) {
      res.status(400).json({ message: "Cần nhập kết quả xử lý công khai" }); return;
    }
    const before = (await query<{ status: string }>("SELECT status FROM campaign_reports WHERE id=$1", [req.params.id]))[0];
    if (!before) { res.status(404).json({ message: "Không tìm thấy báo cáo" }); return; }
    const terminal = input.status === "RESOLVED" || input.status === "DISMISSED";
    const transitionAllowed = (before.status === "RECEIVED" && input.status === "REVIEWING")
      || (before.status === "REVIEWING" && terminal);
    if (!transitionAllowed) {
      res.status(409).json({ message: "Báo cáo phải qua bước đang xem xét trước khi có kết quả cuối cùng" }); return;
    }
    const rows = await query(
      `UPDATE campaign_reports SET status=$1,resolution=COALESCE($2,resolution),
         reviewed_at=CASE WHEN $3 THEN now() ELSE reviewed_at END,reviewed_by=$4
       WHERE id=$5 RETURNING *`,
      [input.status, input.resolution ?? null, terminal, req.user!.sub, req.params.id]
    );
    await audit(req.user!.sub, `CAMPAIGN_REPORT_${input.status}`, String(req.params.id), before, rows[0]);
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get("/internal/campaigns/:id/donation-eligibility", internalOnly, async (req, res, next) => {
  try {
    const row = (await query<{ id: string; status: CampaignStatus; end_date: Date; title: string; organization_id: string }>("SELECT id,status,end_date,title,organization_id FROM campaigns WHERE id=$1 AND deleted_at IS NULL", [req.params.id]))[0];
    if (!row) { res.status(404).json({ eligible: false, reason: "NOT_FOUND" }); return; }
    res.json({ ...row, eligible: isDonationEligible(row.status, new Date(row.end_date)), reason: isDonationEligible(row.status, new Date(row.end_date)) ? null : "NOT_ACTIVE" });
  } catch (error) { next(error); }
});

app.get("/internal/campaigns/:id/owner", internalOnly, async (req, res, next) => {
  try {
    const row = (await query("SELECT organization_id,title FROM campaigns WHERE id=$1 AND deleted_at IS NULL", [req.params.id]))[0];
    if (!row) { res.status(404).json({ message: "Not found" }); return; }
    res.json(row);
  } catch (error) { next(error); }
});

app.get("/internal/donations/:eventId/reconciliation", internalOnly, async (req, res, next) => {
  try {
    const processed = (await query<{ campaign_id: string; amount: string }>("SELECT campaign_id,amount FROM processed_donation_events WHERE event_id=$1", [req.params.eventId]))[0];
    const locked = (await query<{ amount: string }>("SELECT amount FROM escrow_state_history WHERE source_event_id=$1 AND state='DONATION_OPEN'", [req.params.eventId]))[0];
    const escrow = processed ? (await query<{ contract_state: string }>("SELECT contract_state FROM campaign_escrows WHERE campaign_id=$1", [processed.campaign_id]))[0] : undefined;
    res.json({
      credited: Boolean(processed),
      locked: Boolean(locked),
      campaign_id: processed?.campaign_id ?? null,
      credited_amount: processed ? Number(processed.amount) : null,
      contract_state: escrow?.contract_state ?? null,
    });
  } catch (error) { next(error); }
});

app.get("/admin/sync/campaign", authenticate, authorize("ADMIN"), async (_req, res, next) => {
  try {
    const totals = (await query<{
      campaigns_total: string; processed_donation_events: string; processed_amount: string;
      raised_amount: string; pending_outbox: string; linked_organizations: string;
    }>(
      `SELECT
         (SELECT count(*) FROM campaigns WHERE deleted_at IS NULL)::text AS campaigns_total,
         (SELECT count(*) FROM processed_donation_events)::text AS processed_donation_events,
         (SELECT COALESCE(sum(amount),0) FROM processed_donation_events)::text AS processed_amount,
         (SELECT COALESCE(sum(raised_amount),0) FROM campaigns WHERE deleted_at IS NULL)::text AS raised_amount,
         (SELECT count(*) FROM campaign_outbox_events WHERE published_at IS NULL)::text AS pending_outbox,
         (SELECT count(DISTINCT organization_id) FROM campaigns WHERE deleted_at IS NULL)::text AS linked_organizations`,
    ))[0];
    const campaigns = await query<{ campaign_id: string; amount: string; event_count: string }>(
      `SELECT campaign_id::text,COALESCE(sum(amount),0)::text AS amount,count(*)::text AS event_count
       FROM processed_donation_events GROUP BY campaign_id ORDER BY campaign_id`,
    );
    res.json({
      service: "campaign", as_of: new Date().toISOString(), status: "READY",
      totals: Object.fromEntries(Object.entries(totals ?? {}).map(([key, value]) => [key, Number(value)])),
      campaigns: campaigns.map((item) => ({ campaign_id: item.campaign_id, amount: Number(item.amount), event_count: Number(item.event_count) })),
    });
  } catch (error) { next(error); }
});

app.get("/internal/organizations/:id/campaign-ids", internalOnly, async (req, res, next) => {
  try {
    const rows = await query<{ id: string }>("SELECT id FROM campaigns WHERE organization_id=$1 AND deleted_at IS NULL", [req.params.id]);
    res.json({ campaign_ids: rows.map((row) => row.id) });
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: "Dữ liệu chiến dịch không hợp lệ", issues: error.issues }); return; }
  console.error("EXPRESS_ERROR_HANDLER_CAUGHT:", error);
  res.status(500).json({ message: "Lỗi hệ thống Campaign Service" });
});
