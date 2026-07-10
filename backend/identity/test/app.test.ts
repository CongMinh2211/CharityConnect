import request from "supertest";

jest.mock("../src/db", () => ({ query: jest.fn(), audit: jest.fn(), pool: {} }));
const mockVerifyIdToken = jest.fn();
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

import { app } from "../src/app";
import { signToken } from "../src/auth";
import { audit, query } from "../src/db";
import { resetRateLimit } from "../src/rateLimit";

const queryMock = query as jest.MockedFunction<typeof query>;
const auditMock = audit as jest.MockedFunction<typeof audit>;
const donorToken = signToken({ sub: "00000000-0000-0000-0000-000000000001", email: "donor@test.vn", name: "Donor", role: "DONOR" });
const orgToken = signToken({ sub: "00000000-0000-0000-0000-000000000002", email: "org@test.vn", name: "Org", role: "ORGANIZATION" });
const adminToken = signToken({ sub: "00000000-0000-0000-0000-000000000003", email: "admin@test.vn", name: "Admin", role: "ADMIN" });

beforeEach(() => { jest.clearAllMocks(); resetRateLimit(); delete process.env.GOOGLE_CLIENT_ID; queryMock.mockResolvedValue([] as never); });

describe("identity HTTP API", () => {
  it("reports health and validates registration", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).post("/auth/register").send({ email: "bad" })).status).toBe(400);
  });

  it("publishes anonymous user analytics", async () => {
    queryMock.mockResolvedValueOnce([{ donor_count: 12, verified_organization_count: 3 }] as never);
    const response = await request(app).get("/analytics/users/public");
    expect(response.status).toBe(200);
    expect(response.body.totals).toEqual({ donor_count: 12, verified_organization_count: 3 });
  });

  it("registers a donor and returns a JWT", async () => {
    queryMock.mockResolvedValueOnce([{ id: "u1", email: "new@test.vn", name: "New", role: "DONOR" }] as never);
    const response = await request(app).post("/auth/register").send({ email: "new@test.vn", password: "Password@123", name: "New", phone: "0901234567", province: "Đà Nẵng", address: "12 Hải Châu", date_of_birth: "2001-01-20", role: "DONOR", terms_accepted: true });
    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("logs in valid users and rejects bad credentials", async () => {
    const bcrypt = await import("bcryptjs");
    const password_hash = await bcrypt.hash("Password@123", 4);
    queryMock.mockResolvedValueOnce([{ id: "u1", email: "a@test.vn", name: "A", role: "DONOR", password_hash }] as never);
    expect((await request(app).post("/auth/login").send({ email: "a@test.vn", password: "Password@123" })).status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).post("/auth/login").send({ email: "none@test.vn", password: "wrong" })).status).toBe(401);
  });

  it("verifies a Google ID token server-side before creating a donor session", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id.apps.googleusercontent.com";
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: "google-subject-1", email: "mai@gmail.com", email_verified: true, name: "Mai An" }),
    });
    queryMock
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "u-google", email: "mai@gmail.com", name: "Mai An", role: "DONOR", status: "ACTIVE" }] as never);

    const response = await request(app).post("/auth/google").send({ credential: "x".repeat(30), terms_accepted: true });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: "mai@gmail.com", role: "DONOR" });
    expect(response.body.refresh_token).toEqual(expect.any(String));
    expect(mockVerifyIdToken).toHaveBeenCalledWith(expect.objectContaining({ audience: process.env.GOOGLE_CLIENT_ID }));
    expect(auditMock).toHaveBeenCalledWith("u-google", "GOOGLE_ACCOUNT_CREATED", "USER", "u-google", null, expect.any(Object), expect.any(Object));
  });

  it("does not accept a Google credential while server configuration is absent", async () => {
    const response = await request(app).post("/auth/google").send({ credential: "x".repeat(30), terms_accepted: true });
    expect(response.status).toBe(503);
  });

  it("links an existing account only after Google provides an authoritative email", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id.apps.googleusercontent.com";
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: "google-subject-existing", email: "linh@gmail.com", email_verified: true, name: "Linh" }),
    });
    queryMock
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "u-existing", email: "linh@gmail.com", name: "Linh cũ", role: "DONOR", status: "ACTIVE", google_subject: null }] as never)
      .mockResolvedValueOnce([{ id: "u-existing", email: "linh@gmail.com", name: "Linh cũ", role: "DONOR", status: "ACTIVE" }] as never);

    const response = await request(app).post("/auth/google").send({ credential: "x".repeat(30), terms_accepted: true });
    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe("u-existing");
    expect(auditMock).toHaveBeenCalledWith("u-existing", "GOOGLE_ACCOUNT_LINKED", "USER", "u-existing", null, expect.any(Object), expect.any(Object));
    expect(auditMock).toHaveBeenCalledWith("u-existing", "GOOGLE_LOGIN_SUCCEEDED", "USER", "u-existing", null, expect.any(Object), expect.any(Object));
  });

  it("rejects invalid Google identities and disabled Google accounts", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id.apps.googleusercontent.com";
    mockVerifyIdToken.mockRejectedValueOnce(new Error("bad token"));
    expect((await request(app).post("/auth/google").send({ credential: "x".repeat(30), terms_accepted: true })).status).toBe(401);

    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: "google-subject-disabled", email: "khoa@gmail.com", email_verified: true, name: "Khóa" }),
    });
    queryMock.mockResolvedValueOnce([{ id: "u-disabled", email: "khoa@gmail.com", name: "Khóa", role: "DONOR", status: "DISABLED" }] as never);
    expect((await request(app).post("/auth/google").send({ credential: "x".repeat(30), terms_accepted: true })).status).toBe(403);
  });

  it("rate-limits repeated login attempts from one IP with 429", async () => {
    queryMock.mockResolvedValue([] as never);
    let limited = false;
    let sawRateHeader = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app).post("/auth/login").send({ email: "spam@test.vn", password: "x" });
      if (res.headers["x-ratelimit-limit"] === "10") sawRateHeader = true;
      if (res.status === 429) { limited = true; expect(res.headers["retry-after"]).toBeDefined(); break; }
    }
    expect(sawRateHeader).toBe(true);
    expect(limited).toBe(true);
  });

  it("stamps the API version header on responses", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-api-version"]).toBe("v1");
  });

  it("reads and updates the authenticated profile", async () => {
    queryMock.mockResolvedValueOnce([{ id: "u1", name: "Donor" }] as never);
    expect((await request(app).get("/profile").set("Authorization", `Bearer ${donorToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([{ id: "u1", name: "Tên mới" }] as never);
    expect((await request(app).put("/profile").set("Authorization", `Bearer ${donorToken}`).send({ name: "Tên mới" })).status).toBe(200);
  });

  it("supports account profile patch and password changes", async () => {
    const bcrypt = await import("bcryptjs");
    const password_hash = await bcrypt.hash("Old@123456", 4);
    queryMock
      .mockResolvedValueOnce([{ id: "00000000-0000-0000-0000-000000000001", email: "donor@test.vn", name: "Old", role: "DONOR", phone: null, province: null, address: null, date_of_birth: null, organization_name: null }] as never)
      .mockResolvedValueOnce([{ id: "00000000-0000-0000-0000-000000000001", email: "donor@test.vn", name: "New name", role: "DONOR", phone: "0901234567", province: "Đà Nẵng", address: "12 Hải Châu", date_of_birth: "2001-01-20", organization_name: null }] as never);
    const profile = await request(app).patch("/profile").set("Authorization", `Bearer ${donorToken}`).send({ name: "New name", phone: "0901234567", province: "Đà Nẵng", address: "12 Hải Châu", date_of_birth: "2001-01-20" });
    expect(profile.status).toBe(200);
    expect(profile.body.name).toBe("New name");
    expect(profile.body.province).toBe("Đà Nẵng");

    queryMock.mockResolvedValueOnce([{ password_hash }] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
    const changed = await request(app).post("/auth/change-password").set("Authorization", `Bearer ${donorToken}`).send({ current_password: "Old@123456", new_password: "New@123456" });
    expect(changed.status).toBe(200);
    expect(auditMock).toHaveBeenCalledWith(expect.any(String), "PASSWORD_CHANGED", "USER", expect.any(String), null, expect.any(Object), expect.any(Object));

    queryMock.mockResolvedValueOnce([{ password_hash }] as never);
    expect((await request(app).post("/auth/change-password").set("Authorization", `Bearer ${donorToken}`).send({ current_password: "wrong", new_password: "New@123456" })).status).toBe(401);
  });

  it("queues and confirms password resets without leaking account existence", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "00000000-0000-0000-0000-000000000001", email: "donor@test.vn", name: "Donor" }] as never)
      .mockResolvedValueOnce([{ id: "reset-1" }] as never)
      .mockResolvedValueOnce([] as never);
    expect((await request(app).post("/auth/password-reset/request").send({ email: "donor@test.vn" })).status).toBe(200);
    expect(auditMock).toHaveBeenCalledWith(expect.any(String), "PASSWORD_RESET_REQUESTED", "USER", expect.any(String), null, expect.any(Object));

    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).post("/auth/password-reset/request").send({ email: "missing@test.vn" })).status).toBe(200);

    const token = "a".repeat(64);
    queryMock
      .mockResolvedValueOnce([{ id: "reset-1", user_id: "00000000-0000-0000-0000-000000000001" }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    expect((await request(app).post("/auth/password-reset/confirm").send({ token, new_password: "Reset@123456" })).status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).post("/auth/password-reset/confirm").send({ token, new_password: "Reset@123456" })).status).toBe(400);
  });

  it("lists and revokes account sessions", async () => {
    const sessionId = "11111111-1111-1111-1111-111111111111";
    queryMock.mockResolvedValueOnce([{ id: sessionId, current: false }] as never);
    const list = await request(app).get("/sessions").set("Authorization", `Bearer ${donorToken}`);
    expect(list.status).toBe(200);
    expect(list.body[0].id).toBe(sessionId);

    queryMock.mockResolvedValueOnce([{ id: sessionId }] as never);
    expect((await request(app).delete(`/sessions/${sessionId}`).set("Authorization", `Bearer ${donorToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).delete(`/sessions/${sessionId}`).set("Authorization", `Bearer ${donorToken}`)).status).toBe(404);

    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).delete("/sessions").set("Authorization", `Bearer ${donorToken}`)).status).toBe(200);
  });

  it("shows personal audit and lets admin manage user status", async () => {
    queryMock.mockResolvedValueOnce([{ id: "audit-1", action: "PASSWORD_CHANGED" }] as never);
    const mine = await request(app).get("/me/audit-logs?limit=10").set("Authorization", `Bearer ${donorToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body[0].action).toBe("PASSWORD_CHANGED");

    queryMock
      .mockResolvedValueOnce([{ count: "1" }] as never)
      .mockResolvedValueOnce([{ id: "u1", email: "donor@test.vn", name: "Donor", role: "DONOR", status: "ACTIVE" }] as never);
    const users = await request(app).get("/admin/users?role=DONOR&status=ACTIVE").set("Authorization", `Bearer ${adminToken}`);
    expect(users.status).toBe(200);
    expect(users.body[0].email).toBe("donor@test.vn");
    expect(users.headers["x-total-count"]).toBe("1");

    queryMock
      .mockResolvedValueOnce([{ id: "u1", email: "donor@test.vn", name: "Donor", role: "DONOR", status: "ACTIVE" }] as never)
      .mockResolvedValueOnce([{ id: "u1", email: "donor@test.vn", name: "Donor", role: "DONOR", status: "DISABLED" }] as never)
      .mockResolvedValueOnce([] as never);
    const disabled = await request(app).patch("/admin/users/u1/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "DISABLED", reason: "Vi phạm điều khoản" });
    expect(disabled.status).toBe(200);
    expect(disabled.body.status).toBe("DISABLED");

    expect((await request(app).patch("/admin/users/00000000-0000-0000-0000-000000000003/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "DISABLED", reason: "test" })).status).toBe(409);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).patch("/admin/users/missing/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "ACTIVE" })).status).toBe(404);
  });

  it("covers admin analytics, disabled login, preferences and notifications", async () => {
    queryMock.mockResolvedValueOnce([{ role: "DONOR", count: "2" }] as never).mockResolvedValueOnce([{ status: "VERIFIED", count: "1" }] as never);
    expect((await request(app).get("/analytics/users/admin").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);

    const bcrypt = await import("bcryptjs");
    const password_hash = await bcrypt.hash("Password@123", 4);
    queryMock.mockResolvedValueOnce([{ id: "u1", email: "disabled@test.vn", name: "Disabled", role: "DONOR", password_hash, status: "DISABLED" }] as never);
    expect((await request(app).post("/auth/login").send({ email: "disabled@test.vn", password: "Password@123" })).status).toBe(403);

    const campaignId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    queryMock.mockResolvedValueOnce([{ campaign_id: campaignId, campaign_title: "Campaign", saved: true, following: true }] as never);
    expect((await request(app).get("/me/campaign-preferences").set("Authorization", `Bearer ${donorToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).get(`/me/campaign-preferences/${campaignId}`).set("Authorization", `Bearer ${donorToken}`)).body.saved).toBe(false);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).put(`/me/campaign-preferences/${campaignId}`).set("Authorization", `Bearer ${donorToken}`).send({ saved: false, following: false })).body.following).toBe(false);

    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce({ ok: true, json: async () => ({ title: "Campaign" }) } as Response);
    queryMock.mockResolvedValueOnce([{ campaign_id: campaignId, campaign_title: "Campaign", saved: true, following: true }] as never);
    const preference = await request(app).put(`/me/campaign-preferences/${campaignId}`).set("Authorization", `Bearer ${donorToken}`).send({ saved: true, following: true });
    expect(preference.status).toBe(200);
    fetchMock.mockRestore();

    queryMock.mockResolvedValueOnce([{ id: "n1", created_at: new Date().toISOString() }] as never).mockResolvedValueOnce([{ count: "1" }] as never);
    const notifications = await request(app).get("/me/notifications?status=UNREAD&limit=1").set("Authorization", `Bearer ${donorToken}`);
    expect(notifications.status).toBe(200);
    expect(notifications.body.unread_count).toBe(1);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).patch("/me/notifications/read-all").set("Authorization", `Bearer ${donorToken}`)).body.unread_count).toBe(0);
    queryMock.mockResolvedValueOnce([{ id: "n1", read_at: new Date().toISOString() }] as never);
    expect((await request(app).patch("/me/notifications/n1/read").set("Authorization", `Bearer ${donorToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).patch("/me/notifications/missing/read").set("Authorization", `Bearer ${donorToken}`)).status).toBe(404);

    queryMock.mockResolvedValueOnce([{ id: "audit-1", action: "USER_ENABLED" }] as never);
    expect((await request(app).get("/admin/audit-logs/identity?limit=5").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
  });

  it("submits and reads an organization application", async () => {
    queryMock.mockResolvedValueOnce([{ user_id: "org", status: "PENDING" }] as never);
    const submitted = await request(app).post("/organizations/application").set("Authorization", `Bearer ${orgToken}`).field("legalName", "Quỹ Ánh Dương").field("registrationNumber", "QD-01").field("description", "Hỗ trợ cộng đồng");
    expect(submitted.status).toBe(201);
    expect(auditMock).toHaveBeenCalled();
    queryMock.mockResolvedValueOnce([{ legal_name: "Quỹ Ánh Dương", status: "PENDING" }] as never);
    expect((await request(app).get("/organizations/me").set("Authorization", `Bearer ${orgToken}`)).status).toBe(200);
  });

  it("lists and reviews organizations as admin", async () => {
    queryMock.mockResolvedValueOnce([{ user_id: "org", status: "PENDING" }] as never);
    expect((await request(app).get("/admin/organizations?status=PENDING").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
    queryMock.mockResolvedValueOnce([{ status: "PENDING" }] as never).mockResolvedValueOnce([{ user_id: "org", status: "VERIFIED" }] as never);
    const approved = await request(app).patch("/admin/organizations/org/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "VERIFIED" });
    expect(approved.status).toBe(200);
    expect(auditMock).toHaveBeenCalled();
  });

  it("requires a rejection reason and handles missing organizations", async () => {
    expect((await request(app).patch("/admin/organizations/org/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "REJECTED" })).status).toBe(400);
    queryMock.mockResolvedValueOnce([] as never);
    expect((await request(app).patch("/admin/organizations/missing/status").set("Authorization", `Bearer ${adminToken}`).send({ status: "VERIFIED" })).status).toBe(404);
  });

  it("serves status to authenticated internal services", async () => {
    queryMock.mockResolvedValueOnce([{ status: "VERIFIED", legal_name: "Quỹ" }] as never);
    const response = await request(app).get("/internal/organizations/org/status").set("x-internal-token", "local-internal-token");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("VERIFIED");
  });

  it("maps unique violations and unexpected errors", async () => {
    queryMock.mockRejectedValueOnce({ code: "23505" });
    expect((await request(app).post("/auth/register").send({ email: "dup@test.vn", password: "Password@123", name: "Dup", role: "DONOR", terms_accepted: true })).status).toBe(409);
    queryMock.mockRejectedValueOnce(new Error("boom"));
    expect((await request(app).get("/profile").set("Authorization", `Bearer ${donorToken}`)).status).toBe(500);
  });
});
