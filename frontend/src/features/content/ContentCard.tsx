import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { ContentArticle } from "../../types";

export function gradeClass(grade: ContentArticle["score"]["grade"]): string {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  if (grade === "C") return "bg-amber-100 text-amber-800";
  if (grade === "D") return "bg-orange-100 text-orange-800";
  return "bg-rose-100 text-rose-800";
}

export function typeLabel(type: ContentArticle["type"]): string {
  return {
    ORGANIZATION: "Nguồn tổ chức",
    TRANSPARENCY: "Minh bạch",
    ALERT: "Cảnh báo",
    DATA: "Số liệu",
    VIDEO: "Video",
    REAL_PROJECT: "Dự án thật",
    REAL_STATISTIC: "Số liệu thật",
    SCAM_ALERT: "Cảnh báo lừa đảo",
    FINANCIAL_REPORT: "Báo cáo tài chính",
  }[type];
}

export function warningLabelText(label: NonNullable<ContentArticle["warning_label"]>): string {
  return {
    OFFICIAL_ACTION: "Đã có cơ quan xử lý",
    OFFICIAL_WARNING: "Cơ quan chức năng cảnh báo",
    PRESS_WARNING: "Báo chí chính thống cảnh báo",
    CHECK_SIGNALS: "Dấu hiệu cần kiểm tra",
    UNVERIFIED: "Chưa đủ căn cứ",
  }[label];
}

export function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

export function ContentCard({ article, compact = false }: { article: ContentArticle; compact?: boolean }): JSX.Element {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white shadow-sm transition hover:-translate-y-1 hover:border-brand-500 hover:shadow-card">
      <div className="relative">
        <img src={article.image_url} alt="" className={`w-full object-cover ${compact ? "h-40" : "h-52"}`} loading="lazy" />
        <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-black ${gradeClass(article.score.grade)}`}>
          {article.score.grade === "X" ? "Cảnh báo X" : `${article.score.total}/100 · Hạng ${article.score.grade}`}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-sage-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-brand-700">{typeLabel(article.type)}</span>
          {article.badges.slice(0, compact ? 1 : 3).map((badge) => (
            <span key={badge} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{badge}</span>
          ))}
        </div>
        <h3 className="line-clamp-2 text-xl font-black leading-tight tracking-[-.02em] text-ink">{article.title}</h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{article.excerpt}</p>
        <div className="mt-5 flex items-center gap-2 text-xs font-bold text-slate-500">
          <ShieldCheck size={16} className="text-brand-700" />
          <span>{article.source.name} · Cấp {article.source.level}</span>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
          <Link to={`/bai-viet/${article.slug}`} className="btn-primary !min-h-10 !px-4 text-sm">
            Chi tiết <ArrowRight size={16} />
          </Link>
          <a className="btn-secondary !min-h-10 !px-4 text-sm" href={article.source_url} target="_blank" rel="noreferrer">
            Nguồn gốc <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </article>
  );
}
