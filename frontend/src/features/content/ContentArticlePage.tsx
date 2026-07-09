import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Info, PlayCircle, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { ContentArticle } from "../../types";
import { gradeClass, typeLabel, youtubeEmbedUrl } from "./ContentCard";

export function ContentArticlePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const article = useQuery({
    queryKey: ["content-article", slug],
    queryFn: () => api<ContentArticle>(`/content/articles/${slug}`),
    enabled: Boolean(slug),
  });

  if (article.isLoading) return <div className="container-page py-12"><div className="skeleton h-[640px]" /></div>;
  if (article.isError || !article.data) return <div className="container-page py-12"><div className="card p-6 text-rose-700">Không tìm thấy bài viết minh bạch.</div></div>;

  const item = article.data;

  return (
    <article className="container-page py-10">
      <Link to="/kiem-chung" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-brand-700"><ArrowLeft size={17} /> Quay lại danh sách</Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0">
          <div className="overflow-hidden rounded-[2rem] border border-ink/10 bg-white shadow-card">
            <img src={item.image_url} alt="" className="h-[360px] w-full object-cover" />
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-700">{typeLabel(item.type)}</span>
                {item.badges.map((badge) => <span key={badge} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{badge}</span>)}
              </div>
              <h1 className="mt-5 text-4xl font-black leading-tight tracking-[-.045em] sm:text-5xl">{item.title}</h1>
              <p className="mt-5 text-lg leading-8 text-slate-700">{item.summary}</p>
            </div>
          </div>

          <section className="mt-8 card p-6 sm:p-8">
            <h2 className="text-2xl font-black">Tóm tắt và nhận định</h2>
            {item.source.level === "C" && (
              <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <Info size={20} className="mt-0.5 shrink-0" />
                <p>Nguồn này là nguồn tự công bố của tổ chức. Hãy xem link gốc, ngày cập nhật, sao kê/chứng từ và đối chiếu thêm trước khi quyên góp số tiền lớn.</p>
              </div>
            )}
            <div className="mt-5 space-y-5 text-base leading-8 text-slate-700">
              {item.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>

          <section className="mt-8 card p-6 sm:p-8">
            <h2 className="text-2xl font-black">Số liệu và claim được trích xuất</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {item.claims.map((claim) => (
                <div key={claim.label} className="rounded-2xl border border-ink/10 bg-sage-100/60 p-5">
                  <p className="text-xs font-black uppercase tracking-[.14em] text-brand-700">{claim.label}</p>
                  <p className="mt-2 text-2xl font-black">{claim.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{claim.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 card p-6 sm:p-8">
            <h2 className="text-2xl font-black">Hình ảnh / video bằng chứng</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {item.media.map((media) => {
                const embed = media.type === "VIDEO" ? youtubeEmbedUrl(media.url) : null;
                if (embed) {
                  return (
                    <div key={`${media.type}-${media.url}`} className="overflow-hidden rounded-3xl border border-ink/10 bg-white md:col-span-2">
                      <iframe
                        className="aspect-video w-full border-0"
                        src={embed}
                        title={media.title ?? "Video nguồn"}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        loading="lazy"
                      />
                      <div className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-black">{media.title ?? "Video nguồn"}</p>
                          <p className="mt-1 text-xs text-slate-500">{media.attribution}</p>
                        </div>
                        <a href={media.url} target="_blank" rel="noreferrer" className="btn-secondary !min-h-10 shrink-0 !px-4 text-sm">Xem tại nguồn <ExternalLink size={15} /></a>
                      </div>
                    </div>
                  );
                }
                return (
                  <a key={`${media.type}-${media.url}`} href={media.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-3xl border border-ink/10 bg-white">
                    <div className="relative aspect-video bg-ink">
                      <img src={media.thumbnail_url ?? media.url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      {media.type === "VIDEO" && <span className="absolute inset-0 grid place-items-center bg-ink/20 text-white"><PlayCircle size={54} /></span>}
                    </div>
                    <div className="p-4">
                      <p className="font-black">{media.title ?? (media.type === "VIDEO" ? "Video nguồn" : "Hình ảnh nguồn")}</p>
                      <p className="mt-1 text-xs text-slate-500">{media.attribution}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        </main>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[2rem] bg-ink p-6 text-white shadow-card">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-500">Điểm xác thực</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-6xl font-black tracking-[-.06em]">{item.score.grade}</span>
              <span className={`mb-2 rounded-full px-3 py-1 text-sm font-black ${gradeClass(item.score.grade)}`}>{item.score.total}/100</span>
            </div>
            <div className="mt-5 space-y-3">
              <ScoreLine label="Nguồn chính thống" value={item.score.source_authority} max={30} />
              <ScoreLine label="Tài chính/sao kê" value={item.score.financial_evidence} max={25} />
              <ScoreLine label="Pháp lý/đại diện" value={item.score.legal_identity} max={20} />
              <ScoreLine label="Ảnh/video" value={item.score.media_evidence} max={15} />
              <ScoreLine label="Độ mới" value={item.score.freshness} max={10} />
            </div>
          </div>

          <div className="card p-6">
            <h2 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="text-brand-700" /> Nguồn dữ liệu</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.source.description}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="font-black">Nguồn</dt><dd>{item.source.name} · Cấp {item.source.level}</dd></div>
              <div><dt className="font-black">Ngày cập nhật</dt><dd>{new Date(item.updated_at).toLocaleDateString("vi-VN")}</dd></div>
              <div><dt className="font-black">Lý do chấm điểm</dt><dd>{item.score.reasons.join("; ")}</dd></div>
            </dl>
            <a className="btn-primary mt-5 w-full !min-h-11 text-sm" href={item.source_url} target="_blank" rel="noreferrer">
              Đi đến nguồn gốc <ExternalLink size={16} />
            </a>
          </div>
        </aside>
      </div>
    </article>
  );
}

function ScoreLine({ label, value, max }: { label: string; value: number; max: number }): JSX.Element {
  const percent = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-bold text-white/70"><span>{label}</span><span>{value}/{max}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}
