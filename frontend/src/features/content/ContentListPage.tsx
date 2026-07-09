import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { ContentArticlePage, ContentArticleType, ContentSourceLevel } from "../../types";
import { ContentCard } from "./ContentCard";

export function ContentListPage({ mode = "all" }: { mode?: "all" | "alerts" }): JSX.Element {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const initialType = mode === "alerts" ? "SCAM_ALERT" : (searchParams.get("type") ?? "");
  const [type, setType] = useState<string>(initialType);
  const [level, setLevel] = useState("");
  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (type) search.set("type", type);
    if (level) search.set("source_level", level);
    return search.toString();
  }, [level, q, type]);
  const articles = useQuery({ queryKey: ["content-articles", params], queryFn: () => api<ContentArticlePage>(`/content/articles?${params}`) });

  return (
    <section className="container-page py-12">
      <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
        <div>
          <p className="eyebrow !bg-white">{mode === "alerts" ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />} {mode === "alerts" ? "Cảnh báo từ thiện giả" : "Kiểm chứng nguồn"}</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">
            {mode === "alerts" ? "Các vụ việc cần cảnh giác" : "Nguồn chính thống, dự án thật và bài kiểm chứng"}
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            {mode === "alerts"
              ? "Chỉ hiển thị cảnh báo có nguồn. Mỗi bài có nhãn căn cứ để tránh quy kết thiếu cơ sở."
              : "Tra cứu tổ chức, dự án, bài viết, claim số liệu và nguồn minh bạch trước khi quyết định quyên góp."}
          </p>
        </div>
        <div className="card p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
            <label className="label mb-0">
              Tìm kiếm
              <div className="relative mt-2">
                <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
                <input className="input pl-10" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Tổ chức, cảnh báo, số liệu..." />
              </div>
            </label>
            <Select label="Loại bài" value={type} onChange={setType} disabled={mode === "alerts"} options={[
              { value: "", label: "Tất cả" },
              { value: "ORGANIZATION", label: "Tổ chức" },
              { value: "REAL_PROJECT", label: "Dự án thật" },
              { value: "REAL_STATISTIC", label: "Số liệu thật" },
              { value: "FINANCIAL_REPORT", label: "Báo cáo tài chính" },
              { value: "TRANSPARENCY", label: "Minh bạch" },
              { value: "SCAM_ALERT", label: "Cảnh báo lừa đảo" },
              { value: "ALERT", label: "Cảnh báo" },
              { value: "DATA", label: "Số liệu" },
              { value: "VIDEO", label: "Video" },
            ] satisfies Array<{ value: "" | ContentArticleType; label: string }>} />
            <Select label="Cấp nguồn" value={level} onChange={setLevel} options={[
              { value: "", label: "Mọi cấp" },
              { value: "A", label: "A - Chính thống" },
              { value: "B", label: "B - Báo chí" },
              { value: "C", label: "C - Tự công bố" },
              { value: "D", label: "D - Cần kiểm tra" },
            ] satisfies Array<{ value: "" | ContentSourceLevel; label: string }>} />
          </div>
        </div>
      </div>

      {articles.isLoading && <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3"><div className="skeleton h-96" /><div className="skeleton h-96" /><div className="skeleton h-96" /></div>}
      {articles.isError && <div className="card mt-8 p-6 text-rose-700">Không thể tải danh sách bài kiểm chứng.</div>}
      {articles.data?.items.length === 0 && <div className="card mt-8 p-10 text-center text-slate-600">Không có bài phù hợp bộ lọc.</div>}
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {articles.data?.items.map((article) => <ContentCard key={article.id} article={article} />)}
      </div>
    </section>
  );
}

function Select<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: T; label: string }>; onChange: (value: string) => void; disabled?: boolean }): JSX.Element {
  return (
    <label className="label mb-0">
      {label}
      <select className="input mt-2" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
