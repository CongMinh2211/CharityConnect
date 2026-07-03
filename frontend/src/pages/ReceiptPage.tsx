import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MailCheck, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { api, formatVnd } from "../lib/api";
import type { Donation, PublicReceiptProof } from "../types";

export function ReceiptPage(): JSX.Element {
  const { id = "" } = useParams();
  const receipt = useQuery({ queryKey: ["receipt", id], queryFn: () => api<Donation & { donor_name: string; issued_at: string }>(`/donations/${id}/receipt`) });
  const publicProof = useQuery({ queryKey: ["public-receipt-proof", receipt.data?.receipt_number], queryFn: () => api<PublicReceiptProof>(`/transparency/receipts/${encodeURIComponent(receipt.data!.receipt_number)}`), enabled: Boolean(receipt.data?.receipt_number), retry: false });
  if (!receipt.data) return <div className="container-page py-12">Đang tải biên nhận…</div>;
  const verifyUrl = `${window.location.origin}/xac-minh-bien-nhan?receipt=${encodeURIComponent(receipt.data.receipt_number)}`;
  return <div className="container-page max-w-3xl py-10">
    <div className="mb-5 flex gap-3 rounded-2xl border border-brand-700/20 bg-brand-100 p-4 text-sm font-semibold text-ink print:hidden"><MailCheck className="shrink-0" size={20} /> Email cảm ơn cùng liên kết xác minh đã được xếp gửi đến địa chỉ đăng ký của bạn.</div>
    <article className="card overflow-hidden print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-5 bg-gradient-to-r from-brand-800 to-trust-700 p-8 text-white"><div><p className="font-bold">CharityConnect</p><h1 className="mt-2 text-3xl font-black">Biên nhận quyên góp</h1><p className="mt-2 text-sm text-white/75">{publicProof.data?.verification_status === "CONFIRMED" ? "Hash-chain và Merkle anchor đã được xác nhận" : publicProof.data?.verification_status === "INVALID" ? "Bằng chứng đang có lỗi toàn vẹn" : "Đã ghi hash-chain · đang chờ Merkle anchor"}</p></div><div className="rounded-2xl bg-white p-3"><QRCodeSVG value={verifyUrl} size={112} level="M" /></div></div>
      <dl className="grid gap-5 p-8 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Mã biên nhận</dt><dd className="mt-1 font-mono font-bold">{receipt.data.receipt_number}</dd></div><div><dt className="text-sm text-slate-500">Trạng thái</dt><dd className="mt-1 flex flex-wrap items-center gap-2"><StatusBadge status={receipt.data.status} />{receipt.data.proof_status === "CONFIRMED" && <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-800"><CheckCircle2 size={15} />LEDGER CONFIRMED</span>}{publicProof.data && <span className={`rounded-full px-2 py-1 text-[10px] font-black ${publicProof.data.verification_status === "CONFIRMED" ? "bg-brand-100 text-brand-900" : publicProof.data.verification_status === "INVALID" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{publicProof.data.verification_status}</span>}</dd></div><div className="sm:col-span-2"><dt className="text-sm text-slate-500">Chiến dịch</dt><dd className="mt-1 text-lg font-bold">{receipt.data.campaign_title}</dd></div><div><dt className="text-sm text-slate-500">Số tiền</dt><dd className="mt-1 text-2xl font-black text-brand-700">{formatVnd(receipt.data.amount)}</dd></div><div><dt className="text-sm text-slate-500">Thời gian</dt><dd className="mt-1 font-semibold">{new Date(receipt.data.created_at).toLocaleString("vi-VN")}</dd></div>{receipt.data.ledger_hash && <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Ledger hash · vị trí #{receipt.data.ledger_position}</dt><dd className="mt-2 break-all rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">{receipt.data.ledger_hash}</dd></div>}</dl>
    </article>
    <div className="mt-6 flex flex-wrap gap-3 print:hidden"><Link className="btn-secondary" to="/lich-su">Xem lịch sử quyên góp</Link><Link className="btn-secondary" to={`/xac-minh-bien-nhan?receipt=${encodeURIComponent(receipt.data.receipt_number)}`}>Xác minh công khai</Link><button className="btn-primary" onClick={() => window.print()}><Printer size={17} />In biên nhận</button></div>
  </div>;
}
