import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Eye, FileCheck2, ListChecks, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CampaignForm } from "../components/CampaignForm";
import { ImpactReportManager } from "../components/ImpactReportManager";
import { OrganizationApplicationForm } from "../components/OrganizationApplicationForm";
import { StatusBadge } from "../components/StatusBadge";
import { FinancialPlanManager } from "../features/organization/FinancialPlanManager";
import { api, formatVnd } from "../lib/api";
import type { Campaign } from "../types";

interface OrganizationProfile {
  legal_name: string;
  registration_number: string;
  description: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  rejection_reason?: string | null;
}

type Tab = "overview" | "campaigns" | "finance" | "reports";

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Tổng quan", icon: BarChart3 },
  { id: "campaigns", label: "Chiến dịch", icon: ListChecks },
  { id: "finance", label: "Ngân sách & mốc", icon: WalletCards },
  { id: "reports", label: "Báo cáo quỹ", icon: FileCheck2 }
];

export function OrganizationPage(): JSX.Element {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const active = (params.get("tab") as Tab) || "overview";
  const profile = useQuery({ queryKey: ["organization-profile"], queryFn: () => api<OrganizationProfile | null>("/organizations/me") });
  const campaigns = useQuery({ queryKey: ["organization-campaigns"], queryFn: () => api<Campaign[]>("/organization/campaigns"), enabled: profile.data?.status === "VERIFIED" });
  const action = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "submit" | "close" }) => api(`/organization/campaigns/${id}/${type}`, { method: "POST" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["organization-campaigns"] })
  });
  const deleteCampaign = useMutation({
    mutationFn: (id: string) => api(`/organization/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["organization-campaigns"] })
  });

  if (profile.isLoading) return <div className="container-page py-12"><div className="skeleton h-96" /></div>;

  if (!profile.data || profile.data.status !== "VERIFIED") {
    return (
      <div className="container-page py-10">
        <h1 className="text-3xl font-black">Xác minh tổ chức</h1>
        <div className="mt-6 max-w-2xl">
          {profile.data && (
            <div className="card mb-5 p-5">
              <div className="flex justify-between gap-3"><strong>{profile.data.legal_name}</strong><StatusBadge status={profile.data.status} /></div>
              {profile.data.rejection_reason && <p className="mt-3 text-sm text-rose-700">{profile.data.rejection_reason}</p>}
            </div>
          )}
          <OrganizationApplicationForm />
        </div>
      </div>
    );
  }

  const list = campaigns.data ?? [];
  const raised = list.reduce((sum, item) => sum + item.raised_amount, 0);
  const activeCount = list.filter((item) => item.status === "APPROVED").length;
  const needPlan = list.filter((item) => ["DRAFT", "REJECTED"].includes(item.status));
  const firstApproved = list.find((item) => item.status === "APPROVED");

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Không gian tổ chức</p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">{profile.data.legal_name}</h1>
          <p className="mt-2 text-sm text-slate-500">Mã đăng ký: {profile.data.registration_number}</p>
        </div>
        <StatusBadge status={profile.data.status} />
      </div>

      <nav className="mt-7 flex gap-2 overflow-x-auto pb-2" aria-label="Chức năng tổ chức">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button className={active === id ? "filter-pill filter-pill-active flex items-center gap-2" : "filter-pill flex items-center gap-2"} onClick={() => setParams(id === "overview" ? {} : { tab: id })} key={id}>
            <Icon size={15} />{label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {active === "overview" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="Tổng chiến dịch" value={String(list.length)} />
              <Metric label="Đang gây quỹ" value={String(activeCount)} />
              <Metric label="Đã tiếp nhận" value={formatVnd(raised)} />
            </div>

            <div className="card mt-6 p-6">
              <h2 className="text-xl font-black">Luồng dữ liệu tổ chức</h2>
              <p className="mt-2 text-sm text-slate-600">Các nút dưới đây liên kết cùng một dữ liệu chiến dịch qua từng bước quản lý.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <FlowLink step="01" title="Chiến dịch" text={`${list.length} chiến dịch`} to="/to-chuc?tab=campaigns" />
                <FlowLink step="02" title="Ngân sách & mốc" text={`${needPlan.length} cần hoàn thiện`} to="/to-chuc?tab=finance" />
                <FlowLink step="03" title="Báo cáo quỹ" text="Nộp bằng chứng sử dụng tiền" to="/to-chuc?tab=reports" />
                <FlowLink step="04" title="Công khai" text="Timeline, escrow, ledger" to={firstApproved ? `/chien-dich/${firstApproved.id}` : "/"} />
              </div>
            </div>

            <div className="card mt-6 p-6">
              <h2 className="text-xl font-black">Việc cần làm</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {needPlan.map((item) => (
                  <button className="rounded-2xl border border-ink/10 bg-sage-100 p-4 text-left transition hover:border-brand-500" key={item.id} onClick={() => setParams({ tab: "finance" })}>
                    <strong>Hoàn thiện ngân sách</strong>
                    <span className="mt-1 block text-sm text-slate-600">{item.title}</span>
                  </button>
                ))}
                {!needPlan.length && <p className="text-sm text-slate-500">Không có công việc tồn đọng. Có thể theo dõi báo cáo hoặc mở chi tiết chiến dịch công khai.</p>}
              </div>
            </div>
          </>
        )}

        {active === "campaigns" && (
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <CampaignForm campaign={editingCampaign} onDone={() => setEditingCampaign(null)} />
            <div className="card overflow-hidden">
              <div className="p-5"><h2 className="text-xl font-black">Chiến dịch của tôi</h2></div>
              <div className="divide-y divide-slate-200">
                {list.map((campaign) => (
                  <article className="p-5" key={campaign.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="font-bold">{campaign.title}</h3>
                          <StatusBadge status={campaign.status} />
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{formatVnd(campaign.raised_amount)} / {formatVnd(campaign.goal_amount)}</p>
                        {campaign.rejection_reason && <p className="mt-2 text-sm text-rose-700">{campaign.rejection_reason}</p>}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link className="rounded-full bg-sage-100 px-3 py-1.5 text-xs font-black text-ink" to={`/chien-dich/${campaign.id}`}><Eye className="mr-1 inline" size={13} />Chi tiết công khai</Link>
                          <button className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-black text-brand-800" onClick={() => setParams({ tab: "finance" })}>Ngân sách & mốc</button>
                          <button className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700" onClick={() => setParams({ tab: "reports" })}>Báo cáo quỹ</button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {["DRAFT", "REJECTED"].includes(campaign.status) && <button className="btn-secondary !min-h-10 !px-3" onClick={() => setEditingCampaign(campaign)}>Sửa</button>}
                        {["DRAFT", "REJECTED"].includes(campaign.status) && <button className="rounded-xl bg-rose-50 px-3 text-sm font-black text-rose-700 hover:bg-rose-100" onClick={() => { if (window.confirm("Xóa mềm bản nháp này?")) deleteCampaign.mutate(campaign.id); }}>Xóa</button>}
                        {["DRAFT", "REJECTED"].includes(campaign.status) && <button className="btn-primary !min-h-10 !px-3" onClick={() => action.mutate({ id: campaign.id, type: "submit" })}>Nộp duyệt</button>}
                        {campaign.status === "APPROVED" && <button className="btn-secondary !min-h-10 !px-3" onClick={() => action.mutate({ id: campaign.id, type: "close" })}>Đóng</button>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === "finance" && <FinancialPlanManager campaigns={list} />}
        {active === "reports" && <ImpactReportManager campaigns={list} />}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <article className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </article>
  );
}

function FlowLink({ step, title, text, to }: { step: string; title: string; text: string; to: string }): JSX.Element {
  return (
    <Link to={to} className="rounded-2xl border border-ink/10 bg-sage-100 p-4 transition hover:-translate-y-0.5 hover:border-brand-500">
      <span className="font-mono text-xs font-black text-brand-700">{step}</span>
      <strong className="mt-4 block">{title}</strong>
      <span className="mt-1 block text-xs leading-5 text-slate-600">{text}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-ink">Mở <ArrowRight size={13} /></span>
    </Link>
  );
}
