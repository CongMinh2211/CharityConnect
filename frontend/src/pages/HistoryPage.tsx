import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Landmark, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { api, downloadApi, formatVnd } from "../lib/api";
import type { Donation } from "../types";

export function HistoryPage(): JSX.Element {
  const history = useQuery({ queryKey: ["donation-history"], queryFn: () => api<Donation[]>("/donations/history") });
  const years = useMemo(() => Array.from(new Set([new Date().getFullYear(), ...(history.data ?? []).map((item) => new Date(item.created_at).getFullYear())])).sort((a, b) => b - a), [history.data]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const visible = history.data?.filter((item) => new Date(item.created_at).getFullYear() === year) ?? [];
  const total = visible.reduce((sum, item) => sum + item.amount, 0);

  async function downloadStatement(): Promise<void> {
    setDownloading(true);
    setError("");
    try {
      const blob = await downloadApi(`/donations/me/annual-statement?year=${year}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `charityconnect-${year}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tạo PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow"><ReceiptText size={16} /> Hồ sơ cá nhân</p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">Lịch sử quyên góp</h1>
          <p className="mt-2 text-slate-600">Mỗi giao dịch nối đủ: chiến dịch → biên nhận → xác minh công khai → TrustChain.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="history-year">Năm báo cáo</label>
          <select id="history-year" className="input sm:w-32" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="btn-primary" disabled={downloading} onClick={() => void downloadStatement()}>
            <Download size={18} /> {downloading ? "Đang tạo…" : "Tải PDF năm"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label={`Tổng đóng góp ${year}`} value={formatVnd(total)} />
        <SummaryCard label="Số lượt" value={String(visible.length)} />
        <SummaryCard label="Trạng thái xác minh" value={visible.every((item) => (item.proof_status ?? item.status) === "CONFIRMED") ? "Đã xác minh" : "Đang xử lý"} />
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-4">Chiến dịch</th>
              <th className="p-4">Số tiền</th>
              <th className="p-4">Trạng thái</th>
              <th className="p-4">Dữ liệu liên kết</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr className="border-t border-slate-200 align-top" key={item.id}>
                <td className="p-4">
                  <Link className="font-bold text-ink hover:text-brand-700" to={`/chien-dich/${item.campaign_id}`}>{item.campaign_title}</Link>
                  <span className="block text-xs text-slate-500">{new Date(item.created_at).toLocaleString("vi-VN")}</span>
                </td>
                <td className="p-4 font-black">{formatVnd(item.amount)}</td>
                <td className="p-4"><StatusBadge status={item.proof_status ?? item.status} /></td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <Link className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-black text-brand-800" to={`/bien-nhan/${item.id}`}>Biên nhận {item.receipt_number}</Link>
                    <Link className="rounded-full bg-sage-100 px-3 py-1.5 text-xs font-black text-ink" to={`/xac-minh-bien-nhan?receipt=${encodeURIComponent(item.receipt_number)}`}>Xác minh công khai</Link>
                    <Link className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700" to="/minh-bach"><Landmark size={13} /> Sổ cái</Link>
                    <Link className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200" to={`/chien-dich/${item.campaign_id}`}>Chi tiết <ExternalLink size={12} /></Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history.isLoading && visible.length === 0 && <p className="p-8 text-center text-slate-600">Không có giao dịch trong năm {year}.</p>}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <article className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </article>
  );
}
