import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, ExternalLink, FileCheck2, Gauge, Landmark, ListChecks, Mail, ShieldCheck, UserRoundCheck, Users, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { api, formatVnd } from "../lib/api";
import type { AccountUser, AuditLogEntry, Campaign, ImpactReport, LedgerAnchor, RiskAssessment, Role, UserStatus } from "../types";

interface OrganizationReview {
  user_id: string;
  legal_name: string;
  registration_number: string;
  email: string;
  status: string;
  description: string;
}

type Tab = "queue" | "organizations" | "users" | "risk" | "audit" | "trustchain";

const tabs: Array<{ id: Tab; label: string; icon: typeof ShieldCheck }> = [
  { id: "queue", label: "Hàng đợi", icon: ShieldCheck },
  { id: "organizations", label: "Tổ chức", icon: Building2 },
  { id: "users", label: "Tài khoản", icon: Users },
  { id: "risk", label: "Risk Score", icon: Gauge },
  { id: "audit", label: "Audit Log", icon: ListChecks },
  { id: "trustchain", label: "TrustChain", icon: Landmark }
];

export function AdminPage(): JSX.Element {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selectedOrganization, setSelectedOrganization] = useState<OrganizationReview | null>(null);
  const tab = (params.get("tab") as Tab) || "queue";

  const organizations = useQuery({ queryKey: ["admin-organizations"], queryFn: () => api<OrganizationReview[]>("/admin/organizations?status=PENDING") });
  const allOrganizations = useQuery({ queryKey: ["admin-all-organizations"], queryFn: () => api<OrganizationReview[]>("/admin/organizations"), enabled: tab === "organizations" });
  const campaigns = useQuery({ queryKey: ["admin-campaigns"], queryFn: () => api<Campaign[]>("/admin/campaigns?status=PENDING_REVIEW") });
  const reports = useQuery({ queryKey: ["admin-impact-reports"], queryFn: () => api<ImpactReport[]>("/admin/impact-reports?status=PENDING_REVIEW") });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AccountUser[]>("/admin/users"), enabled: tab === "users" });
  const risks = useQuery({ queryKey: ["admin-risks"], queryFn: () => api<RiskAssessment[]>("/admin/campaign-risks") });
  const identityAudit = useQuery({ queryKey: ["admin-audit", "identity"], queryFn: () => api<AuditLogEntry[]>("/admin/audit-logs/identity"), enabled: tab === "audit" });
  const campaignAudit = useQuery({ queryKey: ["admin-audit", "campaign"], queryFn: () => api<AuditLogEntry[]>("/admin/audit-logs/campaign"), enabled: tab === "audit" });
  const anchors = useQuery({ queryKey: ["public-anchors"], queryFn: () => api<{ items: LedgerAnchor[] }>("/transparency/anchors?limit=20"), enabled: tab === "trustchain" });

  const anchor = useMutation({ mutationFn: () => api<LedgerAnchor>("/admin/transparency/anchors", { method: "POST" }), onSuccess: () => void client.invalidateQueries({ queryKey: ["public-anchors"] }) });
  const organizationAction = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: "VERIFIED" | "REJECTED"; reason?: string }) => api(`/admin/organizations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin-organizations"] }); void client.invalidateQueries({ queryKey: ["admin-all-organizations"] }); }
  });
  const campaignAction = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: "APPROVED" | "REJECTED"; reason?: string }) => api(`/admin/campaigns/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-campaigns"] })
  });
  const reportAction = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: "VERIFIED" | "REJECTED"; reason?: string }) => api(`/admin/impact-reports/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-impact-reports"] })
  });
  const userStatusAction = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) => api(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-users"] })
  });

  function rejection(label: string): string | undefined {
    return window.prompt(`Lý do từ chối ${label}`)?.trim() || undefined;
  }

  const queueCount = (organizations.data?.length ?? 0) + (campaigns.data?.length ?? 0) + (reports.data?.length ?? 0);
  const highRisk = (risks.data ?? []).filter((item) => item.level === "HIGH").length;

  return (
    <div className="container-page py-8 sm:py-12">
      <p className="eyebrow">Quản trị hệ thống</p>
      <h1 className="mt-4 text-3xl font-black sm:text-4xl">Trung tâm kiểm soát</h1>
      <p className="mt-3 max-w-3xl text-slate-600">Các dữ liệu quản trị được nối cùng một luồng: kiểm duyệt → rủi ro → audit log → TrustChain.</p>

      <nav className="mt-7 grid grid-cols-2 gap-2 sm:flex sm:overflow-x-auto sm:pb-2" aria-label="Chức năng quản trị">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? "filter-pill filter-pill-active flex min-h-11 items-center justify-center gap-2 sm:justify-start" : "filter-pill flex min-h-11 items-center justify-center gap-2 sm:justify-start"} onClick={() => setParams(id === "queue" ? {} : { tab: id })}>
            <Icon size={15} />{label}
          </button>
        ))}
      </nav>

      <div className="card mt-4 p-5">
        <h2 className="text-lg font-black">Bản đồ dữ liệu quản trị</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <AdminFlowLink step="01" title="Hàng đợi" text={`${queueCount} mục cần xử lý`} to="/quan-tri" />
          <AdminFlowLink step="02" title="Risk Score" text={`${highRisk} chiến dịch rủi ro cao`} to="/quan-tri?tab=risk" />
          <AdminFlowLink step="03" title="Audit Log" text="Dấu vết Identity + Campaign" to="/quan-tri?tab=audit" />
          <AdminFlowLink step="04" title="TrustChain" text="Neo ledger và Merkle proof" to="/quan-tri?tab=trustchain" />
        </div>
      </div>

      <div className="mt-6">
        {tab === "queue" && (
          <div className="grid gap-8 xl:grid-cols-2">
            <Queue title="Tổ chức chờ xác minh" count={organizations.data?.length ?? 0}>
              {organizations.data?.map((item) => (
                <ReviewCard
                  key={item.user_id}
                  title={item.legal_name}
                  subtitle={`${item.registration_number} · ${item.email}`}
                  description={item.description}
                  status={item.status}
                  relatedText="Hồ sơ tổ chức nằm ở Identity Service; duyệt xong tổ chức mới được nộp chiến dịch."
                  detailLabel="Xem chi tiết"
                  onDetail={() => setSelectedOrganization(item)}
                  onApprove={() => organizationAction.mutate({ id: item.user_id, status: "VERIFIED" })}
                  onReject={() => { const reason = rejection("tổ chức"); if (reason) organizationAction.mutate({ id: item.user_id, status: "REJECTED", reason }); }}
                />
              ))}
            </Queue>

            <Queue title="Chiến dịch chờ duyệt" count={campaigns.data?.length ?? 0}>
              {campaigns.data?.map((item) => (
                <ReviewCard
                  key={item.id}
                  title={item.title}
                  subtitle={`${item.organization_name} · ${formatVnd(item.goal_amount)}`}
                  description={item.summary}
                  status={item.status}
                  href={`/chien-dich/${item.id}`}
                  relatedText="Duyệt chiến dịch sẽ mở quyên góp, cập nhật cache công khai và sinh audit log."
                  onApprove={() => campaignAction.mutate({ id: item.id, status: "APPROVED" })}
                  onReject={() => { const reason = rejection("chiến dịch"); if (reason) campaignAction.mutate({ id: item.id, status: "REJECTED", reason }); }}
                />
              ))}
            </Queue>

            <section className="xl:col-span-2">
              <Queue title="Báo cáo tác động" count={reports.data?.length ?? 0}>
                {reports.data?.map((item) => (
                  <ReviewCard
                    key={item.id}
                    title={item.title}
                    subtitle={`${item.campaign_title} · ${formatVnd(item.amount_used)} · ${item.evidence.length} bằng chứng`}
                    description={item.description}
                    status={item.status}
                    href={`/chien-dich/${item.campaign_id}`}
                    relatedText="Duyệt báo cáo sẽ cập nhật ngân sách thực tế, escrow, timeline và ledger FUND_USAGE_VERIFIED."
                    onApprove={() => reportAction.mutate({ id: item.id, status: "VERIFIED" })}
                    onReject={() => { const reason = rejection("báo cáo"); if (reason) reportAction.mutate({ id: item.id, status: "REJECTED", reason }); }}
                  />
                ))}
              </Queue>
            </section>
          </div>
        )}

        {tab === "organizations" && <OrganizationsTable items={allOrganizations.data ?? []} loading={allOrganizations.isLoading} onDetail={setSelectedOrganization} />}
        {tab === "users" && <UsersTable items={users.data ?? []} loading={users.isLoading} busy={userStatusAction.isPending} onStatus={(id, status) => userStatusAction.mutate({ id, status })} />}
        {tab === "risk" && <RiskTable items={risks.data ?? []} loading={risks.isLoading} />}
        {tab === "audit" && <AuditTable items={[...(identityAudit.data ?? []), ...(campaignAudit.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))} loading={identityAudit.isLoading || campaignAudit.isLoading} />}
        {tab === "trustchain" && <TrustChainPanel anchors={anchors.data?.items ?? []} loading={anchors.isLoading} onCreate={() => anchor.mutate()} creating={anchor.isPending} />}
      </div>
      <OrganizationDetailModal
        item={selectedOrganization}
        busy={organizationAction.isPending}
        onClose={() => setSelectedOrganization(null)}
        onApprove={(id) => organizationAction.mutate({ id, status: "VERIFIED" }, { onSuccess: () => setSelectedOrganization(null) })}
        onReject={(id) => {
          const reason = rejection("tổ chức");
          if (reason) organizationAction.mutate({ id, status: "REJECTED", reason }, { onSuccess: () => setSelectedOrganization(null) });
        }}
      />
    </div>
  );
}

function Queue({ title, count, children }: { title: string; count: number; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-black"><FileCheck2 className="text-brand-700" />{title}</h2>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold">{count}</span>
      </div>
      <div className="space-y-4">{children}{count === 0 && <div className="card p-6 text-sm text-slate-500">Hàng đợi đang trống.</div>}</div>
    </section>
  );
}

function ReviewCard({ title, subtitle, description, status, relatedText, href, detailLabel, onDetail, onApprove, onReject }: { title: string; subtitle: string; description: string; status: string; relatedText: string; href?: string; detailLabel?: string; onDetail?: () => void; onApprove: () => void; onReject: () => void }): JSX.Element {
  return (
    <article className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-lg font-black leading-tight">{title}</h3>
        <StatusBadge status={status} />
      </div>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
      <p className="mt-3 text-sm leading-6 text-slate-700">{description}</p>
      <p className="mt-3 rounded-xl bg-sage-100 p-3 text-xs font-semibold leading-5 text-slate-700">{relatedText}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn-primary !min-h-10 !px-3" onClick={onApprove}>Duyệt</button>
        <button className="btn-secondary !min-h-10 !px-3" onClick={onReject}>Từ chối</button>
        {onDetail && <button className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-ink/10 px-3 text-sm font-black hover:bg-sage-100" onClick={onDetail}>{detailLabel ?? "Xem chi tiết"} <ExternalLink size={14} /></button>}
        {href && <Link className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-ink/10 px-3 text-sm font-black hover:bg-sage-100" to={href}>Dữ liệu liên quan <ExternalLink size={14} /></Link>}
      </div>
    </article>
  );
}

function OrganizationDetailModal({ item, busy, onClose, onApprove, onReject }: { item: OrganizationReview | null; busy: boolean; onClose: () => void; onApprove: (id: string) => void; onReject: (id: string) => void }): JSX.Element | null {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-ink/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Chi tiết tổ chức ${item.legal_name}`} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:max-w-3xl sm:rounded-[2rem]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Hồ sơ xác minh tổ chức</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-ink">{item.legal_name}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.registration_number}</p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-ink/10 hover:bg-sage-100" aria-label="Đóng chi tiết tổ chức" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_.82fr] sm:p-6">
          <div className="space-y-4">
            <InfoBlock icon={<UserRoundCheck size={19} />} title="Thông tin đăng ký">
              <dl className="grid gap-3 text-sm">
                <div><dt className="font-black text-slate-500">Tên pháp lý</dt><dd className="mt-1 text-ink">{item.legal_name}</dd></div>
                <div><dt className="font-black text-slate-500">Mã đăng ký</dt><dd className="mt-1 font-mono text-ink">{item.registration_number}</dd></div>
                <div><dt className="font-black text-slate-500">Trạng thái</dt><dd className="mt-1"><StatusBadge status={item.status} /></dd></div>
              </dl>
            </InfoBlock>

            <InfoBlock icon={<Mail size={19} />} title="Liên hệ & mô tả">
              <p className="break-all text-sm font-bold text-brand-700">{item.email}</p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{item.description || "Tổ chức chưa nhập mô tả chi tiết."}</p>
            </InfoBlock>
          </div>

          <aside className="rounded-[1.5rem] bg-sage-100 p-5">
            <p className="font-black">Checklist trước khi duyệt</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li>• Đối chiếu tên pháp lý và mã đăng ký.</li>
              <li>• Kiểm tra email/liên hệ có khớp hồ sơ tổ chức.</li>
              <li>• Mô tả hoạt động phải rõ đối tượng thụ hưởng và phạm vi hỗ trợ.</li>
              <li>• Duyệt xong tổ chức mới được nộp chiến dịch gây quỹ.</li>
            </ul>
            {item.status === "PENDING" ? (
              <div className="mt-6 grid gap-2">
                <button className="btn-primary w-full" disabled={busy} onClick={() => onApprove(item.user_id)}>Duyệt tổ chức</button>
                <button className="btn-secondary w-full" disabled={busy} onClick={() => onReject(item.user_id)}>Từ chối có lý do</button>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-white p-4 text-sm">
                <p className="font-black text-slate-600">Tổ chức đã được xử lý</p>
                <p className="mt-1 flex items-center gap-2">Trạng thái hiện tại: <StatusBadge status={item.status} /></p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function InfoBlock({ icon, title, children }: { icon: JSX.Element; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-[1.5rem] border border-ink/10 p-5">
      <h3 className="flex items-center gap-2 font-black text-ink"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OrganizationsTable({ items, loading, onDetail }: { items: OrganizationReview[]; loading: boolean; onDetail: (item: OrganizationReview) => void }): JSX.Element {
  const counts = items.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black">Tổ chức trên hệ thống</h2>
          <p className="mt-2 text-sm text-slate-500">Xem chi tiết mọi tổ chức — kể cả tổ chức đã xác minh — không chỉ hàng đợi chờ duyệt.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-brand-700">Đã xác minh: {counts.VERIFIED ?? 0}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Chờ duyệt: {counts.PENDING ?? 0}</span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Từ chối: {counts.REJECTED ?? 0}</span>
        </div>
      </div>
      {loading ? <div className="skeleton m-5 h-64" /> : (
        <div className="divide-y divide-ink/10">
          {items.map((item) => (
            <div key={item.user_id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-base">{item.legal_name}</strong>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{item.registration_number}</p>
                <p className="mt-1 truncate text-sm text-slate-600">{item.email}</p>
              </div>
              <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl border border-ink/10 px-4 text-sm font-black hover:bg-sage-100" onClick={() => onDetail(item)}>
                Xem chi tiết <ArrowRight size={15} />
              </button>
            </div>
          ))}
          {items.length === 0 && <div className="p-5 text-slate-500">Chưa có tổ chức nào.</div>}
        </div>
      )}
    </section>
  );
}

function UsersTable({ items, loading, busy, onStatus }: { items: AccountUser[]; loading: boolean; busy: boolean; onStatus: (id: string, status: UserStatus) => void }): JSX.Element {
  const roleLabel: Record<Role, string> = { DONOR: "Người quyên góp", ORGANIZATION: "Tổ chức", ADMIN: "Quản trị" };
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-ink/10 p-5">
        <h2 className="text-xl font-black">Quản lý tài khoản</h2>
        <p className="mt-2 text-sm text-slate-500">Admin chỉ được khóa/mở tài khoản và xem trạng thái; không được xem hoặc đổi mật khẩu người dùng.</p>
      </div>
      {loading ? <div className="skeleton m-5 h-64" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50"><tr><th className="p-4">Người dùng</th><th className="p-4">Vai trò</th><th className="p-4">Trạng thái</th><th className="p-4">Ngày tạo</th><th className="p-4">Thao tác</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-t border-ink/10" key={item.id}>
                  <td className="p-4"><strong>{item.name}</strong><span className="block text-xs text-slate-500">{item.email}</span></td>
                  <td className="p-4">{roleLabel[item.role]}</td>
                  <td className="p-4"><StatusBadge status={item.status ?? "ACTIVE"} /></td>
                  <td className="p-4">{item.created_at ? new Date(item.created_at).toLocaleDateString("vi-VN") : "—"}</td>
                  <td className="p-4">
                    {item.status === "DISABLED"
                      ? <button className="btn-primary !min-h-10 !px-3" disabled={busy} onClick={() => onStatus(item.id, "ACTIVE")}>Mở khóa</button>
                      : <button className="btn-secondary !min-h-10 !px-3" disabled={busy || item.role === "ADMIN"} onClick={() => onStatus(item.id, "DISABLED")}>Khóa</button>}
                    {item.role === "ADMIN" && <span className="ml-2 text-xs text-slate-400">Không thể khóa tài khoản quản trị</span>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td className="p-5 text-slate-500" colSpan={5}>Chưa có tài khoản.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RiskTable({ items, loading }: { items: RiskAssessment[]; loading: boolean }): JSX.Element {
  return (
    <section className="card overflow-hidden">
      {loading ? <div className="skeleton m-5 h-64" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50"><tr><th className="p-4">Ưu tiên</th><th className="p-4">Chiến dịch</th><th className="p-4">Điểm</th><th className="p-4">Mức</th><th className="p-4">Nguyên nhân</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-t border-ink/10 align-top" key={item.campaign_id}>
                  <td className="p-4 font-black">#{item.priority_rank}</td>
                  <td className="p-4">
                    <Link className="font-black text-ink hover:text-brand-700" to={`/chien-dich/${item.campaign_id}`}>{item.campaign_title}</Link>
                    <span className="block text-xs text-slate-500">{item.organization_name}</span>
                  </td>
                  <td className="p-4 text-xl font-black">{item.score}</td>
                  <td className="p-4"><StatusBadge status={item.level} /></td>
                  <td className="p-4"><ul className="space-y-1">{item.signals.map((signal) => <li key={signal.code}><b>+{signal.points}</b> {signal.explanation}</li>)}{!item.signals.length && <li className="text-slate-500">Không có tín hiệu rủi ro.</li>}</ul></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuditTable({ items, loading }: { items: AuditLogEntry[]; loading: boolean }): JSX.Element {
  return (
    <section className="card overflow-hidden">
      {loading ? <div className="skeleton m-5 h-64" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50"><tr><th className="p-4">Thời gian</th><th className="p-4">Dịch vụ</th><th className="p-4">Hành động</th><th className="p-4">Đối tượng</th><th className="p-4">Liên kết</th></tr></thead>
            <tbody>
              {items.map((item) => {
                const campaignLink = item.entity_type === "CAMPAIGN" ? `/chien-dich/${item.entity_id}` : null;
                return (
                  <tr className="border-t border-ink/10" key={`${item.service}-${item.id}`}>
                    <td className="p-4">{new Date(item.created_at).toLocaleString("vi-VN")}</td>
                    <td className="p-4"><StatusBadge status={item.service} /></td>
                    <td className="p-4 font-bold">{item.action}</td>
                    <td className="p-4 font-mono text-xs">{item.entity_type} / {item.entity_id}</td>
                    <td className="p-4">{campaignLink ? <Link className="font-bold text-brand-700" to={campaignLink}>Mở chiến dịch</Link> : <span className="text-xs text-slate-400">Theo dõi trong tab liên quan</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrustChainPanel({ anchors, loading, creating, onCreate }: { anchors: LedgerAnchor[]; loading: boolean; creating: boolean; onCreate: () => void }): JSX.Element {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="text-xl font-black">Điểm neo Merkle</h2>
          <p className="mt-1 text-sm text-slate-500">Neo tối đa 100 ledger entry chưa được xử lý.</p>
        </div>
        <button className="btn-primary" disabled={creating} onClick={onCreate}><Landmark size={18} /> Tạo điểm neo</button>
      </div>
      {loading ? <div className="skeleton m-5 h-56" /> : (
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {anchors.map((item) => (
            <article className="rounded-2xl border border-ink/10 p-4" key={item.id ?? item.anchor_id}>
              <div className="flex justify-between gap-3"><strong>Ledger #{item.from_position}–#{item.to_position}</strong><StatusBadge status={item.status} /></div>
              <p className="mt-3 break-all font-mono text-[10px] text-slate-500">{item.merkle_root}</p>
              <p className="mt-2 text-xs text-slate-500">{item.network} · {new Date(item.anchored_at).toLocaleString("vi-VN")}</p>
            </article>
          ))}
          {anchors.length === 0 && <p className="text-sm text-slate-500">Chưa có điểm neo.</p>}
        </div>
      )}
      <div className="border-t border-ink/10 p-5"><Link className="font-bold text-brand-700" to="/minh-bach">Mở sổ cái công khai →</Link></div>
    </section>
  );
}

function AdminFlowLink({ step, title, text, to }: { step: string; title: string; text: string; to: string }): JSX.Element {
  return (
    <Link className="rounded-2xl border border-ink/10 bg-sage-100 p-4 transition hover:-translate-y-0.5 hover:border-brand-500" to={to}>
      <span className="font-mono text-xs font-black text-brand-700">{step}</span>
      <strong className="mt-3 block">{title}</strong>
      <span className="mt-1 block text-xs leading-5 text-slate-600">{text}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-ink">Mở <ArrowRight size={13} /></span>
    </Link>
  );
}
