import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarCheck, CalendarClock, FileText, Hash, RefreshCw, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import type { OrganizationVerification, OrgStatusEvent } from "../types";

const actionLabels: Record<string, string> = {
  ORGANIZATION_SUBMITTED: "Nộp hồ sơ xác minh",
  ORGANIZATION_VERIFIED: "Được phê duyệt xác minh",
  ORGANIZATION_REJECTED: "Bị từ chối",
};

function statusView(status: OrganizationVerification["status"]): { label: string; className: string; icon: JSX.Element } {
  if (status === "VERIFIED") return { label: "Đã xác minh", className: "bg-brand-100 text-brand-900", icon: <ShieldCheck size={18} /> };
  if (status === "REJECTED") return { label: "Bị từ chối", className: "bg-rose-100 text-rose-800", icon: <ShieldX size={18} /> };
  return { label: "Đang chờ duyệt", className: "bg-amber-100 text-amber-800", icon: <ShieldAlert size={18} /> };
}

function daysBetween(target: string): number {
  return Math.ceil((new Date(target).getTime() - Date.now()) / 86_400_000);
}

function InfoCard({ icon, label, value, hint }: { icon: JSX.Element; label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-sage-100 text-brand-700">{icon}</span>
        <p className="text-sm font-bold">{label}</p>
      </div>
      <p className="mt-2 break-words font-black text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function OrganizationVerificationPage(): JSX.Element {
  const { id = "" } = useParams();
  const dossier = useQuery({
    queryKey: ["org-verification", id],
    queryFn: () => api<OrganizationVerification>(`/organizations/${encodeURIComponent(id)}/verification`),
    retry: false,
  });

  if (dossier.isLoading) return <div className="container-page py-12 text-sm font-semibold text-slate-500"><RefreshCw className="mr-2 inline animate-spin" size={16} />Đang tải hồ sơ…</div>;
  if (dossier.error instanceof ApiError && dossier.error.status === 404) {
    return <div className="container-page py-12"><div className="card border-amber-200 bg-amber-50 p-5 font-semibold text-amber-800">Không tìm thấy hồ sơ tổ chức.</div></div>;
  }
  if (dossier.isError || !dossier.data) return <div className="container-page py-12"><div className="card border-rose-200 p-5 text-rose-700">Không thể tải hồ sơ lúc này.</div></div>;

  const org = dossier.data;
  const view = statusView(org.status);
  const remaining = org.expires_at ? daysBetween(org.expires_at) : null;
  const validityHint = remaining === null ? undefined : remaining > 0 ? `Còn ${remaining.toLocaleString("vi-VN")} ngày hiệu lực` : "Đã hết hạn — cần tái xác minh";

  return (
    <div className="pb-16">
      <section className="border-b border-ink/10 bg-ink py-10 text-white sm:py-12">
        <div className="container-page">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand-500">Hồ sơ xác minh tổ chức</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">{org.legal_name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{org.description || "Tổ chức gây quỹ trên CharityConnect."}</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${view.className}`}>{view.icon}{view.label}</span>
          </div>
        </div>
      </section>

      <div className="container-page py-8 sm:py-10">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard icon={<Hash size={16} />} label="Mã số đăng ký" value={org.registration_number} />
          <InfoCard icon={<CalendarCheck size={16} />} label="Ngày duyệt" value={org.verified_at ? new Date(org.verified_at).toLocaleDateString("vi-VN") : "—"} hint={org.verified_at ? undefined : "Chưa được xác minh"} />
          <InfoCard icon={<CalendarClock size={16} />} label="Thời hạn hiệu lực" value={org.expires_at ? new Date(org.expires_at).toLocaleDateString("vi-VN") : "—"} hint={validityHint} />
          <InfoCard icon={<FileText size={16} />} label="Tài liệu pháp lý" value={org.has_document ? "Đã nộp hồ sơ" : "Chưa có"} hint={org.has_document ? "Lưu trữ nội bộ, đối chiếu khi cần" : undefined} />
        </section>

        {remaining !== null && remaining <= 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"><ShieldAlert size={18} />Chứng nhận xác minh đã hết hạn — tổ chức cần nộp lại hồ sơ để gia hạn.</div>
        )}

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-black text-ink"><BadgeCheck size={20} className="text-brand-700" />Lịch sử thay đổi</h2>
          <ol className="card mt-4 p-5 sm:p-7">
            {org.history.length === 0 && <li className="text-sm text-slate-500">Chưa có sự kiện nào.</li>}
            {org.history.map((event: OrgStatusEvent, index) => {
              const verified = event.action === "ORGANIZATION_VERIFIED";
              const rejected = event.action === "ORGANIZATION_REJECTED";
              const last = index === org.history.length - 1;
              return (
                <li key={`${event.action}-${event.at}`} className="relative flex gap-4 pb-6 last:pb-0">
                  {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-slate-200" aria-hidden />}
                  <span className={`relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${verified ? "bg-brand-600 text-white" : rejected ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-600"}`}>
                    {verified ? <ShieldCheck size={16} /> : rejected ? <ShieldX size={16} /> : <FileText size={15} />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-ink">{actionLabels[event.action] ?? event.action}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{new Date(event.at).toLocaleString("vi-VN")}</p>
                    {event.reason && <p className="mt-1 text-sm text-rose-700">Lý do: {event.reason}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="mt-6">
          <Link className="btn-secondary" to="/chien-dich">Xem các chiến dịch đang gây quỹ</Link>
        </div>
      </div>
    </div>
  );
}
