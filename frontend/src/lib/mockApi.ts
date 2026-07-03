import { roleFunctionGroups } from "../shared/lib/roleGuide";
import type { AccountSession, AccountUser, AnalyticsPeriod, AuditLogEntry, Campaign, CampaignAnalytics, CampaignEscrow, CampaignPreference, Donation, DonationAnalytics, FinancialPlan, ImpactEvidence, ImpactReport, LedgerAnchor, LedgerEntry, MerkleProofNode, NotificationPage, RiskAssessment, Role, RoleGuideRole, User, UserAnalytics, UserNotification } from "../types";

interface OrganizationProfile {
  user_id: string;
  legal_name: string;
  registration_number: string;
  email: string;
  description: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  rejection_reason?: string | null;
}

interface MockUser extends User { password: string }

interface MockState {
  users: MockUser[];
  organizations: OrganizationProfile[];
  campaigns: Campaign[];
  donations: Array<Donation & { donor_id: string; donor_name: string; issued_at: string }>;
  impactReports: ImpactReport[];
  preferences: Array<CampaignPreference & { user_id: string }>;
  notifications: Array<UserNotification & { user_id: string }>;
  financialPlans: FinancialPlan[];
  auditLogs: AuditLogEntry[];
  ledger: LedgerEntry[];
  emailNotifications: Array<{ event_id: string; template: "WELCOME" | "DONATION_THANK_YOU" | "CAMPAIGN_UPDATE" | "PASSWORD_RESET"; recipient_user_id: string; status: "SIMULATED" }>;
  sessions: AccountSession[];
  passwordResetTokens: Array<{ token: string; user_id: string; expires_at: string; used_at?: string | null }>;
  anchors: Array<LedgerAnchor & { entries: Array<{ ledger_position: number; leaf_index: number; proof: MerkleProofNode[] }> }>;
  escrows: CampaignEscrow[];
  anchorSeeded: boolean;
}

const STORAGE_KEY = "cc_demo_state_v11";
const GENESIS_HASH = "0".repeat(64);

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortForJson(item)]));
  }
  return value;
}

function canonicalJson(value: unknown): string { return JSON.stringify(sortForJson(value)); }

export function sha256Fallback(bytes: Uint8Array): Uint8Array {
  const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bytes.length / 0x20000000), false);
  view.setUint32(paddedLength - 4, (bytes.length * 8) >>> 0, false);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  const result = new Uint8Array(32); const resultView = new DataView(result.buffer);
  hash.forEach((value, index) => resultView.setUint32(index * 4, value, false));
  return result;
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input))
    : sha256Fallback(new Uint8Array(input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function appendLedger(state: MockState, entry: Omit<LedgerEntry, "position" | "previous_hash" | "entry_hash">): Promise<LedgerEntry> {
  const duplicate = state.ledger.find((item) => item.event_id === entry.event_id);
  if (duplicate) return duplicate;
  const position = state.ledger.length + 1;
  const previous_hash = state.ledger.at(-1)?.entry_hash ?? GENESIS_HASH;
  const record = { campaign_id: entry.campaign_id, created_at: entry.created_at, entity_id: entry.entity_id, event_id: entry.event_id, event_type: entry.event_type, position, previous_hash, public_payload: entry.public_payload, version: 1 };
  const ledgerEntry = { ...entry, position, previous_hash, entry_hash: await sha256(canonicalJson(record)) };
  state.ledger.push(ledgerEntry);
  return ledgerEntry;
}

async function verifyLedger(entries: LedgerEntry[]): Promise<{ valid: boolean; invalidPosition: number | null }> {
  let previousHash = GENESIS_HASH;
  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index];
    const record = { campaign_id: item.campaign_id, created_at: item.created_at, entity_id: item.entity_id, event_id: item.event_id, event_type: item.event_type, position: index + 1, previous_hash: previousHash, public_payload: item.public_payload, version: 1 };
    const expected = await sha256(canonicalJson(record));
    if (item.position !== index + 1 || item.previous_hash !== previousHash || item.entry_hash !== expected) return { valid: false, invalidPosition: item.position };
    previousHash = item.entry_hash;
  }
  return { valid: true, invalidPosition: null };
}

function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function seedState(): MockState {
  const users: MockUser[] = [
    { id: "donor-demo", name: "Nguyễn Minh An", email: "donor@demo.vn", password: "Demo@123", role: "DONOR" },
    { id: "org-demo", name: "Quỹ Mầm Xanh", email: "org@demo.vn", password: "Demo@123", role: "ORGANIZATION" },
    { id: "admin-demo", name: "Quản trị CharityConnect", email: "admin@demo.vn", password: "Demo@123", role: "ADMIN" },
    { id: "org-pending", name: "Nhịp Cầu Nhỏ", email: "contact@nhipcaunho.vn", password: "Demo@123", role: "ORGANIZATION" }
  ];
  users.forEach((user) => { user.status ??= "ACTIVE"; });
  const campaigns: Campaign[] = [
    {
      id: "campaign-school", organization_id: "org-demo", organization_name: "Quỹ Mầm Xanh",
      title: "Phòng học mới cho trẻ em vùng cao", summary: "Hoàn thiện hai phòng học an toàn và đủ ánh sáng cho 64 em nhỏ tại Mù Cang Chải.",
      description: "Điểm trường hiện vẫn dùng phòng gỗ tạm, dột vào mùa mưa và thiếu ánh sáng. Khoản quyên góp được dùng cho vật liệu, vận chuyển và bàn ghế.\n\nTổ chức cập nhật ảnh nghiệm thu theo từng mốc 30%, 60% và hoàn thành để nhà tài trợ theo dõi.",
      category: "GIÁO DỤC", goal_amount: 180_000_000, raised_amount: 126_450_000, end_date: futureDate(38), status: "APPROVED", image_url: "/images/veo-charity-01.jpg"
    },
    {
      id: "campaign-meals", organization_id: "org-demo", organization_name: "Quỹ Mầm Xanh",
      title: "10.000 bữa ăn ấm cho bệnh nhi", summary: "Cùng các bếp cộng đồng chuẩn bị suất ăn đủ dinh dưỡng cho gia đình bệnh nhi khó khăn.",
      description: "Mỗi 35.000 đồng tương ứng một suất ăn được chuẩn bị và giao trong ngày. Danh sách bếp, hóa đơn nguyên liệu và số suất ăn được công khai theo tuần.",
      category: "Y TẾ", goal_amount: 350_000_000, raised_amount: 201_780_000, end_date: futureDate(24), status: "APPROVED", image_url: "/images/veo-charity-02.jpg"
    },
    {
      id: "campaign-water", organization_id: "org-demo", organization_name: "Quỹ Mầm Xanh",
      title: "Nước sạch về bản Nậm Lành", summary: "Lắp bể chứa và hệ thống lọc nước dùng chung cho 112 hộ dân ở khu vực thiếu nước sạch.",
      description: "Dự án triển khai một bể chứa 20m³, hệ lọc thô và 1.800m đường ống. Tiến độ giải ngân bám theo biên bản nghiệm thu của từng hạng mục.",
      category: "CỘNG ĐỒNG", goal_amount: 240_000_000, raised_amount: 94_200_000, end_date: futureDate(51), status: "APPROVED", image_url: "/images/veo-charity-03.jpg"
    },
    {
      id: "campaign-medical", organization_id: "org-demo", organization_name: "Quỹ Mầm Xanh",
      title: "Tủ thuốc cho 8 điểm trường", summary: "Trang bị tủ sơ cứu tiêu chuẩn và hướng dẫn kỹ năng xử lý chấn thương cơ bản cho giáo viên.",
      description: "Mỗi điểm trường nhận một tủ thuốc theo danh mục chuẩn cùng buổi hướng dẫn trực tiếp. Báo cáo bàn giao có xác nhận của đại diện nhà trường.",
      category: "Y TẾ", goal_amount: 96_000_000, raised_amount: 72_600_000, end_date: futureDate(19), status: "APPROVED", image_url: "/images/veo-charity-hero.jpg"
    },
    {
      id: "campaign-draft", organization_id: "org-demo", organization_name: "Quỹ Mầm Xanh",
      title: "Thư viện nhỏ giữa đại ngàn", summary: "Tạo góc đọc sách cho học sinh tiểu học.", description: "Bản nháp chiến dịch phục vụ luồng tổ chức.", category: "GIÁO DỤC",
      goal_amount: 75_000_000, raised_amount: 0, end_date: futureDate(70), status: "DRAFT", image_url: "/images/veo-charity-05.jpg"
    },
    {
      id: "campaign-review", organization_id: "org-demo", organization_name: "Quỹ Mầm Xanh",
      title: "Áo ấm trước mùa đông", summary: "Trao 450 bộ áo ấm cho trẻ tại ba điểm trường.", description: "Hồ sơ đang chờ quản trị viên kiểm duyệt.", category: "KHẨN CẤP",
      goal_amount: 135_000_000, raised_amount: 0, end_date: futureDate(90), status: "PENDING_REVIEW", image_url: "/images/veo-charity-06.jpg"
    }
  ];
  const createdAt = new Date(Date.now() - 86_400_000 * 4).toISOString();
  const impactReports: ImpactReport[] = [{
    id: "impact-seed", campaign_id: "campaign-school", organization_id: "org-demo",
    campaign_title: campaigns[0].title, organization_name: campaigns[0].organization_name,
    title: "Hoàn thành nền móng và vận chuyển vật liệu",
    description: "Đội thi công đã hoàn thành phần nền, vận chuyển gạch và xi măng đến điểm trường. Biên bản nghiệm thu được đính kèm để cộng đồng đối chiếu.",
    amount_used: 42_500_000, report_date: new Date(Date.now() - 86_400_000 * 7).toISOString(),
    status: "VERIFIED", created_at: new Date(Date.now() - 86_400_000 * 6).toISOString(), reviewed_at: new Date(Date.now() - 86_400_000 * 5).toISOString(),
    evidence: [{ id: "evidence-seed", original_name: "bien-ban-nghiem-thu.pdf", mime_type: "application/pdf", size_bytes: 824_320, sha256: "seed", url: "/images/veo-charity-01.jpg" }]
  }];
  campaigns.forEach((campaign, index) => { campaign.created_at = new Date(Date.now() - (index + 2) * 86_400_000).toISOString(); });
  const financialPlans: FinancialPlan[] = campaigns.map((campaign) => ({
    campaign_id: campaign.id, goal_amount: campaign.goal_amount,
    budget_items: [
      { id: `budget-${campaign.id}-1`, label: "Triển khai hoạt động", planned_amount: Math.round(campaign.goal_amount * 0.8), actual_amount: campaign.id === "campaign-school" ? 42_500_000 : 0, sort_order: 0 },
      { id: `budget-${campaign.id}-2`, label: "Vận hành và nghiệm thu", planned_amount: campaign.goal_amount - Math.round(campaign.goal_amount * 0.8), actual_amount: 0, sort_order: 1 },
    ],
    milestones: [
      { id: `milestone-${campaign.id}-1`, title: "Chuẩn bị và triển khai", description: "Hoàn thiện công tác chuẩn bị và bắt đầu thực hiện.", target_date: futureDate(14), target_amount: Math.round(campaign.goal_amount * 0.4), status: campaign.id === "campaign-school" ? "VERIFIED" : "PLANNED", sort_order: 0, updated_at: new Date().toISOString() },
      { id: `milestone-${campaign.id}-2`, title: "Hoàn thành và nghiệm thu", description: "Bàn giao kết quả và công khai bằng chứng.", target_date: campaign.end_date, target_amount: campaign.goal_amount - Math.round(campaign.goal_amount * 0.4), status: "PLANNED", sort_order: 1, updated_at: new Date().toISOString() },
    ],
  }));
  impactReports[0].milestone_id = "milestone-campaign-school-1";
  impactReports[0].allocations = [{ budget_item_id: "budget-campaign-school-1", amount: 42_500_000 }];
  return {
    users,
    organizations: [
      { user_id: "org-demo", legal_name: "Quỹ Mầm Xanh Việt Nam", registration_number: "QXH-2024-0186", email: "org@demo.vn", description: "Tổ chức hỗ trợ giáo dục, dinh dưỡng và hạ tầng thiết yếu cho trẻ em khó khăn.", status: "VERIFIED" },
      { user_id: "org-pending", legal_name: "Trung tâm Nhịp Cầu Nhỏ", registration_number: "TC-2026-0412", email: "contact@nhipcaunho.vn", description: "Kết nối nguồn lực địa phương với các điểm trường vùng cao.", status: "PENDING" }
    ],
    campaigns,
    donations: campaigns.slice(0, 4).map((campaign, index) => ({
      id: `donation-seed-${index + 1}`, campaign_id: campaign.id, campaign_title: campaign.title,
      amount: campaign.raised_amount, anonymous: index === 2, status: "COMPLETED" as const,
      created_at: new Date(new Date(createdAt).getTime() + index * 60_000).toISOString(),
      receipt_number: `CC-2026-${String(128 + index).padStart(6, "0")}`,
      donor_id: "donor-demo", donor_name: users[0].name, issued_at: createdAt
    })),
    impactReports,
    preferences: [{ user_id: "donor-demo", campaign_id: "campaign-school", campaign_title: campaigns[0].title, saved: true, following: true, updated_at: new Date().toISOString() }],
    notifications: [{ id: "notice-seed", user_id: "donor-demo", event_id: "impact-seed", type: "IMPACT_VERIFIED", campaign_id: "campaign-school", title: campaigns[0].title, message: "Báo cáo hoàn thành nền móng đã được xác minh.", path: "/chien-dich/campaign-school", read_at: null, created_at: new Date(Date.now() - 3_600_000).toISOString() }],
    financialPlans,
    auditLogs: [{ id: "audit-seed", actor_id: "admin-demo", action: "IMPACT_REPORT_VERIFIED", entity_type: "IMPACT_REPORT", entity_id: "impact-seed", created_at: new Date(Date.now() - 3_600_000).toISOString(), service: "CAMPAIGN", new_value: { status: "VERIFIED" } }],
    ledger: [],
    emailNotifications: [],
    sessions: [],
    passwordResetTokens: [],
    anchors: [],
    escrows: campaigns.map((campaign) => {
      const released = impactReports.filter((report) => report.campaign_id === campaign.id && report.status === "VERIFIED").reduce((sum, report) => sum + report.amount_used, 0);
      return { campaign_id: campaign.id, total_donated: campaign.raised_amount, released_amount: released, locked_amount: Math.max(0, campaign.raised_amount - released), contract_state: campaign.status === "CLOSED" ? "CLOSED" : released > 0 ? "FUND_RELEASED" : campaign.status === "APPROVED" ? "DONATION_OPEN" : "CREATED", updated_at: new Date().toISOString(), history: [] } as CampaignEscrow;
    }),
    anchorSeeded: false
  };
}

function loadState(): MockState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<MockState>;
      const fallback = seedState();
      const migrated: MockState = {
        users: Array.isArray(parsed.users) ? (parsed.users as MockUser[]).map((user) => ({ ...user, status: user.status ?? "ACTIVE" })) : fallback.users,
        organizations: Array.isArray(parsed.organizations) ? parsed.organizations : fallback.organizations,
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : fallback.campaigns,
        donations: Array.isArray(parsed.donations) ? parsed.donations : fallback.donations,
        impactReports: Array.isArray(parsed.impactReports) ? parsed.impactReports : fallback.impactReports,
        preferences: Array.isArray(parsed.preferences) ? parsed.preferences : fallback.preferences,
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : fallback.notifications,
        financialPlans: Array.isArray(parsed.financialPlans) ? parsed.financialPlans : fallback.financialPlans,
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : fallback.auditLogs,
        ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
        emailNotifications: Array.isArray(parsed.emailNotifications) ? parsed.emailNotifications : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        passwordResetTokens: Array.isArray(parsed.passwordResetTokens) ? parsed.passwordResetTokens : [],
        anchors: Array.isArray(parsed.anchors) ? parsed.anchors : [],
        escrows: Array.isArray(parsed.escrows) ? parsed.escrows : fallback.escrows,
        anchorSeeded: parsed.anchorSeeded === true
      };
      saveState(migrated);
      return migrated;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  const state = seedState(); saveState(state); return state;
}

function saveState(state: MockState): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

async function ensureSeedLedger(state: MockState): Promise<void> {
  if (state.ledger.length) return;
  for (const donation of state.donations.filter((item) => item.status === "COMPLETED").sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const donationProof = await appendLedger(state, {
      event_id: donation.id, event_type: "DONATION_COMPLETED", campaign_id: donation.campaign_id,
      entity_id: donation.id, created_at: donation.created_at,
      public_payload: { amount: donation.amount, campaign_id: donation.campaign_id, campaign_title: donation.campaign_title, completed_at: donation.created_at, receipt_number: donation.receipt_number }
    });
    Object.assign(donation, { ledger_hash: donationProof.entry_hash, ledger_position: donationProof.position, proof_status: "CONFIRMED" });
  }
  for (const report of state.impactReports.filter((item) => item.status === "VERIFIED" && !item.deleted_at)) {
    report.evidence = await Promise.all(report.evidence.map(async (item) => ({ ...item, sha256: item.sha256 === "seed" ? await sha256(`${report.id}:${item.original_name}`) : item.sha256 })));
    await appendLedger(state, {
      event_id: report.id, event_type: "FUND_USAGE_VERIFIED", campaign_id: report.campaign_id,
      entity_id: report.id, created_at: report.reviewed_at ?? report.created_at,
      public_payload: { report_id: report.id, campaign_id: report.campaign_id, campaign_title: report.campaign_title, title: report.title, amount_used: report.amount_used, report_date: report.report_date, evidence_hashes: report.evidence.map((item) => ({ name: item.original_name, mime_type: item.mime_type, sha256: item.sha256 })) }
    });
  }
  saveState(state);
}

async function merkleParent(left: string, right: string): Promise<string> {
  const bytes = new Uint8Array(64);
  for (let index = 0; index < 32; index += 1) { bytes[index] = Number.parseInt(left.slice(index * 2, index * 2 + 2), 16); bytes[index + 32] = Number.parseInt(right.slice(index * 2, index * 2 + 2), 16); }
  return sha256(bytes.buffer);
}

async function buildMerkle(leaves: string[]): Promise<{ root: string; proofs: MerkleProofNode[][] }> {
  if (!leaves.length) throw new Error("Không có bản ghi chưa neo.");
  const proofs: MerkleProofNode[][] = leaves.map(() => []);
  let level = leaves.map((hash, leafIndex) => ({ hash, indexes: [leafIndex] }));
  while (level.length > 1) {
    if (level.length % 2) level.push({ hash: level.at(-1)!.hash, indexes: [...level.at(-1)!.indexes] });
    const next: typeof level = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]; const right = level[index + 1];
      left.indexes.forEach((leaf) => proofs[leaf].push({ hash: right.hash, direction: "RIGHT" }));
      right.indexes.forEach((leaf) => { if (!left.indexes.includes(leaf)) proofs[leaf].push({ hash: left.hash, direction: "LEFT" }); });
      next.push({ hash: await merkleParent(left.hash, right.hash), indexes: [...new Set([...left.indexes, ...right.indexes])] });
    }
    level = next;
  }
  return { root: level[0].hash, proofs };
}

async function verifyMockProof(leaf: string, proof: MerkleProofNode[], root: string): Promise<boolean> {
  let value = leaf;
  for (const node of proof) value = node.direction === "LEFT" ? await merkleParent(node.hash, value) : await merkleParent(value, node.hash);
  return value === root;
}

async function createMockAnchor(state: MockState): Promise<MockState["anchors"][number]> {
  const anchored = new Set(state.anchors.flatMap((anchor) => anchor.entries.map((entry) => entry.ledger_position)));
  const rows = state.ledger.filter((entry) => !anchored.has(entry.position)).slice(0, 100);
  if (!rows.length) throw Object.assign(new Error("Tất cả bản ghi đã được neo."), { status: 409 });
  const tree = await buildMerkle(rows.map((entry) => entry.entry_hash));
  const now = new Date().toISOString();
  const anchor: MockState["anchors"][number] = {
    id: createId("anchor"), merkle_root: tree.root, from_position: rows[0].position, to_position: rows.at(-1)!.position,
    network: "LOCAL_SIMULATION", anchor_tx_hash: `0x${await sha256(`SIMULATED|${tree.root}|${now}`)}`,
    block_number: rows.at(-1)!.position, explorer_url: null, status: "SIMULATED", anchored_at: now, confirmed_at: now,
    entries: rows.map((entry, index) => ({ ledger_position: entry.position, leaf_index: index, proof: tree.proofs[index] })),
  };
  state.anchors.unshift(anchor); saveState(state); return anchor;
}

async function ensureSeedAnchor(state: MockState): Promise<void> {
  if (state.anchorSeeded) return;
  if (state.ledger.length) await createMockAnchor(state);
  state.anchorSeeded = true; saveState(state);
}

async function mockProofForPosition(state: MockState, position: number): Promise<Record<string, unknown> | null> {
  const ledger = state.ledger.find((entry) => entry.position === position);
  if (!ledger) return null;
  const anchor = state.anchors.find((item) => item.entries.some((entry) => entry.ledger_position === position));
  if (!anchor) return { ledger_position: position, leaf_hash: ledger.entry_hash, proof: [], merkle_root: null, proof_valid: false, anchor: null };
  const entry = anchor.entries.find((item) => item.ledger_position === position)!;
  return { ledger_position: position, leaf_hash: ledger.entry_hash, leaf_index: entry.leaf_index, proof: entry.proof, merkle_root: anchor.merkle_root, proof_valid: await verifyMockProof(ledger.entry_hash, entry.proof, anchor.merkle_root), anchor: { anchor_id: anchor.id, network: anchor.network, anchor_tx_hash: anchor.anchor_tx_hash, block_number: anchor.block_number, explorer_url: anchor.explorer_url, status: anchor.status, anchored_at: anchor.anchored_at, merkle_root: anchor.merkle_root, from_position: anchor.from_position, to_position: anchor.to_position } };
}

function bodyAsObject(options: RequestInit): Record<string, unknown> {
  if (options.body instanceof FormData) return Object.fromEntries(options.body.entries());
  if (typeof options.body === "string") return JSON.parse(options.body) as Record<string, unknown>;
  return {};
}

function currentUser(): User | null {
  const value = localStorage.getItem("cc_user");
  return value ? JSON.parse(value) as User : null;
}

function requireRole(role?: Role): User {
  const user = currentUser();
  const stored = user ? loadState().users.find((item) => item.id === user.id) : null;
  if (stored?.status === "DISABLED") throw Object.assign(new Error("Tài khoản đã bị khóa."), { status: 403 });
  if (!user) throw Object.assign(new Error("Vui lòng đăng nhập để tiếp tục."), { status: 401 });
  if (role && user.role !== role) throw Object.assign(new Error("Bạn không có quyền thực hiện thao tác này."), { status: 403 });
  return stored ? safeUser(stored) : user;
}

function publicCampaigns(state: MockState): Campaign[] {
  const now = Date.now();
  return state.campaigns.filter((item) => !item.deleted_at && item.status === "APPROVED" && new Date(item.end_date).getTime() > now);
}

function createId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function safeUser(user: MockUser): User {
  const { password: _password, ...value } = user;
  return value;
}

function createSession(state: MockState, user: MockUser): AccountSession {
  state.sessions.forEach((session) => { if (session.current) session.current = false; });
  const now = new Date();
  const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const session: AccountSession = {
    id: createId("session"),
    user_agent: navigator.userAgent,
    ip_address: "127.0.0.1",
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: expires.toISOString(),
    revoked_at: null,
    current: true,
  };
  state.sessions.unshift({ ...session, id: `${user.id}:${session.id}` });
  return state.sessions[0];
}

function analyticsPeriod(value: string | null): AnalyticsPeriod {
  return (["7d", "30d", "90d", "all"] as const).includes(value as AnalyticsPeriod) ? value as AnalyticsPeriod : "30d";
}

function periodCutoff(period: AnalyticsPeriod): number {
  return period === "all" ? 0 : Date.now() - Number(period.slice(0, -1)) * 86_400_000;
}

function donationAnalytics(state: MockState, period: AnalyticsPeriod, donations: MockState["donations"], campaignIds?: Set<string>): DonationAnalytics {
  const cutoff = periodCutoff(period);
  const filtered = donations.filter((item) => item.status === "COMPLETED" && new Date(item.created_at).getTime() >= cutoff && (!campaignIds || campaignIds.has(item.campaign_id)));
  const usage = state.ledger.filter((item) => item.event_type === "FUND_USAGE_VERIFIED" && new Date(item.created_at).getTime() >= cutoff && (!campaignIds || campaignIds.has(item.campaign_id))).reduce((sum, item) => sum + Number(item.public_payload.amount_used ?? 0), 0);
  const amount = filtered.reduce((sum, item) => sum + item.amount, 0);
  const timelineMap = new Map<string, { donation_amount: number; donation_count: number }>();
  for (const donation of filtered) {
    const date = new Date(donation.created_at);
    const bucket = period === "all" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01` : date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const current = timelineMap.get(bucket) ?? { donation_amount: 0, donation_count: 0 };
    current.donation_amount += donation.amount; current.donation_count += 1; timelineMap.set(bucket, current);
  }
  const campaignMap = new Map<string, DonationAnalytics["top_campaigns"][number]>();
  for (const donation of filtered) {
    const current = campaignMap.get(donation.campaign_id) ?? { campaign_id: donation.campaign_id, campaign_title: donation.campaign_title, donation_amount: 0, donation_count: 0 };
    current.donation_amount += donation.amount; current.donation_count += 1; campaignMap.set(donation.campaign_id, current);
  }
  return {
    period, granularity: period === "all" ? "month" : "day", as_of: new Date().toISOString(),
    totals: { donation_amount: amount, donation_count: filtered.length, unique_donors: new Set(filtered.map((item) => item.donor_id)).size, campaign_count: new Set(filtered.map((item) => item.campaign_id)).size, average_amount: filtered.length ? Math.round(amount / filtered.length) : 0, verified_fund_usage: usage, transparent_balance: Math.max(0, amount - usage) },
    timeline: [...timelineMap].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, value]) => ({ bucket, ...value })),
    top_campaigns: [...campaignMap.values()].sort((a, b) => b.donation_amount - a.donation_amount).slice(0, 8),
  };
}

function campaignAnalytics(state: MockState, period: AnalyticsPeriod, organizationId?: string): CampaignAnalytics {
  const campaigns = (organizationId ? state.campaigns.filter((item) => item.organization_id === organizationId) : state.campaigns).filter((item) => !item.deleted_at);
  return {
    period, as_of: new Date().toISOString(),
    totals: { campaign_count: campaigns.length, active_count: campaigns.filter((item) => item.status === "APPROVED" && new Date(item.end_date).getTime() > Date.now()).length, closed_count: campaigns.filter((item) => item.status === "CLOSED" || new Date(item.end_date).getTime() <= Date.now()).length, pending_count: campaigns.filter((item) => item.status === "PENDING_REVIEW").length, goal_amount: campaigns.reduce((sum, item) => sum + item.goal_amount, 0), raised_amount: campaigns.reduce((sum, item) => sum + item.raised_amount, 0) },
    category_distribution: [...new Set(campaigns.map((item) => item.category))].map((category) => ({ category, campaign_count: campaigns.filter((item) => item.category === category).length, raised_amount: campaigns.filter((item) => item.category === category).reduce((sum, item) => sum + item.raised_amount, 0) })),
    campaign_progress: [...campaigns].sort((a, b) => b.raised_amount - a.raised_amount).slice(0, 8).map((item) => ({ id: item.id, title: item.title, category: item.category, goal_amount: item.goal_amount, raised_amount: item.raised_amount, status: item.status, progress_percent: Math.min(100, Math.round(item.raised_amount * 1000 / item.goal_amount) / 10) })),
  };
}

function pushAudit(state: MockState, action: string, entityType: string, entityId: string, service: "IDENTITY" | "CAMPAIGN", newValue?: unknown): void {
  state.auditLogs.unshift({ id: createId("audit"), actor_id: requireRole().id, action, entity_type: entityType, entity_id: entityId, created_at: new Date().toISOString(), service, new_value: newValue });
}

function pushAuditForUser(state: MockState, actorId: string, action: string, entityType: string, entityId: string, service: "IDENTITY" | "CAMPAIGN", newValue?: unknown): void {
  state.auditLogs.unshift({ id: createId("audit"), actor_id: actorId, action, entity_type: entityType, entity_id: entityId, created_at: new Date().toISOString(), service, new_value: newValue });
}

function notifyFollowers(state: MockState, campaign: Campaign, type: UserNotification["type"], message: string): void {
  const eventId = createId("campaign-event");
  for (const preference of state.preferences.filter((item) => item.campaign_id === campaign.id && item.following)) {
    state.notifications.unshift({ id: createId("notice"), event_id: eventId, user_id: preference.user_id, type, campaign_id: campaign.id, title: campaign.title, message, path: `/chien-dich/${campaign.id}`, read_at: null, created_at: new Date().toISOString() });
    state.emailNotifications.push({ event_id: `${eventId}:${preference.user_id}`, template: "CAMPAIGN_UPDATE", recipient_user_id: preference.user_id, status: "SIMULATED" });
  }
}

function riskAssessments(state: MockState): RiskAssessment[] {
  const now = Date.now();
  const items = state.campaigns.filter((item) => !item.deleted_at && ["APPROVED", "CLOSED", "PENDING_REVIEW"].includes(item.status)).map((campaign) => {
    const signals: RiskAssessment["signals"] = [];
    const reports = state.impactReports.filter((item) => item.campaign_id === campaign.id && !item.deleted_at);
    const plan = state.financialPlans.find((item) => item.campaign_id === campaign.id);
    const reportOverdue = campaign.raised_amount > 0 && now - new Date(campaign.created_at ?? now).getTime() > 30 * 86_400_000 && !reports.some((item) => item.status === "VERIFIED" && now - new Date(item.reviewed_at ?? item.created_at).getTime() <= 30 * 86_400_000);
    if (reportOverdue) signals.push({ code: "REPORT_OVERDUE", points: 35, explanation: "Không có báo cáo xác minh mới trong 30 ngày." });
    const overdue = plan?.milestones.filter((item) => item.status !== "VERIFIED" && new Date(item.target_date).getTime() < now).length ?? 0;
    if (overdue) signals.push({ code: "MILESTONE_OVERDUE", points: Math.min(50, overdue * 25), explanation: `${overdue} mốc đã quá hạn.` });
    const rejected = reports.filter((item) => item.status === "REJECTED" && now - new Date(item.reviewed_at ?? item.created_at).getTime() <= 90 * 86_400_000).length;
    if (rejected) signals.push({ code: "REPORT_REJECTED", points: Math.min(30, rejected * 15), explanation: `${rejected} báo cáo bị từ chối trong 90 ngày.` });
    if (reports.some((item) => item.status === "PENDING_REVIEW" && now - new Date(item.created_at).getTime() > 48 * 3_600_000)) signals.push({ code: "REVIEW_STALE", points: 20, explanation: "Có báo cáo chờ duyệt quá 48 giờ." });
    if (campaign.status === "APPROVED" && new Date(campaign.end_date).getTime() - now <= 7 * 86_400_000 && campaign.raised_amount / campaign.goal_amount < .25) signals.push({ code: "LOW_PROGRESS_NEAR_END", points: 15, explanation: "Sắp kết thúc nhưng tiến độ dưới 25%." });
    const escrow = state.escrows.find((item) => item.campaign_id === campaign.id);
    if (escrow && (escrow.total_donated !== campaign.raised_amount || escrow.released_amount + escrow.locked_amount !== escrow.total_donated)) signals.push({ code: "ESCROW_MISMATCH", points: 40, explanation: "Số liệu escrow không khớp." });
    const score = Math.min(100, signals.reduce((sum, item) => sum + item.points, 0));
    return { campaign_id: campaign.id, campaign_title: campaign.title, organization_name: campaign.organization_name, status: campaign.status, score, level: score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW", priority_rank: 0, signals } as RiskAssessment;
  }).sort((a, b) => b.score - a.score || a.campaign_title.localeCompare(b.campaign_title));
  return items.map((item, index) => ({ ...item, priority_rank: index + 1 }));
}

function simplePdf(lines: string[]): Blob {
  const ascii = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7E]/g, "?").replace(/[()\\]/g, "\\$&");
  const content = `BT /F1 11 Tf 48 790 Td ${lines.map((line, index) => `${index ? "0 -18 Td " : ""}(${ascii(line)}) Tj`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function resetMockData(): void { localStorage.removeItem(STORAGE_KEY); }

function mockRoleGuide(role: RoleGuideRole, path: string) {
  const sections = roleFunctionGroups
    .filter((group) => group.audience === "COMMON" || group.audience === role || role === "PUBLIC")
    .map((group) => ({
      title: group.title,
      description: group.subtitle,
      actions: group.items.map((item) => ({
        label: item.label,
        path: item.path,
        description: item.description,
        roles: (item.roles ?? ["PUBLIC", "DONOR", "ORGANIZATION", "ADMIN"]) as RoleGuideRole[],
        requires_login: Boolean(item.requiresLogin)
      }))
    }));
  const locked_actions = roleFunctionGroups
    .flatMap((group) => group.items)
    .filter((item) => item.requiresLogin && (!item.roles || !item.roles.includes(role as Role)))
    .map((item) => ({
      label: item.label,
      path: item.path,
      description: item.description,
      roles: (item.roles ?? ["PUBLIC", "DONOR", "ORGANIZATION", "ADMIN"]) as RoleGuideRole[],
      requires_login: Boolean(item.requiresLogin)
    }));
  return {
    role,
    path,
    sections,
    locked_actions,
    tips: [
      role === "PUBLIC" ? "Đăng nhập để menu tự mở đúng chức năng theo vai trò." : "Menu đang lọc chức năng đúng theo tài khoản hiện tại.",
      "Chức năng tiền, biên nhận, ledger và anchor là bất biến; chỉ dữ liệu nháp được sửa/xóa mềm."
    ],
    knowledge_version: "charityconnect-2026.06"
  };
}

function diagnosticRecommendation(issues: string[]): string {
  if (!issues.length) return "Dữ liệu minh bạch đang hợp lệ. Có thể dùng proof này để đối chiếu công khai.";
  if (issues.some((issue) => issue.includes("Hash-chain"))) return "Dừng xác nhận công khai và kiểm tra lại ledger gốc.";
  if (issues.some((issue) => issue.includes("chưa neo"))) return "Tạo TrustChain anchor trong màn hình quản trị để hoàn tất xác minh.";
  return "Kiểm tra lại dữ liệu nguồn hoặc thử tạo proof mới.";
}

async function mockDiagnostics(state: MockState) {
  const chain = await verifyLedger(state.ledger);
  const head = state.ledger.at(-1);
  const anchored = new Set(state.anchors.flatMap((anchor) => anchor.entries.map((entry) => entry.ledger_position)));
  const unanchoredCount = state.ledger.filter((entry) => !anchored.has(entry.position)).length;
  const anchor = state.anchors.at(-1);
  const issues = [
    ...(!chain.valid ? [`Hash-chain không hợp lệ tại vị trí ${chain.invalidPosition}`] : []),
    ...(unanchoredCount > 0 ? [`Còn ${unanchoredCount} ledger entry chưa neo TrustChain`] : [])
  ];
  return {
    chain_valid: chain.valid,
    receipt_valid: null,
    ledger_position: head?.position ?? null,
    entry_hash: head?.entry_hash ?? null,
    previous_hash: head?.previous_hash ?? null,
    merkle_root: anchor?.merkle_root ?? null,
    anchor_status: anchor?.status ?? "UNANCHORED",
    issues,
    recommendation: diagnosticRecommendation(issues),
    entries: state.ledger.length,
    donation_total: state.ledger.filter((item) => item.event_type === "DONATION_COMPLETED").reduce((sum, item) => sum + Number(item.public_payload.amount ?? 0), 0),
    fund_usage_total: state.ledger.filter((item) => item.event_type === "FUND_USAGE_VERIFIED").reduce((sum, item) => sum + Number(item.public_payload.amount_used ?? 0), 0),
    unanchored_count: unanchoredCount
  };
}

export async function mockApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 140));
  const state = loadState();
  await ensureSeedLedger(state);
  await ensureSeedAnchor(state);
  const method = (options.method ?? "GET").toUpperCase();
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname;
  const body = bodyAsObject(options);

  const period = analyticsPeriod(url.searchParams.get("period"));
  if (pathname === "/analytics/donations/public" && method === "GET") return donationAnalytics(state, period, state.donations) as T;
  if (pathname === "/analytics/campaigns/public" && method === "GET") return campaignAnalytics(state, period) as T;
  if (pathname === "/analytics/users/public" && method === "GET") return { as_of: new Date().toISOString(), totals: { donor_count: state.users.filter((item) => item.role === "DONOR").length, verified_organization_count: state.organizations.filter((item) => item.status === "VERIFIED").length } } as UserAnalytics as T;
  if (pathname === "/analytics/donations/me" && method === "GET") { const user = requireRole("DONOR"); return donationAnalytics(state, period, state.donations.filter((item) => item.donor_id === user.id)) as T; }
  if (pathname === "/analytics/donations/organization" && method === "GET") { const user = requireRole("ORGANIZATION"); const ids = new Set(state.campaigns.filter((item) => item.organization_id === user.id && !item.deleted_at).map((item) => item.id)); return donationAnalytics(state, period, state.donations, ids) as T; }
  if (pathname === "/analytics/donations/admin" && method === "GET") { requireRole("ADMIN"); return donationAnalytics(state, period, state.donations) as T; }
  if (pathname === "/analytics/campaigns/organization" && method === "GET") { const user = requireRole("ORGANIZATION"); return campaignAnalytics(state, period, user.id) as T; }
  if (pathname === "/analytics/campaigns/admin" && method === "GET") { requireRole("ADMIN"); return campaignAnalytics(state, period) as T; }
  if (pathname === "/analytics/users/admin" && method === "GET") { requireRole("ADMIN"); return { as_of: new Date().toISOString(), role_distribution: (["DONOR", "ORGANIZATION", "ADMIN"] as const).map((role) => ({ role, count: state.users.filter((item) => item.role === role).length })), organization_statuses: (["PENDING", "VERIFIED", "REJECTED"] as const).map((status) => ({ status, count: state.organizations.filter((item) => item.status === status).length })) } as T; }

  if (pathname === "/assistant/chat" && method === "POST") {
    const message = String(body.message ?? "").toLocaleLowerCase("vi");
    let answer = "Mình có thể hướng dẫn quyên góp, xác minh biên nhận, xem sổ cái minh bạch hoặc sử dụng dashboard theo từng vai trò.";
    if (message.includes("đăng nhập") || message.includes("tài khoản")) {
      answer = "Bạn mở Đăng nhập, chọn nhanh một trong ba vai trò ở khung bên trái rồi hệ thống sẽ tự điền thông tin phù hợp.";
    } else if (message.includes("quyên góp") || message.includes("ủng hộ")) {
      answer = "Đăng nhập vai trò người quyên góp, chọn một chiến dịch còn hạn, bấm Quyên góp, nhập số tiền và xác nhận. Hệ thống ghi nhận giao dịch, phát hành biên nhận và đưa vào sổ cái minh bạch.";
    } else if (message.includes("biên nhận") || message.includes("qr")) {
      answer = "Sau khi quyên góp thành công, mở biên nhận để xem QR và hash. Bạn cũng có thể vào Xác minh biên nhận, nhập mã CC-... để kiểm tra bằng chứng công khai.";
    } else if (message.includes("minh bạch") || message.includes("hash") || message.includes("blockchain")) {
      answer = "Trang Minh bạch công khai chuỗi hash SHA-256 của quyên góp và báo cáo sử dụng quỹ. Chuỗi này giúp phát hiện dữ liệu bị sửa, nhưng không phải tiền mã hóa hay blockchain phi tập trung.";
    } else if (message.includes("tổ chức") || message.includes("báo cáo")) {
      answer = "Tổ chức đã xác minh có thể tạo và nộp chiến dịch, theo dõi quyên góp, rồi gửi báo cáo sử dụng quỹ kèm 1–5 ảnh hoặc PDF để quản trị viên kiểm duyệt.";
    } else if (message.includes("admin") || message.includes("kiểm duyệt")) {
      answer = "Quản trị viên xử lý ba hàng đợi: hồ sơ tổ chức, chiến dịch và báo cáo tác động. Khi duyệt báo cáo, bằng chứng sử dụng quỹ được neo đúng một lần vào hash-chain.";
    }
    return {
      answer,
      mode: "DEMO",
      scope: "INTERNAL",
      searched_web: false,
      knowledge_version: "charityconnect-2026.06",
      sources: [{ kind: "INTERNAL", title: "Hướng dẫn sử dụng CharityConnect", path: "/" }],
      actions: [{ label: "Xem chiến dịch", path: "/" }],
      suggestions: ["Cách đăng nhập?", "Cách xác minh biên nhận?", "Hash-chain hoạt động thế nào?"]
    } as T;
  }
  if (pathname === "/assistant/role-guide" && method === "GET") {
    const role = (url.searchParams.get("role") ?? "PUBLIC") as RoleGuideRole;
    return mockRoleGuide(role, url.searchParams.get("path") ?? "/") as T;
  }

  if (pathname === "/campaigns" && method === "GET") {
    const search = (url.searchParams.get("search") ?? "").toLocaleLowerCase("vi");
    const category = url.searchParams.get("category");
    const progressMin = Number(url.searchParams.get("progress_min") ?? 0);
    const progressMax = Number(url.searchParams.get("progress_max") ?? 100);
    const endingWithin = url.searchParams.get("ending_within") ?? "all";
    const sort = url.searchParams.get("sort") ?? "newest";
    let items = publicCampaigns(state).filter((item) => {
      const progress = item.raised_amount * 100 / item.goal_amount;
      const daysLeft = (new Date(item.end_date).getTime() - Date.now()) / 86_400_000;
      return (!search || `${item.title} ${item.summary}`.toLocaleLowerCase("vi").includes(search)) && (!category || item.category === category) && progress >= progressMin && progress <= progressMax && (endingWithin === "all" || daysLeft <= Number(endingWithin));
    });
    items = [...items].sort((a, b) => sort === "ending_soon" ? new Date(a.end_date).getTime() - new Date(b.end_date).getTime() : sort === "progress_desc" ? b.raised_amount / b.goal_amount - a.raised_amount / a.goal_amount : new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    return items as T;
  }
  const publicFinancialPlan = pathname.match(/^\/campaigns\/([^/]+)\/financial-plan$/);
  if (publicFinancialPlan && method === "GET") {
    const plan = state.financialPlans.find((item) => item.campaign_id === publicFinancialPlan[1]);
    if (!plan) throw Object.assign(new Error("Không tìm thấy kế hoạch tài chính."), { status: 404 });
    return plan as T;
  }
  const publicDetail = pathname.match(/^\/campaigns\/([^/]+)$/);
  if (publicDetail && method === "GET") {
    const campaign = publicCampaigns(state).find((item) => item.id === publicDetail[1]);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    return campaign as T;
  }
  const publicContract = pathname.match(/^\/campaigns\/([^/]+)\/contract$/);
  if (publicContract && method === "GET") {
    const escrow = state.escrows.find((item) => item.campaign_id === publicContract[1]);
    if (!escrow) throw Object.assign(new Error("Không tìm thấy escrow chiến dịch."), { status: 404 });
    return escrow as T;
  }
  const publicReports = pathname.match(/^\/campaigns\/([^/]+)\/impact-reports$/);
  if (publicReports && method === "GET") {
    return state.impactReports.filter((item) => item.campaign_id === publicReports[1] && item.status === "VERIFIED" && !item.deleted_at) as T;
  }
  if (pathname === "/transparency/ledger" && method === "GET") {
    const campaignId = url.searchParams.get("campaign_id");
    const eventType = url.searchParams.get("event_type");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
    const cursor = Number(url.searchParams.get("cursor") ?? Number.MAX_SAFE_INTEGER);
    const items = [...state.ledger].reverse().filter((item) => item.position < cursor && (!campaignId || item.campaign_id === campaignId) && (!eventType || item.event_type === eventType)).slice(0, limit);
    return { items, next_cursor: items.length === limit ? items.at(-1)?.position : null } as T;
  }
  if (pathname === "/transparency/verify" && method === "GET") {
    const result = await verifyLedger(state.ledger);
    return {
      valid: result.valid, status: result.valid ? "CONFIRMED" : "INVALID", entries: state.ledger.length,
      head_hash: state.ledger.at(-1)?.entry_hash ?? GENESIS_HASH, invalid_position: result.invalidPosition,
      donation_total: state.ledger.filter((item) => item.event_type === "DONATION_COMPLETED").reduce((sum, item) => sum + Number(item.public_payload.amount ?? 0), 0),
      fund_usage_total: state.ledger.filter((item) => item.event_type === "FUND_USAGE_VERIFIED").reduce((sum, item) => sum + Number(item.public_payload.amount_used ?? 0), 0)
    } as T;
  }
  if (pathname === "/transparency/diagnostics" && method === "GET") return await mockDiagnostics(state) as T;
  if (pathname === "/admin/transparency/anchors" && method === "POST") { requireRole("ADMIN"); return await createMockAnchor(state) as T; }
  if (pathname === "/transparency/anchors/health" && method === "GET") {
    const statuses: Record<string, number> = {};
    let onchain = 0; let simulated = 0;
    for (const item of state.anchors) {
      statuses[item.status] = (statuses[item.status] ?? 0) + 1;
      if (item.network === "SEPOLIA") onchain += 1; else simulated += 1;
    }
    const anchoredPositions = new Set(state.anchors.flatMap((item) => item.entries.map((entry) => entry.ledger_position)));
    const unanchored = state.ledger.filter((entry) => !anchoredPositions.has(entry.position)).length;
    const chain = await verifyLedger(state.ledger);
    const issues: string[] = [];
    if (!chain.valid) issues.push(`Hash-chain không hợp lệ tại vị trí ${chain.invalidPosition}`);
    if (unanchored > 0) issues.push(`Còn ${unanchored} ledger entry chưa neo TrustChain`);
    if (statuses.FAILED) issues.push(`${statuses.FAILED} anchor ở trạng thái FAILED`);
    const { entries: _entries, ...latest } = state.anchors[0] ?? { entries: [] };
    return {
      total_anchors: state.anchors.length, onchain_anchors: onchain, simulated_anchors: simulated,
      unanchored_entries: unanchored, statuses, chain_valid: chain.valid,
      latest_anchor: state.anchors[0] ? latest : null, issues,
      recommendation: issues.length ? "Kiểm tra lại dữ liệu minh bạch trước khi công bố." : "Dữ liệu minh bạch đang hợp lệ."
    } as T;
  }
  if (pathname === "/transparency/anchors" && method === "GET") {
    const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0)); const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 20));
    const items = state.anchors.slice(cursor, cursor + limit).map(({ entries: _entries, ...anchor }) => anchor);
    return { items, next_cursor: cursor + limit < state.anchors.length ? cursor + limit : null } as T;
  }
  const publicMerkleProof = pathname.match(/^\/transparency\/proofs\/(\d+)$/);
  if (publicMerkleProof && method === "GET") {
    const result = await mockProofForPosition(state, Number(publicMerkleProof[1]));
    if (!result) throw Object.assign(new Error("Không tìm thấy bản ghi sổ cái."), { status: 404 });
    return result as T;
  }
  const verifyOnchain = pathname.match(/^\/transparency\/anchors\/([^/]+)\/verify-onchain$/);
  if (verifyOnchain && method === "GET") {
    const anchor = state.anchors.find((item) => (item.id ?? "") === verifyOnchain[1]);
    if (!anchor) throw Object.assign(new Error("Không tìm thấy điểm neo."), { status: 404 });
    const onSepolia = anchor.network === "SEPOLIA";
    return {
      anchor_id: anchor.id, network: anchor.network, status: anchor.status,
      from_position: anchor.from_position, to_position: anchor.to_position,
      onchain: {
        onchain_verified: onSepolia, network: anchor.network, tx_hash: anchor.anchor_tx_hash,
        expected_root: anchor.merkle_root, onchain_root: onSepolia ? anchor.merkle_root : null,
        confirmations: 0, explorer_url: anchor.explorer_url, reason: onSepolia ? "VERIFIED" : "NOT_ON_CHAIN"
      }
    } as T;
  }
  const exportProof = pathname.match(/^\/transparency\/proofs\/(\d+)\/export$/);
  if (exportProof && method === "GET") {
    const result = await mockProofForPosition(state, Number(exportProof[1])) as Record<string, unknown> | null;
    if (!result) throw Object.assign(new Error("Không tìm thấy bản ghi sổ cái."), { status: 404 });
    return {
      schema: "charityconnect-merkle-proof-v1", algorithm: "SHA-256",
      ledger_position: result.ledger_position, leaf_hash: result.leaf_hash, leaf_index: result.leaf_index ?? null,
      merkle_proof: result.proof, merkle_root: result.merkle_root, proof_valid: result.proof_valid,
      anchor: result.anchor,
      verify_instructions: "Ghép leaf_hash với từng node theo direction rồi SHA-256; kết quả cuối phải bằng merkle_root."
    } as T;
  }
  const publicReceipt = pathname.match(/^\/transparency\/receipts\/([^/]+)$/);
  if (publicReceipt && method === "GET") {
    const proof = state.ledger.find((item) => item.event_type === "DONATION_COMPLETED" && item.public_payload.receipt_number === decodeURIComponent(publicReceipt[1]));
    if (!proof) throw Object.assign(new Error("Không tìm thấy bằng chứng biên nhận."), { status: 404 });
    const chain = await verifyLedger(state.ledger);
    const merkle = await mockProofForPosition(state, proof.position) as { proof: MerkleProofNode[]; merkle_root: string | null; proof_valid: boolean; anchor: LedgerAnchor | null };
    const verificationStatus = !chain.valid || (merkle.anchor && !merkle.proof_valid) ? "INVALID" : merkle.anchor ? "CONFIRMED" : "UNANCHORED";
    return { receipt_number: proof.public_payload.receipt_number, campaign_id: proof.campaign_id, campaign_title: proof.public_payload.campaign_title, amount: proof.public_payload.amount, completed_at: proof.public_payload.completed_at, ledger_hash: proof.entry_hash, ledger_position: proof.position, previous_hash: proof.previous_hash, proof_status: chain.valid ? "CONFIRMED" : "INVALID", merkle_proof: merkle.proof, merkle_root: merkle.merkle_root, merkle_proof_valid: merkle.proof_valid, anchor: merkle.anchor, verification_status: verificationStatus } as T;
  }
  const receiptDiagnostics = pathname.match(/^\/transparency\/diagnostics\/receipts\/([^/]+)$/);
  if (receiptDiagnostics && method === "GET") {
    const proof = state.ledger.find((item) => item.event_type === "DONATION_COMPLETED" && item.public_payload.receipt_number === decodeURIComponent(receiptDiagnostics[1]));
    if (!proof) throw Object.assign(new Error("Không tìm thấy bằng chứng biên nhận."), { status: 404 });
    const chain = await verifyLedger(state.ledger);
    const merkle = await mockProofForPosition(state, proof.position) as { merkle_root: string | null; proof_valid: boolean; anchor: LedgerAnchor | null };
    const verificationStatus = !chain.valid || (merkle.anchor && !merkle.proof_valid) ? "INVALID" : merkle.anchor ? "CONFIRMED" : "UNANCHORED";
    const issues = [
      ...(!chain.valid ? ["Hash-chain không xác nhận được biên nhận"] : []),
      ...(verificationStatus === "UNANCHORED" ? ["Biên nhận hợp lệ nhưng chưa neo TrustChain"] : []),
      ...(verificationStatus === "INVALID" ? ["Biên nhận hoặc Merkle proof không hợp lệ"] : [])
    ];
    return {
      chain_valid: chain.valid,
      receipt_valid: verificationStatus === "CONFIRMED",
      ledger_position: proof.position,
      entry_hash: proof.entry_hash,
      previous_hash: proof.previous_hash,
      merkle_root: merkle.merkle_root,
      anchor_status: merkle.anchor?.status ?? "UNANCHORED",
      issues,
      recommendation: diagnosticRecommendation(issues),
      receipt_number: proof.public_payload.receipt_number,
      campaign_title: proof.public_payload.campaign_title,
      amount: proof.public_payload.amount,
      verification_status: verificationStatus
    } as T;
  }
  const ledgerDiagnostics = pathname.match(/^\/transparency\/diagnostics\/ledger\/(\d+)$/);
  if (ledgerDiagnostics && method === "GET") {
    const entry = state.ledger.find((item) => item.position === Number(ledgerDiagnostics[1]));
    if (!entry) throw Object.assign(new Error("Không tìm thấy bản ghi sổ cái."), { status: 404 });
    const chain = await verifyLedger(state.ledger);
    const merkle = await mockProofForPosition(state, entry.position) as { merkle_root: string | null; proof_valid: boolean; anchor: LedgerAnchor | null };
    const issues = [
      ...(!chain.valid ? [`Hash-chain không hợp lệ tại vị trí ${chain.invalidPosition}`] : []),
      ...(!merkle.proof_valid ? ["Merkle proof chưa hợp lệ hoặc chưa được tạo"] : []),
      ...(!merkle.anchor ? ["Ledger entry chưa neo TrustChain"] : [])
    ];
    return {
      chain_valid: chain.valid,
      receipt_valid: null,
      ledger_position: entry.position,
      entry_hash: entry.entry_hash,
      previous_hash: entry.previous_hash,
      merkle_root: merkle.merkle_root,
      anchor_status: merkle.anchor?.status ?? "UNANCHORED",
      issues,
      recommendation: diagnosticRecommendation(issues),
      event_type: entry.event_type,
      campaign_id: entry.campaign_id,
      public_payload: entry.public_payload
    } as T;
  }

  if (pathname === "/auth/login" && method === "POST") {
    const user = state.users.find((item) => item.email === body.email && item.password === body.password);
    if (user?.status === "DISABLED") throw Object.assign(new Error("Tài khoản đã bị khóa."), { status: 403 });
    if (!user) throw Object.assign(new Error("Email hoặc mật khẩu chưa đúng."), { status: 401 });
    const session = createSession(state, user);
    pushAuditForUser(state, user.id, "LOGIN_SUCCEEDED", "USER", user.id, "IDENTITY", { session_id: session.id });
    saveState(state);
    return { token: `demo-token-${user.id}`, user: safeUser(user) } as T;
  }
  if (pathname === "/auth/register" && method === "POST") {
    if (body.terms_accepted !== true) throw Object.assign(new Error("Bạn cần đồng ý điều khoản sử dụng."), { status: 400 });
    if (state.users.some((item) => item.email === body.email)) throw Object.assign(new Error("Email đã được sử dụng."), { status: 409 });
    const user: MockUser = { id: createId("user"), name: String(body.name), email: String(body.email), password: String(body.password), role: body.role as Role, status: "ACTIVE" };
    state.users.push(user); state.emailNotifications.push({ event_id: user.id, template: "WELCOME", recipient_user_id: user.id, status: "SIMULATED" }); saveState(state);
    createSession(state, user); saveState(state);
    return { token: `demo-token-${user.id}`, user: safeUser(user), email_notification: "QUEUED" } as T;
  }
  if (pathname === "/profile" && method === "GET") return requireRole() as T;
  if (pathname === "/profile" && ["PATCH", "PUT"].includes(method)) {
    const current = requireRole();
    const user = state.users.find((item) => item.id === current.id);
    if (!user) throw Object.assign(new Error("Không tìm thấy tài khoản."), { status: 404 });
    user.name = String(body.name ?? user.name).trim();
    localStorage.setItem("cc_user", JSON.stringify(safeUser(user)));
    pushAuditForUser(state, user.id, "PROFILE_UPDATED", "USER", user.id, "IDENTITY", { name: user.name });
    saveState(state);
    return safeUser(user) as T;
  }
  if (pathname === "/auth/change-password" && method === "POST") {
    const current = requireRole();
    const user = state.users.find((item) => item.id === current.id);
    if (!user || user.password !== body.current_password) throw Object.assign(new Error("Mật khẩu hiện tại không đúng."), { status: 401 });
    user.password = String(body.new_password);
    const now = new Date().toISOString();
    state.sessions.filter((session) => session.id.startsWith(`${user.id}:`) && !session.current).forEach((session) => { session.revoked_at ??= now; });
    pushAuditForUser(state, user.id, "PASSWORD_CHANGED", "USER", user.id, "IDENTITY", { sessions_revoked: "OTHER_ACTIVE_SESSIONS" });
    saveState(state);
    return { message: "Đã đổi mật khẩu." } as T;
  }
  if (pathname === "/auth/password-reset/request" && method === "POST") {
    const user = state.users.find((item) => item.email === body.email && item.status !== "DISABLED");
    if (user) {
      const token = createId("reset");
      state.passwordResetTokens.push({ token, user_id: user.id, expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), used_at: null });
      state.emailNotifications.push({ event_id: token, template: "PASSWORD_RESET", recipient_user_id: user.id, status: "SIMULATED" });
      pushAuditForUser(state, user.id, "PASSWORD_RESET_REQUESTED", "USER", user.id, "IDENTITY", { demo_token: token });
      localStorage.setItem("cc_last_reset_token", token);
      saveState(state);
    }
    return { message: "Nếu email tồn tại, hệ thống đã gửi hướng dẫn đặt lại mật khẩu.", demo_token: user ? localStorage.getItem("cc_last_reset_token") : undefined } as T;
  }
  if (pathname === "/auth/password-reset/confirm" && method === "POST") {
    const token = state.passwordResetTokens.find((item) => item.token === body.token && !item.used_at && new Date(item.expires_at).getTime() > Date.now());
    if (!token) throw Object.assign(new Error("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."), { status: 400 });
    const user = state.users.find((item) => item.id === token.user_id);
    if (!user) throw Object.assign(new Error("Không tìm thấy tài khoản."), { status: 404 });
    user.password = String(body.new_password); token.used_at = new Date().toISOString();
    state.sessions.filter((session) => session.id.startsWith(`${user.id}:`)).forEach((session) => { session.revoked_at ??= token.used_at; });
    pushAuditForUser(state, user.id, "PASSWORD_RESET_CONFIRMED", "USER", user.id, "IDENTITY", { sessions_revoked: "ALL" });
    saveState(state);
    return { message: "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại." } as T;
  }
  if (pathname === "/sessions" && method === "GET") {
    const user = requireRole();
    return state.sessions.filter((session) => session.id.startsWith(`${user.id}:`)) as T;
  }
  if (pathname === "/sessions" && method === "DELETE") {
    const user = requireRole(); const now = new Date().toISOString();
    state.sessions.filter((session) => session.id.startsWith(`${user.id}:`)).forEach((session) => { session.revoked_at ??= now; });
    pushAuditForUser(state, user.id, "SESSION_REVOKED", "USER", user.id, "IDENTITY", { scope: "ALL" }); saveState(state);
    return { message: "Đã đăng xuất tất cả phiên." } as T;
  }
  const sessionPath = pathname.match(/^\/sessions\/(.+)$/);
  if (sessionPath && method === "DELETE") {
    const user = requireRole();
    const sessionId = decodeURIComponent(sessionPath[1]);
    const session = state.sessions.find((item) => item.id === sessionId && item.id.startsWith(`${user.id}:`));
    if (!session) throw Object.assign(new Error("Không tìm thấy phiên đăng nhập."), { status: 404 });
    session.revoked_at ??= new Date().toISOString();
    pushAuditForUser(state, user.id, "SESSION_REVOKED", "SESSION", session.id, "IDENTITY", { scope: "ONE" }); saveState(state);
    return { message: "Đã thu hồi phiên." } as T;
  }
  if (pathname === "/me/audit-logs" && method === "GET") {
    const user = requireRole();
    return state.auditLogs.filter((item) => item.actor_id === user.id || item.entity_id === user.id).slice(0, 50) as T;
  }
  if (pathname === "/admin/users" && method === "GET") {
    requireRole("ADMIN");
    const role = url.searchParams.get("role");
    const status = url.searchParams.get("status");
    return state.users.filter((item) => (!role || item.role === role) && (!status || (item.status ?? "ACTIVE") === status)).map((item) => safeUser(item) as AccountUser) as T;
  }
  const adminUserStatus = pathname.match(/^\/admin\/users\/([^/]+)\/status$/);
  if (adminUserStatus && method === "PATCH") {
    const admin = requireRole("ADMIN");
    const user = state.users.find((item) => item.id === adminUserStatus[1]);
    if (!user) throw Object.assign(new Error("Không tìm thấy tài khoản."), { status: 404 });
    if (user.id === admin.id && body.status === "DISABLED") throw Object.assign(new Error("Không thể tự khóa tài khoản quản trị đang dùng."), { status: 409 });
    user.status = body.status as MockUser["status"];
    if (user.status === "DISABLED") state.sessions.filter((session) => session.id.startsWith(`${user.id}:`)).forEach((session) => { session.revoked_at ??= new Date().toISOString(); });
    pushAuditForUser(state, admin.id, user.status === "DISABLED" ? "USER_DISABLED" : "USER_ENABLED", "USER", user.id, "IDENTITY", { status: user.status });
    saveState(state);
    return safeUser(user) as T;
  }

  if (pathname === "/me/campaign-preferences" && method === "GET") {
    const user = requireRole("DONOR");
    return state.preferences.filter((item) => item.user_id === user.id).map(({ user_id: _userId, ...item }) => item) as T;
  }
  const preferencePath = pathname.match(/^\/me\/campaign-preferences\/([^/]+)$/);
  if (preferencePath && method === "GET") {
    const user = requireRole("DONOR");
    const item = state.preferences.find((entry) => entry.user_id === user.id && entry.campaign_id === preferencePath[1]);
    return (item ? { campaign_id: item.campaign_id, campaign_title: item.campaign_title, saved: item.saved, following: item.following, updated_at: item.updated_at } : { campaign_id: preferencePath[1], saved: false, following: false }) as T;
  }
  if (preferencePath && method === "PUT") {
    const user = requireRole("DONOR");
    const campaign = state.campaigns.find((item) => item.id === preferencePath[1] && !item.deleted_at);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    const existing = state.preferences.find((item) => item.user_id === user.id && item.campaign_id === campaign.id);
    if (!body.saved && !body.following) state.preferences = state.preferences.filter((item) => item !== existing);
    else if (existing) Object.assign(existing, { saved: Boolean(body.saved), following: Boolean(body.following), updated_at: new Date().toISOString() });
    else state.preferences.push({ user_id: user.id, campaign_id: campaign.id, campaign_title: campaign.title, saved: Boolean(body.saved), following: Boolean(body.following), updated_at: new Date().toISOString() });
    saveState(state);
    return { campaign_id: campaign.id, campaign_title: campaign.title, saved: Boolean(body.saved), following: Boolean(body.following), updated_at: new Date().toISOString() } as T;
  }
  if (pathname === "/me/notifications" && method === "GET") {
    const user = requireRole("DONOR"); const status = url.searchParams.get("status") ?? "ALL";
    const items = state.notifications.filter((item) => item.user_id === user.id && (status === "ALL" || !item.read_at)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { items: items.map(({ user_id: _userId, ...item }) => item), unread_count: state.notifications.filter((item) => item.user_id === user.id && !item.read_at).length, next_cursor: null } as NotificationPage as T;
  }
  if (pathname === "/me/notifications/read-all" && method === "PATCH") {
    const user = requireRole("DONOR"); const now = new Date().toISOString(); state.notifications.filter((item) => item.user_id === user.id).forEach((item) => { item.read_at ??= now; }); saveState(state); return { unread_count: 0 } as T;
  }
  const notificationRead = pathname.match(/^\/me\/notifications\/([^/]+)\/read$/);
  if (notificationRead && method === "PATCH") {
    const user = requireRole("DONOR"); const item = state.notifications.find((entry) => entry.id === notificationRead[1] && entry.user_id === user.id);
    if (!item) throw Object.assign(new Error("Không tìm thấy thông báo."), { status: 404 }); item.read_at ??= new Date().toISOString(); saveState(state); return item as T;
  }

  if (pathname === "/organizations/me" && method === "GET") {
    const user = requireRole("ORGANIZATION");
    return (state.organizations.find((item) => item.user_id === user.id) ?? null) as T;
  }
  if (pathname === "/organizations/application" && method === "POST") {
    const user = requireRole("ORGANIZATION");
    const existing = state.organizations.find((item) => item.user_id === user.id);
    const application: OrganizationProfile = { user_id: user.id, email: user.email, legal_name: String(body.legalName), registration_number: String(body.registrationNumber), description: String(body.description ?? ""), status: "PENDING" };
    if (existing) Object.assign(existing, application); else state.organizations.push(application);
    saveState(state); return application as T;
  }
  if (pathname === "/admin/organizations" && method === "GET") {
    requireRole("ADMIN");
    const status = url.searchParams.get("status");
    return state.organizations.filter((item) => !status || item.status === status) as T;
  }
  const organizationStatus = pathname.match(/^\/admin\/organizations\/([^/]+)\/status$/);
  if (organizationStatus && method === "PATCH") {
    requireRole("ADMIN");
    const item = state.organizations.find((organization) => organization.user_id === organizationStatus[1]);
    if (!item) throw Object.assign(new Error("Không tìm thấy tổ chức."), { status: 404 });
    item.status = body.status as OrganizationProfile["status"];
    item.rejection_reason = body.reason ? String(body.reason) : null;
    saveState(state); return item as T;
  }

  if (pathname === "/organization/campaigns" && method === "GET") {
    const user = requireRole("ORGANIZATION");
    return state.campaigns.filter((item) => item.organization_id === user.id && !item.deleted_at) as T;
  }
  if (pathname === "/organization/campaigns" && method === "POST") {
    const user = requireRole("ORGANIZATION");
    const organization = state.organizations.find((item) => item.user_id === user.id);
    if (organization?.status !== "VERIFIED") throw Object.assign(new Error("Tổ chức cần được xác minh trước."), { status: 403 });
    const item: Campaign = {
      id: createId("campaign"), organization_id: user.id, organization_name: organization.legal_name,
      title: String(body.title), summary: String(body.summary), description: String(body.description), category: String(body.category),
      goal_amount: Number(body.goalAmount), raised_amount: 0, end_date: new Date(String(body.endDate)).toISOString(), status: "DRAFT", image_url: "/images/veo-charity-05.jpg"
    };
    state.campaigns.unshift(item); state.escrows.push({ campaign_id: item.id, total_donated: 0, released_amount: 0, locked_amount: 0, contract_state: "CREATED", updated_at: new Date().toISOString(), history: [] }); saveState(state); return item as T;
  }
  const orgCampaignPath = pathname.match(/^\/organization\/campaigns\/([^/]+)$/);
  if (orgCampaignPath && ["PUT", "PATCH"].includes(method)) {
    const user = requireRole("ORGANIZATION");
    const campaign = state.campaigns.find((item) => item.id === orgCampaignPath[1] && item.organization_id === user.id && !item.deleted_at);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    if (!["DRAFT", "REJECTED"].includes(campaign.status)) throw Object.assign(new Error("Chỉ sửa chiến dịch nháp hoặc bị từ chối."), { status: 409 });
    Object.assign(campaign, {
      title: String(body.title ?? campaign.title),
      summary: String(body.summary ?? campaign.summary),
      description: String(body.description ?? campaign.description),
      category: String(body.category ?? campaign.category),
      goal_amount: Number(body.goalAmount ?? campaign.goal_amount),
      end_date: body.endDate ? new Date(String(body.endDate)).toISOString() : campaign.end_date,
      rejection_reason: null,
    });
    pushAudit(state, "CAMPAIGN_UPDATED", "CAMPAIGN", campaign.id, "CAMPAIGN", campaign);
    saveState(state);
    return campaign as T;
  }
  if (orgCampaignPath && method === "DELETE") {
    const user = requireRole("ORGANIZATION");
    const campaign = state.campaigns.find((item) => item.id === orgCampaignPath[1] && item.organization_id === user.id && !item.deleted_at);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    if (!["DRAFT", "REJECTED"].includes(campaign.status)) throw Object.assign(new Error("Chỉ xóa mềm chiến dịch nháp hoặc bị từ chối."), { status: 409 });
    campaign.deleted_at = new Date().toISOString();
    pushAudit(state, "CAMPAIGN_SOFT_DELETED", "CAMPAIGN", campaign.id, "CAMPAIGN", campaign);
    saveState(state);
    return campaign as T;
  }
  const organizationPlan = pathname.match(/^\/organization\/campaigns\/([^/]+)\/financial-plan$/);
  if (organizationPlan && method === "PUT") {
    const user = requireRole("ORGANIZATION"); const campaign = state.campaigns.find((item) => item.id === organizationPlan[1] && item.organization_id === user.id && !item.deleted_at);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    if (!["DRAFT", "REJECTED"].includes(campaign.status)) throw Object.assign(new Error("Chỉ sửa kế hoạch của bản nháp hoặc chiến dịch bị từ chối."), { status: 409 });
    const budgets = (body.budget_items as Array<{ label: string; planned_amount: number }> | undefined) ?? [];
    const milestones = (body.milestones as Array<{ title: string; description?: string; target_date: string; target_amount: number }> | undefined) ?? [];
    if (!budgets.length || !milestones.length || budgets.reduce((sum, item) => sum + Number(item.planned_amount), 0) !== campaign.goal_amount) throw Object.assign(new Error("Tổng ngân sách phải bằng mục tiêu và cần ít nhất một mốc."), { status: 409 });
    const plan: FinancialPlan = { campaign_id: campaign.id, goal_amount: campaign.goal_amount, budget_items: budgets.map((item, index) => ({ id: createId("budget"), label: item.label, planned_amount: Number(item.planned_amount), actual_amount: 0, sort_order: index })), milestones: milestones.map((item, index) => ({ id: createId("milestone"), title: item.title, description: item.description ?? "", target_date: item.target_date, target_amount: Number(item.target_amount), status: "PLANNED", sort_order: index, updated_at: new Date().toISOString() })) };
    state.financialPlans = state.financialPlans.filter((item) => item.campaign_id !== campaign.id); state.financialPlans.push(plan); pushAudit(state, "FINANCIAL_PLAN_UPDATED", "CAMPAIGN", campaign.id, "CAMPAIGN", plan); saveState(state); return plan as T;
  }
  const milestoneStatus = pathname.match(/^\/organization\/campaigns\/([^/]+)\/milestones\/([^/]+)\/status$/);
  if (milestoneStatus && method === "PATCH") {
    const user = requireRole("ORGANIZATION"); const campaign = state.campaigns.find((item) => item.id === milestoneStatus[1] && item.organization_id === user.id && item.status === "APPROVED" && !item.deleted_at);
    const milestone = state.financialPlans.find((item) => item.campaign_id === milestoneStatus[1])?.milestones.find((item) => item.id === milestoneStatus[2]);
    if (!campaign || !milestone) throw Object.assign(new Error("Không tìm thấy mốc."), { status: 404 });
    const target = String(body.status); const valid = (milestone.status === "PLANNED" && target === "IN_PROGRESS") || (milestone.status === "IN_PROGRESS" && target === "SUBMITTED");
    if (!valid) throw Object.assign(new Error("Chuyển trạng thái mốc không hợp lệ."), { status: 409 }); milestone.status = target as typeof milestone.status; milestone.updated_at = new Date().toISOString(); notifyFollowers(state, campaign, "MILESTONE_UPDATED", `Mốc “${milestone.title}” chuyển sang ${target}.`); saveState(state); return milestone as T;
  }
  const campaignAction = pathname.match(/^\/organization\/campaigns\/([^/]+)\/(submit|close)$/);
  if (campaignAction && method === "POST") {
    const user = requireRole("ORGANIZATION");
    const item = state.campaigns.find((campaign) => campaign.id === campaignAction[1] && campaign.organization_id === user.id && !campaign.deleted_at);
    if (!item) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    if (campaignAction[2] === "submit") { const plan = state.financialPlans.find((entry) => entry.campaign_id === item.id); if (!plan || !plan.milestones.length || plan.budget_items.reduce((sum, entry) => sum + entry.planned_amount, 0) !== item.goal_amount) throw Object.assign(new Error("Cần hoàn thiện kế hoạch tài chính trước khi nộp duyệt."), { status: 409 }); }
    item.status = campaignAction[2] === "submit" ? "PENDING_REVIEW" : "CLOSED";
    const escrow = state.escrows.find((entry) => entry.campaign_id === item.id); if (escrow && campaignAction[2] === "close") { escrow.contract_state = "CLOSED"; escrow.updated_at = new Date().toISOString(); }
    item.rejection_reason = null; saveState(state); return item as T;
  }
  const organizationReports = pathname.match(/^\/organization\/campaigns\/([^/]+)\/impact-reports$/);
  if (organizationReports && method === "GET") {
    const user = requireRole("ORGANIZATION");
    const owned = state.campaigns.some((item) => item.id === organizationReports[1] && item.organization_id === user.id && !item.deleted_at);
    if (!owned) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    return state.impactReports.filter((item) => item.campaign_id === organizationReports[1] && !item.deleted_at) as T;
  }
  if (organizationReports && method === "POST") {
    const user = requireRole("ORGANIZATION");
    const campaign = state.campaigns.find((item) => item.id === organizationReports[1] && item.organization_id === user.id && !item.deleted_at);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    if (!["APPROVED", "CLOSED"].includes(campaign.status)) throw Object.assign(new Error("Chiến dịch chưa đủ điều kiện nộp báo cáo."), { status: 409 });
    const form = options.body instanceof FormData ? options.body : null;
    const files = form?.getAll("evidence").filter((item): item is File => item instanceof File) ?? [];
    if (files.length < 1 || files.length > 5) throw Object.assign(new Error("Cần tải lên từ 1 đến 5 file bằng chứng."), { status: 400 });
    if (files.some((file) => !["image/jpeg", "image/png", "application/pdf"].includes(file.type) || file.size > 10 * 1024 * 1024)) throw Object.assign(new Error("File phải là JPG, PNG hoặc PDF và không quá 10 MB."), { status: 400 });
    const allocated = state.impactReports.filter((item) => item.campaign_id === campaign.id && !item.deleted_at && item.status !== "REJECTED").reduce((sum, item) => sum + item.amount_used, 0);
    if (allocated + Number(body.amountUsed) > campaign.raised_amount) throw Object.assign(new Error("Số tiền báo cáo vượt quá số tiền đã nhận."), { status: 409 });
    const plan = state.financialPlans.find((item) => item.campaign_id === campaign.id);
    const milestone = plan?.milestones.find((item) => item.id === body.milestoneId && ["IN_PROGRESS", "SUBMITTED"].includes(item.status));
    const allocations = JSON.parse(String(body.allocations ?? "[]")) as Array<{ budget_item_id: string; amount: number }>;
    if (!milestone || !allocations.length || allocations.reduce((sum, item) => sum + Number(item.amount), 0) !== Number(body.amountUsed) || allocations.some((item) => !plan?.budget_items.some((budget) => budget.id === item.budget_item_id))) throw Object.assign(new Error("Mốc hoặc phân bổ ngân sách không hợp lệ."), { status: 409 });
    const evidence: ImpactEvidence[] = await Promise.all(files.map(async (file) => ({ id: createId("evidence"), original_name: file.name, mime_type: file.type, size_bytes: file.size, sha256: await sha256(await file.arrayBuffer()), url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined })));
    const report: ImpactReport = {
      id: createId("impact"), campaign_id: campaign.id, organization_id: user.id,
      campaign_title: campaign.title, organization_name: campaign.organization_name,
      title: String(body.title), description: String(body.description), amount_used: Number(body.amountUsed),
      report_date: new Date(String(body.reportDate)).toISOString(), status: "PENDING_REVIEW",
      rejection_reason: null, created_at: new Date().toISOString(), evidence, milestone_id: milestone.id, allocations
    };
    const escrow = state.escrows.find((item) => item.campaign_id === campaign.id); if (escrow) { escrow.contract_state = "USAGE_SUBMITTED"; escrow.updated_at = new Date().toISOString(); }
    state.impactReports.unshift(report); saveState(state); return report as T;
  }
  const organizationImpactReport = pathname.match(/^\/organization\/impact-reports\/([^/]+)$/);
  if (organizationImpactReport && method === "PATCH") {
    const user = requireRole("ORGANIZATION");
    const report = state.impactReports.find((item) => item.id === organizationImpactReport[1] && item.organization_id === user.id && !item.deleted_at);
    if (!report) throw Object.assign(new Error("Không tìm thấy báo cáo quỹ."), { status: 404 });
    if (!["DRAFT", "REJECTED"].includes(report.status)) throw Object.assign(new Error("Chỉ sửa báo cáo nháp hoặc bị từ chối."), { status: 409 });
    const allocations = Array.isArray(body.allocations) ? body.allocations as Array<{ budget_item_id: string; amount: number }> : JSON.parse(String(body.allocations ?? "[]")) as Array<{ budget_item_id: string; amount: number }>;
    if (allocations.reduce((sum, item) => sum + Number(item.amount), 0) !== Number(body.amountUsed ?? report.amount_used)) throw Object.assign(new Error("Tổng phân bổ phải bằng số tiền báo cáo."), { status: 409 });
    Object.assign(report, {
      title: String(body.title ?? report.title),
      description: String(body.description ?? report.description),
      amount_used: Number(body.amountUsed ?? report.amount_used),
      report_date: body.reportDate ? new Date(String(body.reportDate)).toISOString() : report.report_date,
      milestone_id: String(body.milestoneId ?? report.milestone_id),
      allocations,
      status: "DRAFT" as const,
      rejection_reason: null,
    });
    pushAudit(state, "IMPACT_REPORT_UPDATED", "IMPACT_REPORT", report.id, "CAMPAIGN", report);
    saveState(state);
    return report as T;
  }
  const organizationImpactSubmit = pathname.match(/^\/organization\/impact-reports\/([^/]+)\/submit$/);
  if (organizationImpactSubmit && method === "POST") {
    const user = requireRole("ORGANIZATION");
    const report = state.impactReports.find((item) => item.id === organizationImpactSubmit[1] && item.organization_id === user.id && !item.deleted_at);
    if (!report) throw Object.assign(new Error("Không tìm thấy báo cáo quỹ."), { status: 404 });
    if (!["DRAFT", "REJECTED"].includes(report.status)) throw Object.assign(new Error("Chỉ gửi duyệt báo cáo nháp hoặc bị từ chối."), { status: 409 });
    if (!report.evidence.length) throw Object.assign(new Error("Cần ít nhất một bằng chứng."), { status: 409 });
    report.status = "PENDING_REVIEW"; report.rejection_reason = null;
    pushAudit(state, "IMPACT_REPORT_RESUBMITTED", "IMPACT_REPORT", report.id, "CAMPAIGN", report);
    saveState(state);
    return report as T;
  }
  if (organizationImpactReport && method === "DELETE") {
    const user = requireRole("ORGANIZATION");
    const report = state.impactReports.find((item) => item.id === organizationImpactReport[1] && item.organization_id === user.id && !item.deleted_at);
    if (!report) throw Object.assign(new Error("Không tìm thấy báo cáo quỹ."), { status: 404 });
    if (!["DRAFT", "REJECTED"].includes(report.status)) throw Object.assign(new Error("Chỉ xóa mềm báo cáo nháp hoặc bị từ chối."), { status: 409 });
    report.deleted_at = new Date().toISOString();
    pushAudit(state, "IMPACT_REPORT_SOFT_DELETED", "IMPACT_REPORT", report.id, "CAMPAIGN", report);
    saveState(state);
    return report as T;
  }
  if (pathname === "/admin/campaigns" && method === "GET") {
    requireRole("ADMIN");
    const status = url.searchParams.get("status");
    return state.campaigns.filter((item) => !item.deleted_at && (!status || item.status === status)) as T;
  }
  if (pathname === "/admin/campaign-risks" && method === "GET") { requireRole("ADMIN"); return riskAssessments(state) as T; }
  if (pathname === "/admin/audit-logs/identity" && method === "GET") { requireRole("ADMIN"); return state.auditLogs.filter((item) => item.service === "IDENTITY") as T; }
  if (pathname === "/admin/audit-logs/campaign" && method === "GET") { requireRole("ADMIN"); return state.auditLogs.filter((item) => item.service === "CAMPAIGN") as T; }
  if (pathname === "/admin/impact-reports" && method === "GET") {
    requireRole("ADMIN");
    const status = url.searchParams.get("status");
    return state.impactReports.filter((item) => !item.deleted_at && (!status || item.status === status)) as T;
  }
  const impactStatus = pathname.match(/^\/admin\/impact-reports\/([^/]+)\/status$/);
  if (impactStatus && method === "PATCH") {
    requireRole("ADMIN");
    const report = state.impactReports.find((item) => item.id === impactStatus[1] && !item.deleted_at);
    if (!report) throw Object.assign(new Error("Không tìm thấy báo cáo."), { status: 404 });
    if (report.status !== "PENDING_REVIEW") throw Object.assign(new Error("Báo cáo đã được kiểm duyệt."), { status: 409 });
    if (body.status === "REJECTED" && !body.reason) throw Object.assign(new Error("Cần nhập lý do từ chối."), { status: 400 });
    report.status = body.status as ImpactReport["status"];
    report.rejection_reason = body.reason ? String(body.reason) : null;
    report.reviewed_at = new Date().toISOString();
    if (report.status === "VERIFIED") {
      await appendLedger(state, {
        event_id: report.id, event_type: "FUND_USAGE_VERIFIED", campaign_id: report.campaign_id,
        entity_id: report.id, created_at: report.reviewed_at,
        public_payload: { report_id: report.id, campaign_id: report.campaign_id, campaign_title: report.campaign_title, title: report.title, amount_used: report.amount_used, report_date: report.report_date, evidence_hashes: report.evidence.map((item) => ({ name: item.original_name, mime_type: item.mime_type, sha256: item.sha256 })) }
      });
      const escrow = state.escrows.find((item) => item.campaign_id === report.campaign_id);
      if (escrow) { escrow.released_amount += report.amount_used; escrow.locked_amount = Math.max(0, escrow.locked_amount - report.amount_used); escrow.contract_state = "FUND_RELEASED"; escrow.updated_at = report.reviewed_at; escrow.history.push({ state: "FUND_RELEASED", amount: report.amount_used, created_at: report.reviewed_at }); }
      const plan = state.financialPlans.find((item) => item.campaign_id === report.campaign_id);
      plan?.budget_items.forEach((budget) => { budget.actual_amount = state.impactReports.filter((item) => item.campaign_id === report.campaign_id && item.status === "VERIFIED" && !item.deleted_at).flatMap((item) => item.allocations ?? []).filter((item) => item.budget_item_id === budget.id).reduce((sum, item) => sum + item.amount, 0); });
      const milestone = plan?.milestones.find((item) => item.id === report.milestone_id); if (milestone) { milestone.status = "VERIFIED"; milestone.updated_at = report.reviewed_at; }
      const campaign = state.campaigns.find((item) => item.id === report.campaign_id && !item.deleted_at); if (campaign) notifyFollowers(state, campaign, "IMPACT_VERIFIED", `Báo cáo “${report.title}” đã được xác minh.`);
    } else {
      const escrow = state.escrows.find((item) => item.campaign_id === report.campaign_id); if (escrow) { escrow.contract_state = escrow.locked_amount ? "FUND_LOCKED" : "DONATION_OPEN"; escrow.updated_at = report.reviewed_at; }
      const milestone = state.financialPlans.find((item) => item.campaign_id === report.campaign_id)?.milestones.find((item) => item.id === report.milestone_id); if (milestone) { milestone.status = "IN_PROGRESS"; milestone.updated_at = report.reviewed_at; }
    }
    saveState(state); return report as T;
  }
  const campaignStatus = pathname.match(/^\/admin\/campaigns\/([^/]+)\/status$/);
  if (campaignStatus && method === "PATCH") {
    requireRole("ADMIN");
    const item = state.campaigns.find((campaign) => campaign.id === campaignStatus[1] && !campaign.deleted_at);
    if (!item) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    item.status = body.status as Campaign["status"]; item.rejection_reason = body.reason ? String(body.reason) : null;
    const escrow = state.escrows.find((entry) => entry.campaign_id === item.id); if (escrow) { escrow.contract_state = item.status === "APPROVED" ? "DONATION_OPEN" : "CREATED"; escrow.updated_at = new Date().toISOString(); }
    pushAudit(state, `CAMPAIGN_${item.status}`, "CAMPAIGN", item.id, "CAMPAIGN", item);
    if (item.status === "APPROVED") notifyFollowers(state, item, "CAMPAIGN_APPROVED", "Chiến dịch đã được phê duyệt và bắt đầu nhận quyên góp.");
    saveState(state); return item as T;
  }

  if (pathname === "/donations" && method === "POST") {
    const user = requireRole("DONOR");
    const campaign = publicCampaigns(state).find((item) => item.id === body.campaign_id);
    if (!campaign) throw Object.assign(new Error("Chiến dịch không còn nhận quyên góp."), { status: 409 });
    const now = new Date().toISOString();
    const donation = { id: createId("donation"), campaign_id: campaign.id, campaign_title: campaign.title, amount: Number(body.amount), anonymous: Boolean(body.anonymous), status: "COMPLETED" as const, created_at: now, receipt_number: `CC-${new Date().getFullYear()}-${String(state.donations.length + 129).padStart(6, "0")}`, donor_id: user.id, donor_name: user.name, issued_at: now };
    campaign.raised_amount = Math.min(campaign.goal_amount, campaign.raised_amount + donation.amount);
    const escrow = state.escrows.find((item) => item.campaign_id === campaign.id); if (escrow) { escrow.total_donated += donation.amount; escrow.locked_amount += donation.amount; escrow.contract_state = "DONATION_OPEN"; escrow.updated_at = now; escrow.history.push({ state: "DONATION_OPEN", amount: donation.amount, created_at: now }); }
    const proof = await appendLedger(state, {
      event_id: donation.id, event_type: "DONATION_COMPLETED", campaign_id: campaign.id,
      entity_id: donation.id, created_at: now,
      public_payload: { amount: donation.amount, campaign_id: campaign.id, campaign_title: campaign.title, completed_at: now, receipt_number: donation.receipt_number }
    });
    Object.assign(donation, { ledger_hash: proof.entry_hash, ledger_position: proof.position, proof_status: "CONFIRMED" });
    state.donations.unshift(donation); state.emailNotifications.push({ event_id: donation.id, template: "DONATION_THANK_YOU", recipient_user_id: user.id, status: "SIMULATED" });
    const formattedAmount = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(donation.amount);
    state.notifications.unshift({ id: createId("notice"), event_id: donation.id, user_id: user.id, type: "DONATION_RECEIVED", campaign_id: campaign.id, title: "Cảm ơn bạn đã quyên góp", message: `Bạn đã quyên góp ${formattedAmount} cho chiến dịch "${campaign.title}". Cảm ơn tấm lòng của bạn!`, path: `/bien-nhan/${donation.id}`, read_at: null, created_at: now });
    saveState(state); return donation as T;
  }
  if (pathname === "/donations/history" && method === "GET") {
    const user = requireRole("DONOR");
    return state.donations.filter((item) => item.donor_id === user.id) as T;
  }
  if (pathname === "/donations/me/annual-statement" && method === "GET") {
    const user = requireRole("DONOR"); const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
    const donations = state.donations.filter((item) => item.donor_id === user.id && new Date(item.created_at).getFullYear() === year && item.status === "COMPLETED");
    const total = donations.reduce((sum, item) => sum + item.amount, 0);
    return simplePdf(["CHARITYCONNECT", `Bao cao dong gop nam ${year}`, `Nguoi quyen gop: ${user.name}`, `Tong dong gop: ${total.toLocaleString("en-US")} VND - ${donations.length} luot`, ...donations.map((item) => `${item.receipt_number} | ${item.campaign_title} | ${item.amount.toLocaleString("en-US")} VND | ${item.proof_status ?? "PENDING"}`)]) as T;
  }
  const receipt = pathname.match(/^\/donations\/([^/]+)\/receipt$/);
  if (receipt && method === "GET") {
    const user = requireRole("DONOR");
    const donation = state.donations.find((item) => item.id === receipt[1] && item.donor_id === user.id);
    if (!donation) throw Object.assign(new Error("Không tìm thấy biên nhận."), { status: 404 });
    return donation as T;
  }
  const organizationDonations = pathname.match(/^\/organization\/donations\/([^/]+)$/);
  if (organizationDonations && method === "GET") {
    const user = requireRole("ORGANIZATION");
    const campaign = state.campaigns.find((item) => item.id === organizationDonations[1] && item.organization_id === user.id && !item.deleted_at);
    if (!campaign) throw Object.assign(new Error("Không tìm thấy chiến dịch."), { status: 404 });
    return state.donations.filter((item) => item.campaign_id === campaign.id).map((item) => ({ ...item, donor_name: item.anonymous ? "Ẩn danh" : item.donor_name })) as T;
  }

  throw Object.assign(new Error(`Chưa hỗ trợ API ${method} ${pathname}`), { status: 404 });
}
