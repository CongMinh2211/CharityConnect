import { beforeEach, describe, expect, it } from "vitest";
import type { AccountSession, AccountUser, AssistantResponse, AuthPayload, Campaign, CampaignEscrow, Donation, DonationAnalytics, FinancialPlan, ImpactReport, LedgerAnchor, LedgerEntry, LedgerVerification, PublicReceiptProof, User } from "../types";
import { mockApi, resetMockData, sha256Fallback } from "./mockApi";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
Object.defineProperty(globalThis, "location", { value: { origin: "http://localhost" }, configurable: true });

function actAs(user: User): void { localStorage.setItem("cc_user", JSON.stringify(user)); }

describe("mock API demo flows", () => {
  beforeEach(() => { storage.clear(); resetMockData(); });

  it("computes the standard SHA-256 digest without Web Crypto", () => {
    const digest = Array.from(sha256Fallback(new TextEncoder().encode("abc")), (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("lists public campaigns and logs in all three demo roles", async () => {
    const campaigns = await mockApi<Campaign[]>("/campaigns");
    expect(campaigns).toHaveLength(4);
    for (const email of ["donor@demo.vn", "org@demo.vn", "admin@demo.vn"]) {
      const result = await mockApi<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password: "Demo@123" }) });
      expect(result.user.email).toBe(email);
    }
  });

  it("answers assistant questions without an API key", async () => {
    const result = await mockApi<AssistantResponse>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Cách xác minh biên nhận QR?" })
    });
    expect(result.mode).toBe("DEMO");
    expect(result.answer).toContain("QR");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("migrates an older mock state that has no ledger", async () => {
    await mockApi<Campaign[]>("/campaigns");
    const key = storage.key(0)!;
    const stale = JSON.parse(storage.getItem(key)!) as Record<string, unknown>;
    delete stale.ledger;
    storage.setItem(key, JSON.stringify(stale));
    const campaigns = await mockApi<Campaign[]>("/campaigns");
    expect(campaigns).toHaveLength(4);
    expect((await mockApi<LedgerVerification>("/transparency/verify")).valid).toBe(true);
  });

  it("creates a donation, receipt and updated history", async () => {
    actAs({ id: "donor-demo", name: "Nguyễn Minh An", email: "donor@demo.vn", role: "DONOR" });
    const donation = await mockApi<Donation>("/donations", { method: "POST", body: JSON.stringify({ campaign_id: "campaign-school", amount: 200_000, anonymous: true }) });
    expect(donation.status).toBe("COMPLETED");
    const receipt = await mockApi<Donation>(`/donations/${donation.id}/receipt`);
    expect(receipt.receipt_number).toMatch(/^CC-/);
    const history = await mockApi<Donation[]>("/donations/history");
    expect(history[0].id).toBe(donation.id);
    expect(donation.proof_status).toBe("CONFIRMED");
    const statement = await mockApi<Blob>(`/donations/me/annual-statement?year=${new Date().getFullYear()}`);
    expect(statement.type).toBe("application/pdf");
    expect(await statement.text()).toContain("%PDF-1.4");
    const publicProof = await mockApi<PublicReceiptProof>(`/transparency/receipts/${donation.receipt_number}`);
    expect(publicProof.ledger_hash).toBe(donation.ledger_hash);
    expect(JSON.stringify(publicProof)).not.toContain("donor");
    expect(publicProof.verification_status).toBe("UNANCHORED");
    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    const anchor = await mockApi<LedgerAnchor>("/admin/transparency/anchors", { method: "POST" });
    expect(anchor.status).toBe("SIMULATED");
    const confirmed = await mockApi<PublicReceiptProof>(`/transparency/receipts/${donation.receipt_number}`);
    expect(confirmed.verification_status).toBe("CONFIRMED");
    expect(confirmed.merkle_proof_valid).toBe(true);
    const independent = await mockApi<{ proof_valid: boolean }>(`/transparency/proofs/${donation.ledger_position}`);
    expect(independent.proof_valid).toBe(true);
    await expect(mockApi("/admin/transparency/anchors", { method: "POST" })).rejects.toThrow();
    actAs({ id: "org-demo", name: "Quy Mam Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    const organizationDonations = await mockApi<Array<Donation & { donor_name: string }>>("/organization/donations/campaign-school");
    expect(organizationDonations.some((item) => item.id === donation.id)).toBe(true);
    expect(organizationDonations.find((item) => item.id === donation.id)?.donor_name).not.toContain("Minh");
  });

  it("registers with consent and rejects duplicate or missing consent", async () => {
    const payload = { name: "Lê An", email: "lean@example.vn", password: "Strong@123", role: "DONOR", terms_accepted: true };
    const result = await mockApi<AuthPayload>("/auth/register", { method: "POST", body: JSON.stringify(payload) });
    expect(result.email_notification).toBe("QUEUED");
    await expect(mockApi("/auth/register", { method: "POST", body: JSON.stringify(payload) })).rejects.toThrow();
    await expect(mockApi("/auth/register", { method: "POST", body: JSON.stringify({ ...payload, email: "other@example.vn", terms_accepted: false }) })).rejects.toThrow();
  });

  it("manages profile, password, reset tokens, sessions and personal audit", async () => {
    const login = await mockApi<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn", password: "Demo@123" }) });
    actAs(login.user);
    const profile = await mockApi<User>("/profile", { method: "PATCH", body: JSON.stringify({ name: "An da cap nhat" }) });
    expect(profile.name).toBe("An da cap nhat");
    await expect(mockApi("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: "sai", new_password: "New@123456" }) })).rejects.toThrow();
    await mockApi("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: "Demo@123", new_password: "New@123456" }) });
    const audits = await mockApi<Array<{ action: string }>>("/me/audit-logs");
    expect(audits.some((item) => item.action === "PROFILE_UPDATED")).toBe(true);
    expect(audits.some((item) => item.action === "PASSWORD_CHANGED")).toBe(true);
    await expect(mockApi("/auth/login", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn", password: "Demo@123" }) })).rejects.toThrow();
    const relogin = await mockApi<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn", password: "New@123456" }) });
    actAs(relogin.user);
    const sessions = await mockApi<AccountSession[]>("/sessions");
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    await mockApi(`/sessions/${encodeURIComponent(sessions[0].id)}`, { method: "DELETE" });
    expect((await mockApi<AccountSession[]>("/sessions")).some((session) => session.id === sessions[0].id && session.revoked_at)).toBe(true);
    await mockApi("/sessions", { method: "DELETE" });
    expect((await mockApi<AccountSession[]>("/sessions")).every((session) => session.revoked_at)).toBe(true);

    const reset = await mockApi<{ demo_token?: string }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn" }) });
    expect(reset.demo_token).toBeTruthy();
    await mockApi("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: reset.demo_token, new_password: "Reset@123456" }) });
    await expect(mockApi("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: reset.demo_token, new_password: "Again@123456" }) })).rejects.toThrow();
    expect((await mockApi<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn", password: "Reset@123456" }) })).user.email).toBe("donor@demo.vn");
  });

  it("lets admin lock and unlock user accounts without exposing passwords", async () => {
    const adminLogin = await mockApi<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@demo.vn", password: "Demo@123" }) });
    actAs(adminLogin.user);
    const users = await mockApi<AccountUser[]>("/admin/users?role=DONOR");
    expect(users.some((item) => item.email === "donor@demo.vn")).toBe(true);
    expect(JSON.stringify(users)).not.toContain("password");
    const disabled = await mockApi<AccountUser>("/admin/users/donor-demo/status", { method: "PATCH", body: JSON.stringify({ status: "DISABLED" }) });
    expect(disabled.status).toBe("DISABLED");
    await expect(mockApi("/auth/login", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn", password: "Demo@123" }) })).rejects.toThrow();
    const active = await mockApi<AccountUser>("/admin/users/donor-demo/status", { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) });
    expect(active.status).toBe("ACTIVE");
    await expect(mockApi("/admin/users/admin-demo/status", { method: "PATCH", body: JSON.stringify({ status: "DISABLED" }) })).rejects.toThrow();
    expect((await mockApi<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email: "donor@demo.vn", password: "Demo@123" }) })).user.status).toBe("ACTIVE");
  });

  it("returns reconciled analytics for public and role views", async () => {
    const publicStats = await mockApi<DonationAnalytics>("/analytics/donations/public?period=all");
    expect(publicStats.totals.transparent_balance).toBe(publicStats.totals.donation_amount - publicStats.totals.verified_fund_usage);
    actAs({ id: "donor-demo", name: "An", email: "donor@demo.vn", role: "DONOR" });
    expect((await mockApi<DonationAnalytics>("/analytics/donations/me?period=30d")).totals.donation_count).toBeGreaterThan(0);
    actAs({ id: "org-demo", name: "Quỹ Mầm Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    expect((await mockApi<DonationAnalytics>("/analytics/donations/organization?period=all")).totals.campaign_count).toBeGreaterThan(0);
    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    expect((await mockApi<DonationAnalytics>("/analytics/donations/admin?period=7d")).period).toBe("7d");
    expect(await mockApi("/analytics/campaigns/admin?period=all")).toBeTruthy();
    expect(await mockApi("/analytics/users/admin")).toBeTruthy();
  });

  it("updates simulated escrow when donations arrive", async () => {
    actAs({ id: "donor-demo", name: "An", email: "donor@demo.vn", role: "DONOR" });
    await mockApi<Donation>("/donations", { method: "POST", body: JSON.stringify({ campaign_id: "campaign-school", amount: 300_000, anonymous: false }) });
    const contract = await mockApi<CampaignEscrow>("/campaigns/campaign-school/contract");
    expect(contract.locked_amount).toBeGreaterThan(0);
    expect(contract.total_donated).toBeGreaterThanOrEqual(contract.locked_amount);
    expect(contract.contract_state).toBe("DONATION_OPEN");
  });

  it("lets admin moderate queues", async () => {
    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    const organizations = await mockApi<Array<{ user_id: string }>>("/admin/organizations?status=PENDING");
    expect(organizations).toHaveLength(1);
    const campaigns = await mockApi<Campaign[]>("/admin/campaigns?status=PENDING_REVIEW");
    expect(campaigns).toHaveLength(1);
  });

  it("protects donations and completes organization-to-admin approval", async () => {
    await expect(mockApi("/donations", { method: "POST", body: JSON.stringify({ campaign_id: "campaign-school", amount: 50_000 }) })).rejects.toThrow("đăng nhập");

    actAs({ id: "org-demo", name: "Quỹ Mầm Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    const form = new FormData();
    form.set("title", "Chiến dịch kiểm thử"); form.set("summary", "Tóm tắt"); form.set("description", "Nội dung");
    form.set("category", "CỘNG ĐỒNG"); form.set("goalAmount", "10000000"); form.set("endDate", "2027-12-31T00:00");
    const draft = await mockApi<Campaign>("/organization/campaigns", { method: "POST", body: form });
    expect(draft.status).toBe("DRAFT");
    const edited = await mockApi<Campaign>(`/organization/campaigns/${draft.id}`, { method: "PATCH", body: JSON.stringify({ title: "Draft da sua", goalAmount: 10000000 }) });
    expect(edited.title).toBe("Draft da sua");
    const deleteForm = new FormData();
    deleteForm.set("title", "Ban nhap xoa mem"); deleteForm.set("summary", "Tom tat"); deleteForm.set("description", "Noi dung");
    deleteForm.set("category", "CONG_DONG"); deleteForm.set("goalAmount", "5000000"); deleteForm.set("endDate", "2027-12-31T00:00");
    const removable = await mockApi<Campaign>("/organization/campaigns", { method: "POST", body: deleteForm });
    const deleted = await mockApi<Campaign>(`/organization/campaigns/${removable.id}`, { method: "DELETE" });
    expect(deleted.deleted_at).toBeTruthy();
    expect((await mockApi<Campaign[]>("/organization/campaigns")).some((item) => item.id === removable.id)).toBe(false);
    await mockApi(`/organization/campaigns/${draft.id}/financial-plan`, { method: "PUT", body: JSON.stringify({ budget_items: [{ label: "Hoạt động chính", planned_amount: 10000000 }], milestones: [{ title: "Hoàn thành", description: "Nghiệm thu", target_date: "2027-06-30", target_amount: 10000000 }] }) });
    const submitted = await mockApi<Campaign>(`/organization/campaigns/${draft.id}/submit`, { method: "POST" });
    expect(submitted.status).toBe("PENDING_REVIEW");

    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    const approved = await mockApi<Campaign>(`/admin/campaigns/${draft.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "APPROVED" }) });
    expect(approved.status).toBe("APPROVED");
    actAs({ id: "org-demo", name: "Quy Mam Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    await expect(mockApi(`/organization/campaigns/${draft.id}`, { method: "PATCH", body: JSON.stringify({ title: "Khong duoc sua" }) })).rejects.toThrow();
    await expect(mockApi(`/organization/campaigns/${draft.id}`, { method: "DELETE" })).rejects.toThrow();
  });

  it("verifies the seeded chain and detects payload tampering", async () => {
    const verification = await mockApi<LedgerVerification>("/transparency/verify");
    expect(verification.valid).toBe(true);
    expect(verification.entries).toBe(5);
    const ledger = await mockApi<{ items: LedgerEntry[] }>("/transparency/ledger?event_type=FUND_USAGE_VERIFIED");
    expect(ledger.items).toHaveLength(1);

    const key = storage.key(0)!;
    const state = JSON.parse(storage.getItem(key)!) as { ledger: LedgerEntry[] };
    state.ledger[0].public_payload.amount = 1;
    storage.setItem(key, JSON.stringify(state));
    expect((await mockApi<LedgerVerification>("/transparency/verify")).status).toBe("INVALID");
  });

  it("submits, reviews and anchors an impact report exactly once", async () => {
    actAs({ id: "org-demo", name: "Quỹ Mầm Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    const form = new FormData();
    form.set("title", "Nghiệm thu hạng mục bàn ghế");
    form.set("description", "Bàn ghế đã được bàn giao đầy đủ cho điểm trường và có biên bản xác nhận.");
    form.set("amountUsed", "12000000"); form.set("reportDate", "2026-06-20");
    const plan = await mockApi<FinancialPlan>("/campaigns/campaign-school/financial-plan");
    await mockApi(`/organization/campaigns/campaign-school/milestones/${plan.milestones[1].id}/status`, { method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) });
    form.set("milestoneId", plan.milestones[1].id);
    form.set("allocations", JSON.stringify([{ budget_item_id: plan.budget_items[0].id, amount: 12000000 }]));
    form.append("evidence", new File(["proof"], "nghiem-thu.pdf", { type: "application/pdf" }));
    const submitted = await mockApi<ImpactReport>("/organization/campaigns/campaign-school/impact-reports", { method: "POST", body: form });
    expect(submitted.status).toBe("PENDING_REVIEW");

    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    const approved = await mockApi<ImpactReport>(`/admin/impact-reports/${submitted.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "VERIFIED" }) });
    expect(approved.status).toBe("VERIFIED");
    const publicReports = await mockApi<ImpactReport[]>("/campaigns/campaign-school/impact-reports");
    expect(publicReports.some((item) => item.id === submitted.id)).toBe(true);
    const ledger = await mockApi<{ items: LedgerEntry[] }>("/transparency/ledger");
    expect(ledger.items.filter((item) => item.event_id === submitted.id)).toHaveLength(1);
    await expect(mockApi(`/admin/impact-reports/${submitted.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "VERIFIED" }) })).rejects.toThrow("đã được kiểm duyệt");
  });
  it("lets organizations revise and soft-delete rejected impact report drafts", async () => {
    actAs({ id: "org-demo", name: "Quy Mam Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    const plan = await mockApi<FinancialPlan>("/campaigns/campaign-school/financial-plan");
    await mockApi(`/organization/campaigns/campaign-school/milestones/${plan.milestones[1].id}/status`, { method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) });
    const form = new FormData();
    form.set("title", "Bao cao can sua");
    form.set("description", "Noi dung can bo sung bang chung");
    form.set("amountUsed", "1000000");
    form.set("reportDate", "2026-06-20");
    form.set("milestoneId", plan.milestones[1].id);
    form.set("allocations", JSON.stringify([{ budget_item_id: plan.budget_items[0].id, amount: 1000000 }]));
    form.append("evidence", new File(["proof"], "proof.pdf", { type: "application/pdf" }));
    const submitted = await mockApi<ImpactReport>("/organization/campaigns/campaign-school/impact-reports", { method: "POST", body: form });

    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    const rejected = await mockApi<ImpactReport>(`/admin/impact-reports/${submitted.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "REJECTED", reason: "Can bo sung anh truoc/sau" }) });
    expect(rejected.status).toBe("REJECTED");

    actAs({ id: "org-demo", name: "Quy Mam Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    const draft = await mockApi<ImpactReport>(`/organization/impact-reports/${submitted.id}`, { method: "PATCH", body: JSON.stringify({ title: "Bao cao da sua", amountUsed: 1000000, milestoneId: plan.milestones[1].id, allocations: [{ budget_item_id: plan.budget_items[0].id, amount: 1000000 }] }) });
    expect(draft.status).toBe("DRAFT");
    const resubmitted = await mockApi<ImpactReport>(`/organization/impact-reports/${submitted.id}/submit`, { method: "POST" });
    expect(resubmitted.status).toBe("PENDING_REVIEW");

    actAs({ id: "admin-demo", name: "Admin", email: "admin@demo.vn", role: "ADMIN" });
    await mockApi<ImpactReport>(`/admin/impact-reports/${submitted.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "REJECTED", reason: "Van chua dat" }) });
    actAs({ id: "org-demo", name: "Quy Mam Xanh", email: "org@demo.vn", role: "ORGANIZATION" });
    const deleted = await mockApi<ImpactReport>(`/organization/impact-reports/${submitted.id}`, { method: "DELETE" });
    expect(deleted.deleted_at).toBeTruthy();
    expect((await mockApi<ImpactReport[]>("/organization/campaigns/campaign-school/impact-reports")).some((item) => item.id === submitted.id)).toBe(false);
  });
});
