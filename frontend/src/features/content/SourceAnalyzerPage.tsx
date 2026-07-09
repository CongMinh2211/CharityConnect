import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, Loader2, ScanSearch, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { analyzeSource } from "../../lib/api";
import type { SourceAnalysis, SourceVerdict } from "../../types";
import { ScoreBreakdown } from "./TransparencyScore";

const VERDICT: Record<SourceVerdict, { label: string; tone: string; icon: typeof ShieldCheck }> = {
  TRUSTED: { label: "Đáng tin", tone: "bg-brand-100 text-brand-800 border-brand-300", icon: ShieldCheck },
  CAUTION: { label: "Cần thận trọng", tone: "bg-amber-100 text-amber-800 border-amber-300", icon: ShieldAlert },
  HIGH_RISK: { label: "Rủi ro cao", tone: "bg-rose-100 text-rose-800 border-rose-300", icon: AlertTriangle }
};
const SEVERITY: Record<string, string> = {
  HIGH: "bg-rose-50 text-rose-700 border-rose-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-slate-50 text-slate-600 border-slate-200"
};

export function SourceAnalyzerPage(): JSX.Element {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [bankType, setBankType] = useState<"" | "personal" | "organization">("");
  const [hasFinancial, setHasFinancial] = useState(false);
  const [hasLegal, setHasLegal] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);

  const analysis = useMutation<SourceAnalysis>({
    mutationFn: () => analyzeSource({ url: url.trim(), text: text.trim(), bank_account_type: bankType, has_financial_report: hasFinancial, has_legal_identity: hasLegal, has_media: hasMedia })
  });

  const result = analysis.data;

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="max-w-3xl">
        <p className="eyebrow"><ScanSearch size={16} /> Công cụ kiểm tra</p>
        <h1 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-4xl">Kiểm tra lời kêu gọi trước khi chuyển tiền</h1>
        <p className="mt-3 text-slate-600">Dán link kêu gọi và nội dung tin nhắn. Hệ thống chấm điểm minh bạch theo whitelist nguồn và quét các dấu hiệu lừa đảo phổ biến — không phải chatbot, cho kết quả tức thì.</p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <form className="card p-6 sm:p-7" onSubmit={(event) => { event.preventDefault(); analysis.mutate(); }}>
          <label className="label">Link kêu gọi / trang nguồn
            <div className="relative mt-2">
              <Link2 className="absolute left-3 top-3.5 text-slate-400" size={18} />
              <input className="input pl-10" placeholder="https://... (fanpage, bài viết, website)" value={url} onChange={(event) => setUrl(event.target.value)} />
            </div>
          </label>
          <label className="label mt-5 block">Nội dung lời kêu gọi / tin nhắn
            <textarea className="input mt-2 min-h-32" placeholder="Dán nội dung kêu gọi quyên góp, số tài khoản, hướng dẫn chuyển tiền..." value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <label className="label mt-5 block">Tài khoản nhận tiền
            <select className="input mt-2" value={bankType} onChange={(event) => setBankType(event.target.value as typeof bankType)}>
              <option value="">Không rõ</option>
              <option value="organization">Đứng tên tổ chức</option>
              <option value="personal">Tài khoản cá nhân</option>
            </select>
          </label>
          <fieldset className="mt-5 space-y-2.5">
            <legend className="label">Bằng chứng đi kèm</legend>
            <Check label="Có sao kê / báo cáo tài chính công khai" checked={hasFinancial} onChange={setHasFinancial} />
            <Check label="Có pháp nhân / giấy phép / đại diện rõ ràng" checked={hasLegal} onChange={setHasLegal} />
            <Check label="Có hình ảnh / video hiện trường xác thực" checked={hasMedia} onChange={setHasMedia} />
          </fieldset>
          <button type="submit" className="btn-primary mt-6 w-full" disabled={analysis.isPending || (!url.trim() && !text.trim())}>
            {analysis.isPending ? <><Loader2 className="animate-spin" size={18} /> Đang phân tích...</> : <><ScanSearch size={18} /> Phân tích ngay</>}
          </button>
          {analysis.isError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">Không thể phân tích lúc này. Vui lòng thử lại.</p>}
          <p className="mt-3 text-xs text-slate-400">Không gửi thông tin cá nhân, số thẻ hay mật khẩu vào ô này.</p>
        </form>

        <div>
          {!result && !analysis.isPending && (
            <div className="card grid min-h-72 place-items-center p-8 text-center text-slate-500">
              <div><ScanSearch className="mx-auto text-slate-300" size={48} /><p className="mt-4 font-semibold">Nhập thông tin và bấm “Phân tích ngay” để xem kết quả.</p></div>
            </div>
          )}
          {result && <AnalysisResult result={result} />}
        </div>
      </div>
    </div>
  );
}

function AnalysisResult({ result }: { result: SourceAnalysis }): JSX.Element {
  const verdict = VERDICT[result.verdict];
  const Icon = verdict.icon;
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-4 rounded-3xl border p-5 ${verdict.tone}`}>
        <Icon size={40} className="shrink-0" />
        <div>
          <p className="text-xs font-black uppercase tracking-[.14em]">Kết luận</p>
          <p className="text-2xl font-black">{verdict.label}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-4xl font-black tracking-[-.05em]">{result.score.total}<span className="text-lg text-slate-500">/100</span></p>
          <p className="text-xs font-bold">Hạng {result.score.grade}{result.source_name ? ` · ${result.source_name}` : ""}</p>
        </div>
      </div>

      <div className="card p-5">
        <p className="flex items-center gap-2 font-black"><CheckCircle2 size={18} className="text-brand-700" /> Khuyến nghị</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{result.recommendation}</p>
      </div>

      <div className="card p-5">
        <p className="font-black">Dấu hiệu phát hiện ({result.signals.length})</p>
        <div className="mt-3 space-y-2">
          {result.signals.length === 0 && <p className="text-sm text-slate-500">Không phát hiện dấu hiệu rủi ro rõ ràng.</p>}
          {result.signals.map((signal) => (
            <div key={signal.code + signal.message} className={`rounded-2xl border px-4 py-2.5 text-sm ${SEVERITY[signal.severity] ?? SEVERITY.LOW}`}>
              <span className="font-black">{signal.severity === "HIGH" ? "Cao" : signal.severity === "MEDIUM" ? "Trung bình" : "Thấp"}</span> · {signal.message}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <p className="font-black">Chi tiết chấm điểm minh bạch</p>
        <div className="mt-3"><ScoreBreakdown score={result.score} variant="light" /></div>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
      <input type="checkbox" className="h-5 w-5 rounded border-ink/20 text-brand-600 focus:ring-brand-500" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
