import jwt from "jsonwebtoken";
import request from "supertest";

const mockRedisClient = {
  on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined), get: jest.fn(), setEx: jest.fn(), del: jest.fn(),
  isReady: false,
  scanIterator: jest.fn(() => (async function* (): AsyncGenerator<string> { if (false) yield ""; })())
};
const mockConnection = { query: jest.fn(), release: jest.fn() };
const mockPool = { connect: jest.fn().mockResolvedValue(mockConnection) };
jest.mock("redis", () => ({ createClient: () => mockRedisClient }));
jest.mock("../src/db", () => ({ query: jest.fn(), audit: jest.fn(), pool: mockPool }));

import { app } from "../src/app";
import { audit, query } from "../src/db";

const queryMock = query as jest.MockedFunction<typeof query>;
const auditMock = audit as jest.MockedFunction<typeof audit>;
const fetchMock = jest.fn();
global.fetch = fetchMock as never;
const orgToken = jwt.sign({ sub: "00000000-0000-0000-0000-000000000002", email: "org@test.vn", name: "Org", role: "ORGANIZATION" }, "local-charityconnect-secret");
const adminToken = jwt.sign({ sub: "00000000-0000-0000-0000-000000000003", email: "admin@test.vn", name: "Admin", role: "ADMIN" }, "local-charityconnect-secret");
const future = new Date(Date.now() + 86_400_000).toISOString();
const milestoneId = "10000000-0000-0000-0000-000000000001";
const budgetId = "20000000-0000-0000-0000-000000000001";
const allocations = JSON.stringify([{ budget_item_id: budgetId, amount: 12000000 }]);
const validCampaign = { title: "Xây lớp học vùng cao", summary: "Chung tay xây dựng lớp học an toàn", description: "Nội dung chi tiết đủ dài để vượt qua kiểm tra dữ liệu đầu vào.", category: "EDUCATION", goalAmount: 10000000, endDate: future };

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  mockConnection.query.mockReset();
  mockRedisClient.isReady = false;
  mockPool.connect.mockResolvedValue(mockConnection);
  mockConnection.query.mockResolvedValue({ rows: [] });
});

describe("campaign HTTP API", () => {
  it("reports health and validates public input", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/campaigns?category=INVALID")).status).toBe(400);
  });

  it("returns public, organization and admin campaign analytics", async () => {
    const totals = [{ campaign_count: "4", active_count: "3", closed_count: "1", pending_count: "0", goal_amount: "1000000", raised_amount: "700000" }];
    const categories = [{ category: "EDUCATION", campaign_count: 4, raised_amount: 700000 }];
    const progress = [{ id: "c1", title: "Lớp học", progress_percent: 70 }];
    queryMock.mockResolvedValueOnce(totals as never).mockResolvedValueOnce(categories as never).mockResolvedValueOnce(progress as never);
    const publicResult = await request(app).get("/analytics/campaigns/public?period=all");
    expect(publicResult.status).toBe(200);
    expect(publicResult.body.totals.raised_amount).toBe(700000);
    expect(publicResult.body.period).toBe("all");

    queryMock.mockResolvedValueOnce(totals as never).mockResolvedValueOnce(categories as never).mockResolvedValueOnce(progress as never);
    const organization = await request(app).get("/analytics/campaigns/organization?period=7d").set("Authorization", `Bearer ${orgToken}`);
    expect(organization.status).toBe(200);
    expect(queryMock.mock.calls[3][1]).toEqual(["00000000-0000-0000-0000-000000000002"]);

    queryMock.mockResolvedValueOnce(totals as never).mockResolvedValueOnce(categories as never).mockResolvedValueOnce(progress as never);
    expect((await request(app).get("/analytics/campaigns/admin?period=90d").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
    expect((await request(app).get("/analytics/campaigns/public?period=wrong")).status).toBe(400);
    queryMock.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
    expect((await request(app).get("/analytics/campaigns/public")).body.totals).toEqual({});
  });

  it("lists and reads public approved campaigns", async () => {
    queryMock.mockResolvedValueOnce([{ id: "c1", title: "Chiến dịch" }] as never);
    expect((await request(app).get("/campaigns")).body).toHaveLength(1);
    queryMock.mockResolvedValueOnce([{ id: "c1", title: "Chiến dịch", status: "APPROVED" }] as never);
    expect((await request(app).get("/campaigns/c1")).status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).get("/campaigns/missing")).status).toBe(404);
  });

  it("lists organization campaigns", async () => {
    queryMock.mockResolvedValueOnce([{ id: "c1" }] as never);
    expect((await request(app).get("/organization/campaigns").set("Authorization", `Bearer ${orgToken}`)).status).toBe(200);
  });

  it("creates a draft only for verified organizations", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ status: "VERIFIED", legal_name: "Quỹ Ánh Dương" }) });
    queryMock.mockResolvedValueOnce([{ id: "c1", status: "DRAFT" }] as never);
    const response = await request(app).post("/organization/campaigns").set("Authorization", `Bearer ${orgToken}`).field("title", validCampaign.title).field("summary", validCampaign.summary).field("description", validCampaign.description).field("category", validCampaign.category).field("goalAmount", String(validCampaign.goalAmount)).field("endDate", validCampaign.endDate);
    expect(response.status).toBe(201);
    expect(auditMock).toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ json: async () => ({ status: "PENDING" }) });
    expect((await request(app).post("/organization/campaigns").set("Authorization", `Bearer ${orgToken}`).field("title", validCampaign.title).field("summary", validCampaign.summary).field("description", validCampaign.description).field("category", validCampaign.category).field("goalAmount", String(validCampaign.goalAmount)).field("endDate", validCampaign.endDate)).status).toBe(403);
  });

  it("updates editable drafts and blocks approved edits", async () => {
    queryMock.mockResolvedValueOnce([{ id: "c1", status: "DRAFT" }] as never).mockResolvedValueOnce([{ id: "c1", status: "DRAFT", title: validCampaign.title }] as never);
    expect((await request(app).put("/organization/campaigns/c1").set("Authorization", `Bearer ${orgToken}`).field("title", validCampaign.title).field("summary", validCampaign.summary).field("description", validCampaign.description).field("category", validCampaign.category).field("goalAmount", String(validCampaign.goalAmount)).field("endDate", validCampaign.endDate)).status).toBe(200);
    queryMock.mockResolvedValueOnce([{ id: "c1", status: "APPROVED" }] as never);
    expect((await request(app).put("/organization/campaigns/c1").set("Authorization", `Bearer ${orgToken}`).field("title", validCampaign.title).field("summary", validCampaign.summary).field("description", validCampaign.description).field("category", validCampaign.category).field("goalAmount", String(validCampaign.goalAmount)).field("endDate", validCampaign.endDate)).status).toBe(409);
  });

  it("submits verified drafts for review", async () => {
    queryMock.mockResolvedValueOnce([{ status: "DRAFT" }] as never).mockResolvedValueOnce([{ goal_amount: "10000000", budget_total: "10000000", milestone_count: "1" }] as never).mockResolvedValueOnce([{ id: "c1", status: "PENDING_REVIEW" }] as never);
    fetchMock.mockResolvedValueOnce({ json: async () => ({ status: "VERIFIED" }) });
    expect((await request(app).post("/organization/campaigns/c1/submit").set("Authorization", `Bearer ${orgToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([{ status: "APPROVED" }] as never);
    expect((await request(app).post("/organization/campaigns/c1/submit").set("Authorization", `Bearer ${orgToken}`)).status).toBe(409);
  });

  it("closes approved campaigns", async () => {
    queryMock.mockResolvedValueOnce([{ status: "APPROVED" }] as never).mockResolvedValueOnce([{ id: "c1", status: "CLOSED" }] as never);
    expect((await request(app).post("/organization/campaigns/c1/close").set("Authorization", `Bearer ${orgToken}`)).status).toBe(200);
  });

  it("lists and reviews campaigns as admin", async () => {
    queryMock.mockResolvedValueOnce([{ id: "c1", status: "PENDING_REVIEW" }] as never);
    expect((await request(app).get("/admin/campaigns?status=PENDING_REVIEW").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([{ status: "PENDING_REVIEW" }] as never).mockResolvedValueOnce([{ id: "c1", status: "APPROVED" }] as never);
    mockRedisClient.isReady = true;
    mockRedisClient.scanIterator.mockImplementationOnce(() => (async function* () { yield "campaigns:public:all:"; })());
    expect((await request(app).patch("/admin/campaigns/c1/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "APPROVED" })).status).toBe(200);
    expect(auditMock).toHaveBeenCalled();
    expect(mockRedisClient.del).toHaveBeenCalled();
    expect((await request(app).patch("/admin/campaigns/c1/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "REJECTED" })).status).toBe(400);
  });

  it("exposes eligibility and ownership internally", async () => {
    queryMock.mockResolvedValueOnce([{ id: "c1", status: "APPROVED", end_date: new Date(Date.now() + 1000), title: "C", organization_id: "o1" }] as never);
    const eligibility = await request(app).get("/internal/campaigns/c1/donation-eligibility").set("x-internal-token", "local-internal-token");
    expect(eligibility.body.eligible).toBe(true);
    queryMock.mockResolvedValueOnce([{ organization_id: "o1", title: "C" }] as never);
    expect((await request(app).get("/internal/campaigns/c1/owner").set("x-internal-token", "local-internal-token")).status).toBe(200);
  });

  it("maps unexpected failures to a stable error response", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    expect((await request(app).get("/campaigns")).status).toBe(500);
  });

  it("publishes only verified impact reports", async () => {
    queryMock.mockResolvedValueOnce([{ id: "r1", status: "VERIFIED", evidence: [] }] as never);
    const response = await request(app).get("/campaigns/c1/impact-reports");
    expect(response.status).toBe(200);
    expect(response.body[0].status).toBe("VERIFIED");
  });

  it("shows the public simulated escrow contract and handles missing data", async () => {
    queryMock.mockResolvedValueOnce([{ campaign_id: "c1", total_donated: "500000", released_amount: "125000", locked_amount: "375000", contract_state: "FUND_LOCKED", history: [] }] as never);
    const contract = await request(app).get("/campaigns/c1/contract");
    expect(contract.status).toBe(200);
    expect(contract.body.contract_state).toBe("FUND_LOCKED");
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).get("/campaigns/missing/contract")).status).toBe(404);
  });

  it("lets an organization submit evidence within the raised amount", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "c1", status: "APPROVED", raised_amount: "50000000" }] as never)
      .mockResolvedValueOnce([{ id: milestoneId, status: "IN_PROGRESS" }] as never)
      .mockResolvedValueOnce([{ id: budgetId }] as never)
      .mockResolvedValueOnce([{ total: "10000000" }] as never);
    mockConnection.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // Advisory Lock
      .mockResolvedValueOnce({ rows: [{ raised_amount: "50000000" }] }) // liveCampaign
      .mockResolvedValueOnce({ rows: [{ total: "10000000" }] }) // liveAllocated
      .mockResolvedValueOnce({ rows: [{ id: "r1", campaign_id: "c1", status: "PENDING_REVIEW" }] }) // insert report
      .mockResolvedValueOnce({}) // allocations
      .mockResolvedValueOnce({}) // evidence
      .mockResolvedValueOnce({}) // audit log
      .mockResolvedValueOnce({}) // update escrow
      .mockResolvedValueOnce({}); // COMMIT
    const response = await request(app)
      .post("/organization/campaigns/c1/impact-reports")
      .set("Authorization", `Bearer ${orgToken}`)
      .field("title", "Nghiệm thu bàn ghế")
      .field("description", "Bàn ghế đã được bàn giao đủ cho điểm trường.")
      .field("amountUsed", "12000000")
      .field("reportDate", "2026-06-20")
      .field("milestoneId", milestoneId)
      .field("allocations", allocations)
      .attach("evidence", Buffer.from("%PDF-1.4 proof"), { filename: "nghiem-thu.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(201);
    expect(response.body.evidence_count).toBe(1);
    expect(mockConnection.query).toHaveBeenCalledWith("COMMIT");
  });

  it("approves an impact report and writes an idempotent outbox event", async () => {
    queryMock.mockResolvedValueOnce([] as never); // queueCampaignUpdate outbox
    mockConnection.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "r1", campaign_id: "c1", campaign_title: "Lớp học", title: "Nghiệm thu", amount_used: "12000000", report_date: "2026-06-20", status: "PENDING_REVIEW" }] }) // selected FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: "r1", status: "VERIFIED" }] }) // UPDATE report status
      .mockResolvedValueOnce({}) // audit logs
      .mockResolvedValueOnce({ rows: [{ original_name: "proof.pdf", mime_type: "application/pdf", sha256: "a".repeat(64) }] }) // evidence
      .mockResolvedValueOnce({}) // campaign outbox event
      .mockResolvedValueOnce({}) // campaign escrows update
      .mockResolvedValueOnce({}) // escrow state history
      .mockResolvedValueOnce({}); // COMMIT
    const response = await request(app)
      .patch("/admin/impact-reports/r1/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "VERIFIED" });
    expect(response.status).toBe(200);
    expect(mockConnection.query.mock.calls.some(([sql]) => String(sql).includes("campaign_outbox_events"))).toBe(true);
  });

  it("lists organization and admin impact queues with ownership checks", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "c1" }] as never)
      .mockResolvedValueOnce([{ id: "r1", status: "PENDING_REVIEW" }] as never);
    const own = await request(app).get("/organization/campaigns/c1/impact-reports").set("Authorization", `Bearer ${orgToken}`);
    expect(own.status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).get("/organization/campaigns/missing/impact-reports").set("Authorization", `Bearer ${orgToken}`)).status).toBe(404);
    queryMock.mockResolvedValueOnce([{ id: "r1", status: "PENDING_REVIEW" }] as never);
    expect((await request(app).get("/admin/impact-reports?status=PENDING_REVIEW").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
  });

  it("rejects impact submissions for invalid campaigns and budget overflow", async () => {
    queryMock.mockResolvedValueOnce([{ id: "c1", status: "DRAFT", raised_amount: "50000000" }] as never);
    const draftResponse = await request(app).post("/organization/campaigns/c1/impact-reports").set("Authorization", `Bearer ${orgToken}`)
      .field("title", "Nghiệm thu bàn ghế").field("description", "Bàn ghế đã được bàn giao đủ cho điểm trường.")
      .field("amountUsed", "12000000").field("reportDate", "2026-06-20").field("milestoneId", milestoneId).field("allocations", allocations)
      .attach("evidence", Buffer.from("%PDF-1.4 proof"), { filename: "proof.pdf", contentType: "application/pdf" });
    expect(draftResponse.status).toBe(409);

    queryMock
      .mockResolvedValueOnce([{ id: "c1", status: "APPROVED", raised_amount: "10000000" }] as never)
      .mockResolvedValueOnce([{ id: milestoneId, status: "IN_PROGRESS" }] as never)
      .mockResolvedValueOnce([{ id: budgetId }] as never)
      .mockResolvedValueOnce([{ total: "9000000" }] as never);
    const overflow = await request(app).post("/organization/campaigns/c1/impact-reports").set("Authorization", `Bearer ${orgToken}`)
      .field("title", "Nghiệm thu bàn ghế").field("description", "Bàn ghế đã được bàn giao đủ cho điểm trường.")
      .field("amountUsed", "2000000").field("reportDate", "2026-06-20").field("milestoneId", milestoneId).field("allocations", JSON.stringify([{ budget_item_id: budgetId, amount: 2000000 }]))
      .attach("evidence", Buffer.from("%PDF-1.4 proof"), { filename: "proof.pdf", contentType: "application/pdf" });
    expect(overflow.status).toBe(409);
  });

  it("rejects missing evidence and MIME-spoofed PDF content", async () => {
    const withoutFile = await request(app).post("/organization/campaigns/c1/impact-reports").set("Authorization", `Bearer ${orgToken}`)
      .field("title", "Nghiệm thu bàn ghế").field("description", "Bàn ghế đã được bàn giao đủ cho điểm trường.")
      .field("amountUsed", "2000000").field("reportDate", "2026-06-20").field("milestoneId", milestoneId).field("allocations", JSON.stringify([{ budget_item_id: budgetId, amount: 2000000 }]));
    expect(withoutFile.status).toBe(400);
    const spoofed = await request(app).post("/organization/campaigns/c1/impact-reports").set("Authorization", `Bearer ${orgToken}`)
      .field("title", "Nghiệm thu bàn ghế").field("description", "Bàn ghế đã được bàn giao đủ cho điểm trường.")
      .field("amountUsed", "2000000").field("reportDate", "2026-06-20").field("milestoneId", milestoneId).field("allocations", JSON.stringify([{ budget_item_id: budgetId, amount: 2000000 }]))
      .attach("evidence", Buffer.from("not-a-real-pdf"), { filename: "proof.pdf", contentType: "application/pdf" });
    expect(spoofed.status).toBe(400);
  });

  it("handles missing evidence and invalid impact review transitions", async () => {
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).get("/impact-evidence/missing")).status).toBe(404);
    expect((await request(app).patch("/admin/impact-reports/r1/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "REJECTED" })).status).toBe(400);
    expect((await request(app).patch("/admin/impact-reports/r1/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "WRONG" })).status).toBe(400);

    mockConnection.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({});
    expect((await request(app).patch("/admin/impact-reports/missing/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "VERIFIED" })).status).toBe(404);
    mockConnection.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: "r1", status: "VERIFIED" }] }).mockResolvedValueOnce({});
    expect((await request(app).patch("/admin/impact-reports/r1/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "VERIFIED" })).status).toBe(409);
  });

  it("catches a concurrent impact budget overflow inside the transaction", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "c1", status: "APPROVED", raised_amount: "50000000" }] as never)
      .mockResolvedValueOnce([{ id: milestoneId, status: "IN_PROGRESS" }] as never)
      .mockResolvedValueOnce([{ id: budgetId }] as never)
      .mockResolvedValueOnce([{ total: "0" }] as never);
    mockConnection.query
      .mockResolvedValueOnce({}).mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ raised_amount: "10000000" }] })
      .mockResolvedValueOnce({ rows: [{ total: "9000000" }] })
      .mockResolvedValueOnce({});
    const response = await request(app).post("/organization/campaigns/c1/impact-reports").set("Authorization", `Bearer ${orgToken}`)
      .field("title", "Nghiệm thu bàn ghế").field("description", "Bàn ghế đã được bàn giao đủ cho điểm trường.")
      .field("amountUsed", "2000000").field("reportDate", "2026-06-20").field("milestoneId", milestoneId).field("allocations", JSON.stringify([{ budget_item_id: budgetId, amount: 2000000 }]))
      .attach("evidence", Buffer.from("%PDF-1.4 proof"), { filename: "proof.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(409);
    expect(mockConnection.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
