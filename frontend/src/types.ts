export type Role = "DONOR" | "ORGANIZATION" | "ADMIN";
export type CampaignStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED";
export type LedgerEventType = "DONATION_COMPLETED" | "FUND_USAGE_VERIFIED";
export type LedgerProofStatus = "CONFIRMED" | "PENDING" | "INVALID";
export type ImpactReportStatus = "DRAFT" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
export type AnchorStatus = "SIMULATED" | "PENDING" | "CONFIRMED" | "FAILED";
export type ReceiptVerificationStatus = "CONFIRMED" | "UNANCHORED" | "INVALID";
export type ContractState = "CREATED" | "APPROVED" | "DONATION_OPEN" | "FUND_LOCKED" | "USAGE_SUBMITTED" | "USAGE_VERIFIED" | "FUND_RELEASED" | "CLOSED";

export type UserStatus = "ACTIVE" | "DISABLED";
export interface User { id: string; email: string; name: string; role: Role; status?: UserStatus }
export interface AuthPayload { token: string; refresh_token?: string; user: User; email_notification?: "QUEUED" }
export interface AccountSession {
  id: string; user_agent?: string | null; ip_address?: string | null; created_at: string;
  last_seen_at?: string; expires_at?: string; revoked_at?: string | null; current?: boolean;
}
export interface AccountUser extends User { status: UserStatus; created_at?: string; updated_at?: string }
export interface Campaign {
  id: string;
  organization_id: string;
  organization_name: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  goal_amount: number;
  raised_amount: number;
  end_date: string;
  status: CampaignStatus;
  image_url?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
  deleted_at?: string | null;
}
export interface Donation {
  id: string;
  campaign_id: string;
  campaign_title: string;
  amount: number;
  anonymous: boolean;
  status: "COMPLETED" | "FAILED";
  created_at: string;
  receipt_number: string;
  ledger_hash?: string;
  ledger_position?: number;
  proof_status?: LedgerProofStatus;
}

export interface LedgerEntry {
  position: number;
  event_id: string;
  event_type: LedgerEventType;
  campaign_id: string;
  entity_id: string;
  public_payload: Record<string, unknown>;
  previous_hash: string;
  entry_hash: string;
  created_at: string;
}

export interface LedgerVerification {
  valid: boolean;
  status: LedgerProofStatus;
  entries: number;
  head_hash: string;
  invalid_position: number | null;
  donation_total: number;
  fund_usage_total: number;
}

export interface MerkleProofNode { hash: string; direction: "LEFT" | "RIGHT" }
export interface LedgerAnchor {
  id?: string; anchor_id?: string; merkle_root: string; from_position: number; to_position: number;
  network: string; anchor_tx_hash: string; block_number?: number | null; explorer_url?: string | null;
  status: AnchorStatus; anchored_at: string; confirmed_at?: string | null;
}
export interface PublicReceiptProof {
  receipt_number: string; campaign_title: string; amount: number; completed_at: string;
  ledger_hash: string; ledger_position: number; previous_hash: string; proof_status: LedgerProofStatus;
  merkle_proof: MerkleProofNode[]; merkle_root?: string | null; merkle_proof_valid: boolean;
  anchor?: LedgerAnchor | null; verification_status: ReceiptVerificationStatus;
}
export interface CampaignEscrow {
  campaign_id: string; total_donated: number; released_amount: number; locked_amount: number;
  contract_state: ContractState; updated_at: string;
  history: Array<{ state: ContractState; amount?: number | null; created_at: string }>;
}

export interface ImpactEvidence {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  url?: string;
}

export interface ImpactReport {
  id: string;
  campaign_id: string;
  organization_id: string;
  campaign_title?: string;
  organization_name?: string;
  title: string;
  description: string;
  amount_used: number;
  report_date: string;
  status: ImpactReportStatus;
  rejection_reason?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  deleted_at?: string | null;
  evidence: ImpactEvidence[];
  milestone_id?: string | null;
  allocations?: ImpactAllocation[];
}

export interface CampaignPreference {
  campaign_id: string; campaign_title?: string; saved: boolean; following: boolean; updated_at?: string;
}
export interface UserNotification {
  id: string; event_id: string; type: "CAMPAIGN_APPROVED" | "MILESTONE_UPDATED" | "IMPACT_VERIFIED" | "DONATION_RECEIVED";
  campaign_id: string; title: string; message: string; path: string; read_at?: string | null; created_at: string;
}
export interface NotificationPage { items: UserNotification[]; unread_count: number; next_cursor?: string | null }
export interface BudgetItem { id: string; label: string; planned_amount: number; actual_amount: number; sort_order: number }
export type MilestoneStatus = "PLANNED" | "IN_PROGRESS" | "SUBMITTED" | "VERIFIED" | "DELAYED";
export interface CampaignMilestone { id: string; title: string; description: string; target_date: string; target_amount: number; status: MilestoneStatus; sort_order: number; updated_at: string }
export interface FinancialPlan { campaign_id: string; goal_amount: number; budget_items: BudgetItem[]; milestones: CampaignMilestone[] }
export interface ImpactAllocation { budget_item_id: string; amount: number }
export interface RiskSignal { code: string; points: number; explanation: string }
export interface RiskAssessment { campaign_id: string; campaign_title: string; organization_name: string; status: CampaignStatus; score: number; level: "LOW" | "MEDIUM" | "HIGH"; priority_rank: number; signals: RiskSignal[] }
export interface AuditLogEntry { id: string; actor_id?: string | null; action: string; entity_type: string; entity_id: string; previous_value?: unknown; new_value?: unknown; created_at: string; service: "IDENTITY" | "CAMPAIGN" }

export interface AssistantResponse {
  answer: string;
  mode: "DEMO" | "OPENAI" | "ANTHROPIC";
  scope: "INTERNAL" | "EXTERNAL_WEB";
  searched_web: boolean;
  knowledge_version: string;
  sources: AssistantSource[];
  actions: Array<{ label: string; path: string }>;
  suggestions: string[];
}

export interface AssistantSource { kind: "INTERNAL" | "WEB"; title: string; url?: string; path?: string }
export type RoleGuideRole = Role | "PUBLIC";
export interface RoleGuideAction {
  label: string;
  path: string;
  description: string;
  roles: RoleGuideRole[];
  requires_login: boolean;
}
export interface RoleGuideResponse {
  role: RoleGuideRole;
  path: string;
  sections: Array<{ title: string; description: string; actions: RoleGuideAction[] }>;
  locked_actions: RoleGuideAction[];
  tips: string[];
  knowledge_version: string;
}
export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";
export interface DonationAnalytics {
  period: AnalyticsPeriod; granularity: "day" | "month"; as_of: string;
  totals: { donation_amount: number; donation_count: number; unique_donors: number; campaign_count: number; average_amount: number; verified_fund_usage: number; transparent_balance: number };
  timeline: Array<{ bucket: string; donation_amount: number; donation_count: number }>;
  top_campaigns: Array<{ campaign_id: string; campaign_title: string; donation_amount: number; donation_count: number }>;
}
export interface CampaignAnalytics {
  period: AnalyticsPeriod; as_of: string;
  totals: { campaign_count: number; active_count: number; closed_count: number; pending_count: number; goal_amount: number; raised_amount: number };
  category_distribution: Array<{ category: string; campaign_count: number; raised_amount: number }>;
  campaign_progress: Array<{ id: string; title: string; category: string; goal_amount: number; raised_amount: number; status: CampaignStatus; progress_percent: number }>;
}
export interface UserAnalytics { as_of: string; totals: { donor_count: number; verified_organization_count: number } }

export interface AssistantRequest {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  page: { path: string; role: Role | null };
}

export interface OnchainAnchorVerification {
  onchain_verified: boolean;
  network: string | null;
  tx_hash: string | null;
  expected_root: string | null;
  onchain_root: string | null;
  confirmations: number;
  explorer_url: string | null;
  reason: "VERIFIED" | "ROOT_MISMATCH" | "NOT_ON_CHAIN" | "TX_NOT_FOUND" | "TX_PENDING" | null;
}

export interface AnchorOnchainResponse {
  anchor_id: string;
  network: string;
  status: string;
  from_position: number;
  to_position: number;
  onchain: OnchainAnchorVerification;
}

export interface MerkleProofExport {
  schema: "charityconnect-merkle-proof-v1";
  algorithm: "SHA-256";
  ledger_position: number;
  leaf_hash: string;
  leaf_index: number | null;
  merkle_proof: Array<{ direction: "LEFT" | "RIGHT"; hash: string }>;
  merkle_root: string | null;
  proof_valid: boolean;
  anchor: Record<string, unknown> | null;
  verify_instructions: string;
}

export interface TrustChainHealth {
  total_anchors: number;
  onchain_anchors: number;
  simulated_anchors: number;
  unanchored_entries: number;
  statuses: Record<string, number>;
  chain_valid: boolean;
  latest_anchor: Record<string, unknown> | null;
  issues: string[];
  recommendation: string;
}
