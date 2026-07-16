import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, Circle, Clock, Inbox, Link2, Lock, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, formatVnd } from "../lib/api";
import type { ReconciliationJourney, ReconciliationStep } from "../types";

const stepIcons: Record<ReconciliationStep["key"], typeof Inbox> = {
  RECEIVED: Inbox,
  CAMPAIGN_CREDITED: Building2,
  FUNDS_LOCKED: Lock,
  TRUSTCHAIN: Link2,
};

function statusBadge(journey: ReconciliationJourney): { label: string; className: string } {
  if (journey.status === "REJECTED") return { label: "Đã từ chối", className: "bg-rose-100 text-rose-800" };
  if (journey.reconciled) return { label: "Đã đối soát đầy đủ", className: "bg-brand-100 text-brand-900" };
  if (journey.status === "PENDING_REVIEW") return { label: "Đang chờ duyệt", className: "bg-amber-100 text-amber-800" };
  return { label: "Đang xử lý", className: "bg-amber-100 text-amber-800" };
}

export function ReconciliationPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const receipt = params.get("receipt")?.trim() ?? "";
  const [input, setInput] = useState(receipt);
  useEffect(() => setInput(receipt), [receipt]);

  const journey = useQuery({
    queryKey: ["reconciliation", receipt],
    queryFn: () => api<ReconciliationJourney>(`/transparency/reconciliation/${encodeURIComponent(receipt)}`),
    enabled: Boolean(receipt),
    retry: false,
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = input.trim();
    setParams(next ? { receipt: next } : {});
  }

  const notFound = journey.error instanceof ApiError && journey.error.status === 404;
  const badge = journey.data ? statusBadge(journey.data) : null;

  return (
    <div className="pb-16">
      <section className="border-b border-ink/10 bg-ink py-10 text-white sm:py-12">
        <div className="container-page">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand-500">Đối soát công khai</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-[-.035em] sm:text-5xl">Theo dấu từng đồng qua bốn bước có thể kiểm chứng.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
            Nhập mã biên nhận để xem hành trình: <b className="text-white/90">đã nhận → đã cộng chiến dịch → đã khóa quỹ → đã ghi TrustChain</b>. Mỗi bước do một dịch vụ độc lập ghi nhận và đối chiếu chéo.
          </p>
          <form className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row" onSubmit={submit}>
            <div className="relative flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="h-12 w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-3 text-white placeholder:text-white/45 focus:border-brand-400 focus:outline-none"
                placeholder="Ví dụ: CC-2026-000129"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                aria-label="Mã biên nhận"
              />
            </div>
            <button className="btn-primary h-12 shrink-0" type="submit">Đối soát</button>
          </form>
        </div>
      </section>

      <div className="container-page py-8 sm:py-10">
        {!receipt && (
          <div className="card p-6 text-sm text-slate-600 sm:p-8">
            Nhập mã biên nhận ở trên để bắt đầu. Bạn có thể tìm mã trong lịch sử quyên góp, biên nhận PDF hoặc trang <Link className="font-bold text-brand-800" to="/minh-bach">Minh bạch</Link>.
          </div>
        )}
        {journey.isLoading && <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><RefreshCw className="animate-spin" size={17} /> Đang đối soát…</div>}
        {notFound && <div className="card border-amber-200 bg-amber-50 p-5 font-semibold text-amber-800">Không tìm thấy biên nhận “{receipt}”. Vui lòng kiểm tra lại mã.</div>}
        {journey.isError && !notFound && <div className="card border-rose-200 p-5 text-rose-700">Không thể đối soát lúc này. Vui lòng thử lại.</div>}

        {journey.data && badge && (
          <>
            <article className="card overflow-hidden">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 p-5 sm:p-7">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-slate-500">{journey.data.receipt_number}</p>
                  <h2 className="mt-1 truncate text-2xl font-black text-ink">{journey.data.campaign_title}</h2>
                  <p className="mt-1 text-sm text-slate-500">Ngày ghi nhận {new Date(journey.data.created_at).toLocaleString("vi-VN")}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${badge.className}`}>{badge.label}</span>
                  <p className="mt-2 text-2xl font-black text-brand-700">{formatVnd(journey.data.amount)}</p>
                </div>
              </header>

              <ol className="p-5 sm:p-8">
                {journey.data.steps.map((step, index) => {
                  const Icon = stepIcons[step.key];
                  const last = index === journey.data!.steps.length - 1;
                  return (
                    <li key={step.key} className="relative flex gap-4 pb-8 last:pb-0">
                      {!last && <span className={`absolute left-[22px] top-12 h-[calc(100%-2.5rem)] w-0.5 ${step.done ? "bg-brand-500" : "bg-slate-200"}`} aria-hidden />}
                      <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${step.done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                        <Icon size={20} />
                        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white">
                          {step.done ? <CheckCircle2 size={18} className="text-brand-600" /> : <Circle size={16} className="text-slate-300" />}
                        </span>
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`font-black ${step.done ? "text-ink" : "text-slate-400"}`}>{step.label}</p>
                          <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{step.service}</span>
                        </div>
                        <p className={`mt-1 text-sm ${step.done ? "text-slate-600" : "text-slate-400"}`}>{step.detail}</p>
                        {step.at && <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Clock size={12} />{new Date(step.at).toLocaleString("vi-VN")}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </article>

            <div className={`mt-4 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${journey.data.reconciled ? "border-brand-200 bg-brand-50 text-brand-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <ShieldCheck size={18} />
              {journey.data.reconciled
                ? "Bốn bước khớp nhau — dòng tiền đã được đối soát và ghi bất biến trên TrustChain."
                : "Hành trình chưa hoàn tất — một số bước đang chờ xử lý hoặc xác minh."}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="btn-secondary" to={`/xac-minh-bien-nhan?receipt=${encodeURIComponent(journey.data.receipt_number)}`}><ShieldCheck size={16} /> Xác minh Merkle proof</Link>
              <Link className="btn-secondary" to={`/minh-bach`}><Link2 size={16} /> Xem sổ cái công khai</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
