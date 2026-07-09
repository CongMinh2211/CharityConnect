import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { ContentMetric, RealProject } from "../../types";
import { gradeClass } from "./ContentCard";
import { ScoreBreakdown } from "./TransparencyScore";

export function RealProjectDetailPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const projects = useQuery({ queryKey: ["content-projects"], queryFn: () => api<RealProject[]>("/content/projects") });

  if (projects.isLoading) return <div className="container-page py-12"><div className="skeleton h-[560px]" /></div>;
  const project = projects.data?.find((item) => item.slug === slug);
  if (projects.isError || !project) {
    return (
      <div className="container-page py-12">
        <div className="card p-6 text-rose-700">Không tìm thấy dự án này.</div>
        <Link to="/kiem-chung?type=REAL_PROJECT" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-brand-700"><ArrowLeft size={17} /> Quay lại danh sách</Link>
      </div>
    );
  }

  return (
    <article className="container-page py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-brand-700"><ArrowLeft size={17} /> Quay lại kiểm chứng</Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0">
          <div className="overflow-hidden rounded-[2rem] border border-ink/10 bg-white shadow-card">
            <div className="relative h-[300px] sm:h-[380px]">
              <img src={project.image_url} alt={project.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 text-white">
                <span className="inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-ink">{project.category}</span>
                <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-.04em] sm:text-4xl">{project.name}</h1>
                <p className="mt-2 text-sm font-bold text-brand-300">{project.organization}</p>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-lg leading-8 text-slate-700">{project.description}</p>
            </div>
          </div>

          <section className="mt-8 card p-6 sm:p-8">
            <h2 className="text-2xl font-black">Số liệu công bố</h2>
            <p className="mt-1 text-sm text-slate-500">Số liệu theo nguồn tự công bố / nguồn chính thống — chưa khẳng định kiểm toán độc lập.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {project.metrics.map((metric) => <MetricBlock key={metric.id} metric={metric} />)}
            </div>
          </section>
        </main>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[2rem] bg-ink p-6 text-white shadow-card">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-500">Điểm minh bạch</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-6xl font-black tracking-[-.06em]">{project.score.grade}</span>
              <span className={`mb-2 rounded-full px-3 py-1 text-sm font-black ${gradeClass(project.score.grade)}`}>{project.score.total}/100</span>
            </div>
            <div className="mt-5"><ScoreBreakdown score={project.score} variant="dark" /></div>
          </div>

          <div className="card p-6">
            <h2 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="text-brand-700" /> Nguồn dữ liệu</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="font-black">Tổ chức</dt><dd>{project.organization}</dd></div>
              <div><dt className="font-black">Nguồn công bố</dt><dd>{project.source_name}</dd></div>
              <div><dt className="font-black">Lý do chấm điểm</dt><dd>{project.score.reasons.join("; ")}</dd></div>
            </dl>
            <a className="btn-primary mt-5 w-full !min-h-11 text-sm" href={project.source_url} target="_blank" rel="noreferrer">
              Đi đến nguồn gốc <ExternalLink size={16} />
            </a>
          </div>

          <Link to="/kiem-tra-nguon" className="card block p-5 transition hover:border-brand-300 hover:shadow-lg">
            <p className="font-black text-ink">Muốn tự kiểm tra một lời kêu gọi?</p>
            <p className="mt-1 text-sm text-slate-600">Dùng công cụ “Kiểm tra nguồn” để chấm điểm rủi ro tức thì.</p>
          </Link>
        </aside>
      </div>
    </article>
  );
}

function MetricBlock({ metric }: { metric: ContentMetric }): JSX.Element {
  return (
    <div className="rounded-2xl border border-ink/10 bg-sage-100/60 p-5">
      <p className="text-xs font-black uppercase tracking-[.12em] text-brand-700">{metric.label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{metric.display_value}</p>
      <p className="mt-2 text-xs text-slate-500">Nguồn: {metric.source_name} · cấp {metric.confidence_level}</p>
    </div>
  );
}
