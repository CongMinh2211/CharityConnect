import type { TransparencyScore } from "../../types";

// Thành phần dùng chung cho thanh điểm minh bạch — gom code trùng lặp từ
// ContentArticlePage / RealProjectDetailPage / SourceAnalyzerPage về một nơi.
// variant "dark" cho nền ink (chữ trắng), "light" cho nền sáng.

type Variant = "dark" | "light";

export function ScoreBar({ label, value, max, variant = "dark" }: { label: string; value: number; max: number; variant?: Variant }): JSX.Element {
  const track = variant === "dark" ? "bg-white/15" : "bg-slate-100";
  const labelColor = variant === "dark" ? "text-white/70" : "text-slate-500";
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className={`mb-1 flex justify-between text-xs font-bold ${labelColor}`}>
        <span>{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${track}`}>
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const BREAKDOWN: Array<{ label: string; key: keyof Pick<TransparencyScore, "source_authority" | "financial_evidence" | "legal_identity" | "media_evidence" | "freshness">; max: number }> = [
  { label: "Nguồn chính thống", key: "source_authority", max: 30 },
  { label: "Tài chính/sao kê", key: "financial_evidence", max: 25 },
  { label: "Pháp lý/đại diện", key: "legal_identity", max: 20 },
  { label: "Ảnh/video", key: "media_evidence", max: 15 },
  { label: "Độ mới", key: "freshness", max: 10 },
];

export function ScoreBreakdown({ score, variant = "dark" }: { score: TransparencyScore; variant?: Variant }): JSX.Element {
  return (
    <div className="space-y-3">
      {BREAKDOWN.map((row) => <ScoreBar key={row.key} label={row.label} value={score[row.key]} max={row.max} variant={variant} />)}
    </div>
  );
}
