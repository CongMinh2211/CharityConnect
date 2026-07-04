import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ExternalLink, PlayCircle, Search, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import type { ContentHome } from "../../types";
import { ContentCard, warningLabelText, youtubeEmbedUrl } from "./ContentCard";

export function VerifyHomePage(): JSX.Element {
  const home = useQuery({ queryKey: ["content-home"], queryFn: () => api<ContentHome>("/content/home") });
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  if (home.isLoading) return <div className="container-page py-12"><div className="skeleton h-[480px]" /></div>;
  if (home.isError || !home.data) return <div className="container-page py-12"><div className="card p-6 text-rose-700">Không thể tải dữ liệu kiểm chứng. Vui lòng thử lại.</div></div>;

  const { kpis, featured, alerts, videos, sources } = home.data;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    navigate(query ? `/kiem-chung?q=${encodeURIComponent(query)}` : "/kiem-chung");
  }

  return (
    <>
      <section className="relative overflow-hidden bg-[#eff5e8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(167,232,107,.45),transparent_24%),radial-gradient(circle_at_84%_78%,rgba(37,99,235,.12),transparent_28%)]" />
        <div className="container-page relative grid min-h-[640px] items-center gap-10 py-14 lg:grid-cols-[1.04fr_.96fr] lg:py-20">
          <div>
            <p className="eyebrow"><ShieldCheck size={17} /> CharityConnect Verify + Donate</p>
            <h1 className="mt-6 max-w-4xl text-[2.75rem] font-black leading-[.96] tracking-[-0.05em] text-ink sm:text-6xl lg:text-[5rem]">
              Kiểm chứng trước khi <span className="text-brand-700">quyên góp</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
              CharityConnect tổng hợp nguồn chính thống, báo cáo minh bạch và cảnh báo dấu hiệu từ thiện giả — giúp bạn ủng hộ đúng nơi, đúng nguồn, đúng bằng chứng.
            </p>
            <form onSubmit={submitSearch} className="mt-8 rounded-[1.75rem] border border-ink/10 bg-white p-3 shadow-card">
              <label className="sr-only" htmlFor="verify-search">Tra cứu nguồn từ thiện</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input
                    id="verify-search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="input pl-12"
                    placeholder="Nhập tên tổ chức, chiến dịch, số tài khoản hoặc link kêu gọi..."
                  />
                </div>
                <button type="submit" className="btn-primary">Tra cứu ngay <ArrowRight size={18} /></button>
              </div>
            </form>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/canh-bao" className="btn-secondary"><AlertTriangle size={18} /> Xem cảnh báo</Link>
              <Link to="/chien-dich" className="btn-secondary"><CheckCircle2 size={18} /> Quyên góp đã kiểm duyệt</Link>
              <Link to="/minh-bach" className="btn-secondary"><BarChart3 size={18} /> TrustChain minh bạch</Link>
            </div>
          </div>
          <div className="relative mx-auto min-h-[470px] w-full max-w-[590px]">
            <img className="absolute right-0 top-0 h-[330px] w-[80%] rounded-[2.2rem] object-cover shadow-photo" src="/images/veo-charity-hero.jpg" alt="Kiểm chứng hoạt động thiện nguyện" />
            <img className="absolute bottom-0 left-0 h-[250px] w-[58%] rounded-[1.8rem] border-[10px] border-[#eff5e8] object-cover shadow-photo" src="/images/community.jpg" alt="Cộng đồng cùng kiểm tra nguồn từ thiện" />
            <div className="absolute bottom-8 right-0 max-w-[240px] rounded-[1.75rem] bg-ink p-5 text-white shadow-card">
              <p className="text-xs font-black uppercase tracking-[.15em] text-brand-500">Nói không với từ thiện giả</p>
              <p className="mt-3 text-2xl font-black">{kpis.alert_cases} cảnh báo</p>
              <p className="mt-1 text-sm text-white/65">Chỉ hiển thị cảnh báo có nguồn và nhãn an toàn.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white">
        <div className="container-page grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile icon="bi bi-shield-check" label="Nguồn tổng hợp" value={`${kpis.sources_total}`} />
          <KpiTile icon="bi bi-newspaper" label="Bài nguồn chính thống" value={`${kpis.official_articles}`} />
          <KpiTile icon="bi bi-exclamation-triangle" label="Cảnh báo đã phân loại" value={`${kpis.alert_cases}`} />
          <KpiTile icon="bi bi-patch-check" label="Có bằng chứng" value={`${kpis.evidence_rate}%`} />
        </div>
      </section>

      <section className="container-page py-14">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow !bg-white">Nguồn uy tín & dữ liệu thật</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.035em] sm:text-4xl">Bài kiểm chứng nổi bật</h2>
          </div>
          <Link to="/kiem-chung" className="btn-secondary">Xem tất cả <ArrowRight size={17} /></Link>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featured.slice(0, 3).map((article) => <ContentCard key={article.id} article={article} />)}
        </div>
      </section>

      <section className="bg-ink py-16 text-white">
        <div className="container-page grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-brand-500">Cảnh báo sai phạm</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-.04em]">Đừng để lòng tốt bị lợi dụng</h2>
            <p className="mt-4 leading-7 text-white/70">Các cảnh báo được gắn nhãn theo mức căn cứ: cơ quan chức năng, báo chí chính thống hoặc dấu hiệu cần kiểm tra. Không tự quy kết khi chưa có nguồn.</p>
            <Link to="/canh-bao" className="mt-7 inline-flex rounded-full bg-white px-6 py-3 font-black text-ink">Xem cảnh báo mới</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {alerts.slice(0, 4).map((article) => (
              <Link key={article.id} to={`/bai-viet/${article.slug}`} className="rounded-3xl border border-white/10 bg-white/8 p-5 transition hover:bg-white/12">
                <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-black text-rose-100">{article.warning_label ? warningLabelText(article.warning_label) : "Cảnh báo"}</span>
                <h3 className="mt-4 line-clamp-2 text-lg font-black">{article.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-white/65">{article.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <div className="card overflow-hidden">
            {videos[0] && youtubeEmbedUrl(videos[0].source_url) ? (
              <iframe
                className="aspect-video w-full border-0"
                src={youtubeEmbedUrl(videos[0].source_url)!}
                title={videos[0].title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="relative aspect-video bg-ink">
                <img src={videos[0]?.image_url ?? "/images/veo-charity-02.jpg"} alt="" className="h-full w-full object-cover opacity-70" />
                <div className="absolute inset-0 grid place-items-center">
                  <a href={videos[0]?.source_url ?? "https://vtv.vn/"} target="_blank" rel="noreferrer" className="grid h-20 w-20 place-items-center rounded-full bg-white/95 text-brand-700 shadow-xl transition hover:scale-105">
                    <PlayCircle size={46} />
                  </a>
                </div>
              </div>
            )}
            <div className="p-6">
              <p className="eyebrow !bg-sage-100">Video minh bạch</p>
              <h2 className="mt-3 text-2xl font-black">{videos[0]?.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{videos[0]?.summary}</p>
              {videos[1] && (
                <Link to={`/bai-viet/${videos[1].slug}`} className="mt-5 flex items-center gap-3 rounded-2xl border border-ink/10 bg-sage-100/60 p-4 transition hover:border-brand-500">
                  <PlayCircle size={28} className="shrink-0 text-brand-700" />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{videos[1].title}</strong>
                    <span className="block truncate text-xs text-slate-500">{videos[1].source.name} · Xem bài kiểm chứng</span>
                  </span>
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-[2rem] bg-sage-100 p-6">
            <p className="text-sm font-black uppercase tracking-[.15em] text-brand-700">Nguồn đang theo dõi</p>
            <div className="mt-5 space-y-3">
              {sources.map((source) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-card">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 font-black text-brand-700">{source.level}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{source.name}</strong>
                    <span className="block truncate text-xs text-slate-500">{source.description}</span>
                  </span>
                  <ExternalLink size={16} className="text-slate-400" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function KpiTile({ icon, label, value }: { icon: string; label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-3xl border border-ink/10 bg-sage-100/50 p-5">
      <i className={`${icon} text-2xl text-brand-700`} aria-hidden="true" />
      <p className="mt-4 text-3xl font-black tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-600">{label}</p>
    </div>
  );
}
