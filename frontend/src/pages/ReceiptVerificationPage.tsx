import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, QrCode, Search, ShieldCheck, Upload } from "lucide-react";
import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, exportMerkleProof, formatVnd, verifyAnchorOnchain } from "../lib/api";
import type { PublicReceiptProof } from "../types";

const statusCopy = {
  CONFIRMED: { title: "Biên nhận đã được xác nhận", detail: "Hash-chain, Merkle Proof và điểm neo đều hợp lệ.", tone: "bg-brand-50 text-brand-950" },
  UNANCHORED: { title: "Biên nhận hợp lệ, đang chờ điểm neo", detail: "Bản ghi còn nguyên vẹn nhưng chưa nằm trong một Merkle anchor.", tone: "bg-amber-50 text-amber-950" },
  INVALID: { title: "Bằng chứng không hợp lệ", detail: "Có ít nhất một bước kiểm tra không khớp. Không nên tin dữ liệu này.", tone: "bg-rose-50 text-rose-950" },
} as const;

export function ReceiptVerificationPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get("receipt") ?? "");
  const receiptNumber = params.get("receipt") ?? "";
  const proof = useQuery({
    queryKey: ["public-receipt-proof", receiptNumber],
    queryFn: () => api<PublicReceiptProof>(`/transparency/receipts/${encodeURIComponent(receiptNumber)}`),
    enabled: Boolean(receiptNumber), retry: false,
  });

  function submit(event: FormEvent): void { event.preventDefault(); if (value.trim()) setParams({ receipt: value.trim() }); }
  async function scanImage(file?: File): Promise<void> {
    if (!file) return;
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!Detector) { window.alert("Trình duyệt chưa hỗ trợ đọc QR từ ảnh. Bạn vẫn có thể nhập mã biên nhận."); return; }
    const results = await new Detector({ formats: ["qr_code"] }).detect(await createImageBitmap(file));
    const raw = results[0]?.rawValue;
    if (!raw) { window.alert("Không đọc được mã QR trong ảnh."); return; }
    const parsed = new URL(raw, window.location.origin).searchParams.get("receipt") ?? raw;
    setValue(parsed); setParams({ receipt: parsed });
  }

  const result = proof.data; const copy = result ? statusCopy[result.verification_status] : null;
  const anchorId = result?.anchor?.anchor_id ?? result?.anchor?.id;
  const onchain = useQuery({
    queryKey: ["anchor-onchain", anchorId],
    queryFn: () => verifyAnchorOnchain(anchorId!),
    enabled: Boolean(anchorId && result?.anchor?.network === "SEPOLIA"),
    retry: false,
  });
  const onchainStep = (() => {
    if (!result?.anchor) return { ok: false, pending: true, detail: "Chưa có điểm neo để đối chiếu" };
    if (result.anchor.network !== "SEPOLIA") return { ok: true, pending: true, detail: "Anchor nội bộ — chưa công bố lên Sepolia" };
    if (onchain.isLoading) return { ok: false, pending: true, detail: "Đang đọc giao dịch từ Sepolia…" };
    if (onchain.data?.onchain.onchain_verified) return { ok: true, pending: false, detail: `Root khớp on-chain · ${onchain.data.onchain.confirmations} xác nhận` };
    return { ok: false, pending: onchain.data?.onchain.reason === "TX_PENDING", detail: onchain.data?.onchain.reason ?? "Không đối chiếu được on-chain" };
  })();
  return <div className="container-page max-w-4xl py-10 lg:py-14">
    <header className="text-center"><QrCode className="mx-auto text-brand-700" size={42} /><p className="eyebrow mx-auto mt-5 w-fit">TrustChain</p><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Xác minh biên nhận</h1><p className="mx-auto mt-3 max-w-2xl text-slate-600">Đối chiếu công khai mà không tiết lộ email, số điện thoại hay mã người quyên góp.</p></header>
    <form className="card mx-auto mt-8 flex max-w-2xl flex-col gap-3 p-4 sm:flex-row" onSubmit={submit}><label className="sr-only" htmlFor="receipt-number">Mã biên nhận</label><input id="receipt-number" className="input flex-1" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ví dụ CC-2026-000128" /><button className="btn-primary" type="submit"><Search size={17} />Kiểm tra</button><label className="btn-secondary cursor-pointer"><Upload size={17} />Ảnh QR<input className="sr-only" type="file" accept="image/*" onChange={(event) => void scanImage(event.target.files?.[0])} /></label></form>
    {proof.isLoading && <div className="skeleton mx-auto mt-6 h-72 max-w-3xl" />}
    {result && copy && <article className="card mt-6 overflow-hidden"><div className={`flex items-start gap-3 p-6 ${copy.tone}`}>{result.verification_status === "INVALID" ? <AlertTriangle size={31} /> : <ShieldCheck size={31} />}<div><p className="font-black">{copy.title}</p><p className="mt-1 text-sm">{copy.detail}</p></div></div>
      <dl className="grid gap-5 border-b border-slate-200 p-6 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Mã biên nhận</dt><dd className="font-mono font-bold">{result.receipt_number}</dd></div><div><dt className="text-sm text-slate-500">Số tiền</dt><dd className="font-black text-brand-700">{formatVnd(result.amount)}</dd></div><div className="sm:col-span-2"><dt className="text-sm text-slate-500">Chiến dịch</dt><dd className="font-bold">{result.campaign_title}</dd></div></dl>
      <div className="grid gap-3 p-6 md:grid-cols-4"><VerificationStep ok={result.proof_status === "CONFIRMED"} index="01" title="Ledger integrity" detail={`Bản ghi #${result.ledger_position} trong hash-chain`} /><VerificationStep ok={result.merkle_proof_valid} pending={!result.merkle_root} index="02" title="Merkle Proof" detail={result.merkle_root ? `${result.merkle_proof.length} node bằng chứng` : "Chưa được gom vào Merkle tree"} /><VerificationStep ok={Boolean(result.anchor && ["SIMULATED", "CONFIRMED"].includes(result.anchor.status))} pending={!result.anchor} index="03" title="Blockchain anchor" detail={result.anchor ? `${anchorNetworkLabel(result.anchor.network)} · ${anchorStatusLabel(result.anchor.status)}` : "Đang chờ quản trị viên tạo điểm neo"} /><VerificationStep ok={onchainStep.ok} pending={onchainStep.pending} index="04" title="Đối chiếu on-chain" detail={onchainStep.detail} /></div>
      <div className="space-y-4 bg-slate-950 p-6 text-slate-200"><HashLine label="Ledger hash" value={result.ledger_hash} /><HashLine label="Merkle root" value={result.merkle_root ?? "Chưa có"} /><ProofExportButton position={result.ledger_position} sepolia={result.anchor?.network === "SEPOLIA"} />{result.anchor && <><HashLine label="Transaction" value={result.anchor.anchor_tx_hash} /><p className="text-xs text-slate-400">Phạm vi #{result.anchor.from_position}–#{result.anchor.to_position}{result.anchor.block_number ? ` · Block ${result.anchor.block_number}` : ""}</p>{result.anchor.explorer_url && <a className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 hover:text-emerald-200" href={result.anchor.explorer_url} target="_blank" rel="noreferrer">Mở trên explorer <ExternalLink size={15} /></a>}</>}</div>
    </article>}
    {proof.isError && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center font-semibold text-rose-800">Không tìm thấy biên nhận hợp lệ trên sổ cái.</div>}
  </div>;
}

function VerificationStep({ ok, pending, index, title, detail }: { ok: boolean; pending?: boolean; index: string; title: string; detail: string }): JSX.Element {
  const tone = pending ? "border-amber-200 bg-amber-50" : ok ? "border-brand-200 bg-brand-50" : "border-rose-200 bg-rose-50";
  return <div className={`rounded-2xl border p-4 ${tone}`}><div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-slate-500">{index}</span>{ok ? <CheckCircle2 className="text-brand-700" size={20} /> : <AlertTriangle className={pending ? "text-amber-600" : "text-rose-600"} size={20} />}</div><p className="mt-4 font-black">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p></div>;
}

function anchorNetworkLabel(network: string): string {
  return network === "LOCAL_SIMULATION" ? "Anchor nội bộ" : network;
}

function anchorStatusLabel(status: string): string {
  return status === "SIMULATED" ? "Đã xác nhận nội bộ" : status;
}
function ProofExportButton({ position, sepolia }: { position: number; sepolia?: boolean }): JSX.Element {
  const [busy, setBusy] = useState(false);
  async function download(): Promise<void> {
    setBusy(true);
    try {
      const bundle = await exportMerkleProof(position);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `charityconnect-proof-${position}.json`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch {
      window.alert("Chưa xuất được proof lúc này. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button type="button" onClick={() => void download()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50">
        <Download size={15} />{busy ? "Đang xuất…" : "Xuất proof JSON"}
      </button>
      {sepolia && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-300">✓ Đã neo trên Ethereum Sepolia</span>}
    </div>
  );
}

function HashLine({ label, value }: { label: string; value: string }): JSX.Element { return <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-all font-mono text-xs text-emerald-300">{value}</p></div>; }
