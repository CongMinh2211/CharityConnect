import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Search, ShieldQuestion } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import type { ReportCategory, ReportLookup, ReportReceipt, ReportStatus } from "../types";

export const reportCategories: Array<{ value: ReportCategory; label: string }> = [
  { value: "FRAUD", label: "Lừa đảo / giả mạo" },
  { value: "MISUSE", label: "Sử dụng sai mục đích" },
  { value: "FAKE_INFO", label: "Thông tin sai sự thật" },
  { value: "DUPLICATE", label: "Trùng lặp / sao chép" },
  { value: "OTHER", label: "Khác" },
];
export const categoryLabel = (value: string): string => reportCategories.find((item) => item.value === value)?.label ?? value;

export const reportStatusView: Record<ReportStatus, { label: string; className: string }> = {
  RECEIVED: { label: "Đã tiếp nhận", className: "bg-amber-100 text-amber-800" },
  REVIEWING: { label: "Đang xem xét", className: "bg-sky-100 text-sky-800" },
  RESOLVED: { label: "Đã xử lý", className: "bg-brand-100 text-brand-900" },
  DISMISSED: { label: "Đã bỏ qua", className: "bg-slate-200 text-slate-700" },
};

export function ReportPage(): JSX.Element {
  const [params] = useSearchParams();
  const campaignId = params.get("campaign") ?? "";
  const campaignTitle = params.get("title") ?? "";

  const [category, setCategory] = useState<ReportCategory>("FRAUD");
  const [detail, setDetail] = useState("");
  const [email, setEmail] = useState("");
  const submit = useMutation({
    mutationFn: () => api<ReportReceipt>(`/campaigns/${encodeURIComponent(campaignId)}/reports`, { method: "POST", body: JSON.stringify({ category, detail, reporter_email: email || undefined }) }),
  });

  const [code, setCode] = useState(params.get("code") ?? "");
  const lookup = useMutation({ mutationFn: (value: string) => api<ReportLookup>(`/reports/${encodeURIComponent(value)}`) });
  function doLookup(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); if (code.trim()) lookup.mutate(code.trim()); }
  const lookupNotFound = lookup.error instanceof ApiError && lookup.error.status === 404;

  return (
    <div className="pb-16">
      <section className="border-b border-ink/10 bg-ink py-10 text-white sm:py-12">
        <div className="container-page">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand-500">Báo cáo &amp; tra cứu</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-[-.035em] sm:text-4xl">Báo cáo chiến dịch đáng ngờ — minh bạch từ tiếp nhận đến xử lý.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Mỗi báo cáo nhận một <b className="text-white/90">mã tiếp nhận</b> để bạn tra cứu tiến độ và <b className="text-white/90">kết quả xử lý công khai</b>.</p>
        </div>
      </section>

      <div className="container-page grid gap-6 py-8 sm:py-10 lg:grid-cols-2">
        <section className="card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-black text-ink"><AlertTriangle size={20} className="text-amber-600" />Gửi báo cáo</h2>
          {!campaignId ? (
            <p className="mt-4 rounded-xl bg-sage-100 p-4 text-sm text-slate-600">Để báo cáo một chiến dịch, hãy mở trang chiến dịch đó và bấm <b>“Báo cáo chiến dịch”</b>. Trang này sẽ mở kèm chiến dịch cần báo cáo.</p>
          ) : submit.data ? (
            <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-5">
              <p className="flex items-center gap-2 font-black text-brand-800"><CheckCircle2 size={18} />Đã tiếp nhận báo cáo</p>
              <p className="mt-2 text-sm text-slate-600">Vui lòng lưu mã tiếp nhận để tra cứu kết quả xử lý:</p>
              <p className="mt-2 select-all rounded-xl bg-white px-4 py-3 text-center font-mono text-lg font-black tracking-wider text-ink">{submit.data.reference_code}</p>
              <button className="btn-secondary mt-4" onClick={() => { setCode(submit.data!.reference_code); lookup.mutate(submit.data!.reference_code); }}>Tra cứu ngay</button>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}>
              {campaignTitle && <p className="rounded-xl bg-sage-100 p-3 text-sm font-semibold text-slate-700">Chiến dịch: {campaignTitle}</p>}
              <label className="block"><span className="label">Loại vấn đề</span>
                <select className="input" value={category} onChange={(event) => setCategory(event.target.value as ReportCategory)}>
                  {reportCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block"><span className="label">Mô tả chi tiết</span>
                <textarea className="input min-h-28" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Nêu rõ dấu hiệu đáng ngờ, bằng chứng, đường dẫn liên quan…" required />
                {detail.trim().length > 0 && detail.trim().length < 10 && <span className="mt-1 block text-sm font-semibold text-amber-700">Mô tả cần ít nhất 10 ký tự.</span>}
              </label>
              <label className="block"><span className="label">Email nhận cập nhật (không bắt buộc)</span>
                <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.vn" />
              </label>
              {submit.isError && <p className="text-sm font-semibold text-rose-700">{submit.error.message}</p>}
              <button className="btn-primary w-full" disabled={submit.isPending || detail.trim().length < 10}>{submit.isPending ? "Đang gửi…" : "Gửi báo cáo"}</button>
            </form>
          )}
        </section>

        <section className="card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-black text-ink"><ClipboardCheck size={20} className="text-brand-700" />Tra cứu kết quả</h2>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={doLookup}>
            <div className="relative flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input !pl-10" placeholder="Mã tiếp nhận, ví dụ BC-2026-A1B2C3D4" value={code} onChange={(event) => setCode(event.target.value)} aria-label="Mã tiếp nhận" />
            </div>
            <button className="btn-secondary shrink-0" type="submit">Tra cứu</button>
          </form>

          {lookup.isPending && <p className="mt-4 text-sm font-semibold text-slate-500">Đang tra cứu…</p>}
          {lookupNotFound && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Không tìm thấy báo cáo với mã này.</p>}
          {lookup.isError && !lookupNotFound && <p className="mt-4 text-sm font-semibold text-rose-700">Không tra cứu được lúc này.</p>}
          {lookup.data && (
            <article className="mt-5 rounded-2xl border border-ink/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-sm font-bold text-slate-500">{lookup.data.reference_code}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${reportStatusView[lookup.data.status].className}`}>{reportStatusView[lookup.data.status].label}</span>
              </div>
              <p className="mt-3 font-black text-ink">{lookup.data.campaign_title}</p>
              <p className="mt-1 text-sm text-slate-500">Loại: {categoryLabel(lookup.data.category)} · Gửi lúc {new Date(lookup.data.created_at).toLocaleString("vi-VN")}</p>
              <div className="mt-4 rounded-xl bg-sage-100/60 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-ink"><ShieldQuestion size={16} className="text-brand-700" />Kết quả xử lý công khai</p>
                <p className="mt-1 text-sm text-slate-600">{lookup.data.resolution ?? "Báo cáo đang được xử lý. Kết quả sẽ được công bố tại đây."}</p>
                {lookup.data.reviewed_at && <p className="mt-2 text-xs text-slate-400">Xử lý lúc {new Date(lookup.data.reviewed_at).toLocaleString("vi-VN")}</p>}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
