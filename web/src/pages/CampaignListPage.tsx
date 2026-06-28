import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Bell, Bot, FileCheck2, FileDown, Gauge, Heart, HeartHandshake, History, Landmark, LayoutDashboard, ListChecks, Lock, ReceiptText, Search, ShieldCheck, SlidersHorizontal, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CampaignCard } from "../components/CampaignCard";
import { useAuth } from "../auth/AuthContext";
import { RoleWorkspace } from "../features/home/RoleWorkspace";
import { api, formatVnd } from "../lib/api";
import type { Campaign, Role } from "../types";

interface Filters { search: string; category: string; progress: string; ending: string; sort: string }
const initialFilters: Filters = { search: "", category: "", progress: "", ending: "", sort: "newest" };

export function CampaignListPage(): JSX.Element {
  const { user } = useAuth(); const [filters, setFilters] = useState(initialFilters); const [filtersOpen, setFiltersOpen] = useState(false);
  const params = new URLSearchParams(); if (filters.search) params.set("search", filters.search); if (filters.category) params.set("category", filters.category); if (filters.ending) params.set("ending_within", filters.ending); params.set("sort", filters.sort);
  if (filters.progress) { const [min, max] = filters.progress.split("-"); params.set("progress_min", min); if (max) params.set("progress_max", max); }
  const campaigns = useQuery({ queryKey: ["campaigns", params.toString()], queryFn: () => api<Campaign[]>(`/campaigns?${params}`) });
  const allCampaigns = useQuery({ queryKey: ["campaigns", "categories"], queryFn: () => api<Campaign[]>("/campaigns") });
  const categories = useMemo(() => Array.from(new Set(allCampaigns.data?.map((item) => item.category) ?? [])), [allCampaigns.data]);
  const totalRaised = allCampaigns.data?.reduce((sum, item) => sum + item.raised_amount, 0) ?? 0;
  return <>
    <section className="hero-surface overflow-hidden"><div className="container-page grid items-center gap-10 py-12 lg:grid-cols-[1.02fr_.98fr] lg:py-20"><div><p className="eyebrow"><ShieldCheck size={17} /> Chiến dịch đã qua kiểm duyệt</p><h1 className="mt-6 max-w-3xl text-[2.75rem] font-black leading-[.98] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.6rem]">Trao niềm tin.<br /><span className="text-brand-700">Nhìn thấy thay đổi.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-700">Kết nối với tổ chức đã xác minh, theo dõi từng mốc và kiểm chứng mọi đóng góp.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><a className="btn-primary" href="#chien-dich">Khám phá chiến dịch <ArrowRight size={18} /></a><Link className="btn-secondary" to="/minh-bach">Xem sổ cái công khai</Link></div><dl className="mt-10 grid max-w-xl grid-cols-3 gap-3 border-t border-ink/15 pt-6"><Stat label="Đã gây quỹ" value={formatVnd(totalRaised)} /><Stat label="Chiến dịch" value={String(allCampaigns.data?.length ?? "—")} /><Stat label="Minh bạch" value="100%" /></dl></div><div className="relative mx-auto min-h-[390px] w-full max-w-[560px]"><img className="absolute right-0 top-0 h-[300px] w-[78%] rounded-[2rem] object-cover shadow-photo" src="/images/veo-charity-hero.jpg" alt="Hoạt động thiện nguyện tại Việt Nam" /><img className="absolute bottom-0 left-0 h-[210px] w-[56%] rounded-[1.6rem] border-[8px] border-sage-100 object-cover shadow-photo" src="/images/veo-charity-01.jpg" alt="Hỗ trợ giáo dục cộng đồng" /><div className="absolute bottom-5 right-0 w-48 rounded-2xl bg-ink p-5 text-white"><ShieldCheck className="text-brand-500" /><p className="mt-3 text-sm font-black">Tổ chức xác minh</p><p className="mt-1 text-xs text-white/60">Hồ sơ và ngân sách qua kiểm duyệt.</p></div></div></div></section>
    <section className="border-y border-ink/10 bg-white"><div className="container-page grid gap-5 py-5 text-sm text-slate-700 sm:grid-cols-3"><p className="flex items-center gap-3"><ShieldCheck className="text-brand-700" /><strong>Kiểm duyệt hai lớp</strong></p><p className="flex items-center gap-3"><ReceiptText className="text-brand-700" /><strong>Biên nhận tức thì</strong></p><p className="flex items-center gap-3"><HeartHandshake className="text-brand-700" /><strong>Theo dõi tiến độ rõ ràng</strong></p></div></section>
    <section className="container-page py-14" id="chien-dich"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow !bg-transparent !p-0">Đang gây quỹ</p><h2 className="mt-3 text-3xl font-black tracking-[-.035em] sm:text-4xl">Chọn thay đổi bạn muốn góp sức</h2></div><button className="btn-secondary md:hidden" onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal size={18} /> Bộ lọc</button></div>
      <div className={`${filtersOpen ? "grid" : "hidden"} card mt-7 gap-4 p-4 md:grid md:grid-cols-5`}><label className="label md:col-span-2">Từ khóa<div className="relative mt-2"><Search className="absolute left-3 top-3.5 text-slate-400" size={18} /><input className="input pl-10" value={filters.search} placeholder="Tên chiến dịch, tổ chức…" onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></div></label><Select label="Danh mục" value={filters.category} onChange={(value) => setFilters({ ...filters, category: value })} options={[{ value: "", label: "Tất cả" }, ...categories.map((value) => ({ value, label: value }))]} /><Select label="Tiến độ" value={filters.progress} onChange={(value) => setFilters({ ...filters, progress: value })} options={[{ value: "", label: "Mọi mức" }, { value: "0-24", label: "Dưới 25%" }, { value: "25-74", label: "25–74%" }, { value: "75-", label: "Từ 75%" }]} /><Select label="Sắp xếp" value={filters.sort} onChange={(value) => setFilters({ ...filters, sort: value })} options={[{ value: "newest", label: "Mới nhất" }, { value: "ending_soon", label: "Sắp hết hạn" }, { value: "progress_desc", label: "Tiến độ cao" }]} /><label className="label md:col-span-2">Kết thúc trong<select className="input mt-2" value={filters.ending} onChange={(event) => setFilters({ ...filters, ending: event.target.value })}><option value="">Không giới hạn</option><option value="7">7 ngày</option><option value="30">30 ngày</option></select></label><div className="flex items-end md:col-span-3"><button className="min-h-12 text-sm font-bold text-slate-600 underline" onClick={() => setFilters(initialFilters)}>Xóa bộ lọc</button></div></div>
      {campaigns.isLoading && <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3"><div className="skeleton h-96" /><div className="skeleton h-96" /><div className="skeleton h-96" /></div>}{campaigns.isError && <div className="card mt-8 p-6 text-rose-700" role="alert">Không thể tải chiến dịch. Vui lòng thử lại.</div>}{campaigns.data?.length === 0 && <div className="card mt-8 p-10 text-center text-slate-600">Không có chiến dịch phù hợp. Hãy đổi bộ lọc.</div>}<div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{campaigns.data?.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</div>
    </section>
    <RoleWorkspace user={user} />
    <FeatureExplorer role={user?.role} />
    <section className="bg-ink py-16 text-white"><div className="container-page"><p className="text-sm font-bold uppercase tracking-[.16em] text-brand-500">Một hành trình có thể kiểm chứng</p><div className="mt-8 grid gap-px overflow-hidden rounded-3xl bg-white/15 lg:grid-cols-3">{[{ icon: FileCheck2, n: "01", title: "Xác minh", text: "Admin kiểm tra hồ sơ, ngân sách và mốc giải ngân." }, { icon: HeartHandshake, n: "02", title: "Đóng góp", text: "Biên nhận được ghi vào hash-chain chống chỉnh sửa." }, { icon: ReceiptText, n: "03", title: "Theo dõi", text: "Báo cáo quỹ, bằng chứng và số dư hiển thị công khai." }].map(({ icon: Icon, n, title, text }) => <article className="bg-ink p-7" key={n}><div className="flex items-center justify-between"><Icon className="text-brand-500" /><span className="font-mono text-sm text-white/45">{n}</span></div><h3 className="mt-8 text-2xl font-extrabold">{title}</h3><p className="mt-3 leading-7 text-white/65">{text}</p></article>)}</div></div></section>
  </>;
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element { return <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">{label}</dt><dd className="mt-1 truncate text-base font-black sm:text-xl">{value}</dd></div>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }): JSX.Element { return <label className="label">{label}<select className="input mt-2" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>; }

const groups: Array<{ title: string; items: MenuItem[] }> = [
  { title: "Công khai", items: [
    { label: "Chiến dịch", description: "Tìm hoạt động phù hợp", path: "/", icon: Search },
    { label: "Thống kê", description: "Dòng tiền toàn hệ thống", path: "/thong-ke", icon: BarChart3 },
    { label: "Sổ cái minh bạch", description: "Hash-chain và Merkle", path: "/minh-bach", icon: Landmark },
    { label: "Xác minh biên nhận", description: "Kiểm tra QR công khai", path: "/xac-minh-bien-nhan", icon: ReceiptText },
    { label: "Trợ lý AI", description: "Hỏi đáp thông tin dự án", path: "#tro-ly", icon: Bot },
  ] },
  { title: "Người quyên góp", items: [
    { label: "Chiến dịch đã lưu", description: "Danh sách yêu thích", path: "/yeu-thich", icon: Heart, roles: ["DONOR"] },
    { label: "Theo dõi chiến dịch", description: "Bật nhận thông báo", path: "/yeu-thich", icon: Heart, roles: ["DONOR"] },
    { label: "Thông báo", description: "Cập nhật mới nhất", path: "/thong-bao", icon: Bell, roles: ["DONOR"] },
    { label: "Lịch sử quyên góp", description: "Lịch sử giao dịch", path: "/lich-su", icon: History, roles: ["DONOR"] },
    { label: "Báo cáo PDF năm", description: "Tải báo cáo tài chính", path: "/lich-su", icon: FileDown, roles: ["DONOR"] },
  ] },
  { title: "Tổ chức", items: [
    { label: "Dashboard tổ chức", description: "Tổng quan & chiến dịch", path: "/to-chuc", icon: WalletCards, roles: ["ORGANIZATION"] },
    { label: "Ngân sách", description: "Phân bổ dòng tiền", path: "/to-chuc?tab=finance", icon: WalletCards, roles: ["ORGANIZATION"] },
    { label: "Milestone", description: "Mốc thực hiện chiến dịch", path: "/to-chuc?tab=finance", icon: WalletCards, roles: ["ORGANIZATION"] },
    { label: "Báo cáo tác động", description: "Chứng minh hiệu quả dự án", path: "/to-chuc?tab=reports", icon: FileDown, roles: ["ORGANIZATION"] },
  ] },
  { title: "Quản trị", items: [
    { label: "Kiểm duyệt hệ thống", description: "Duyệt hồ sơ & chiến dịch", path: "/quan-tri", icon: ShieldCheck, roles: ["ADMIN"] },
    { label: "Risk Score", description: "Đánh giá mức độ rủi ro", path: "/quan-tri?tab=risk", icon: Gauge, roles: ["ADMIN"] },
    { label: "Audit Log", description: "Dấu vết thay đổi hệ thống", path: "/quan-tri?tab=audit", icon: ListChecks, roles: ["ADMIN"] },
    { label: "TrustChain anchor", description: "Điểm neo blockchain", path: "/quan-tri?tab=trustchain", icon: Landmark, roles: ["ADMIN"] },
  ] },
];

interface MenuItem { label: string; description: string; path: string; icon: typeof Search; roles?: Role[] }

function FeatureExplorer({ role }: { role?: Role }): JSX.Element {
  const filteredGroups = groups.map((group) => {
    const items = group.items.filter((item) => {
      if (!item.roles) return true;
      if (!role) return false;
      return item.roles.includes(role);
    });
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  return <section className="container-page pb-16">
    <div className="rounded-[2rem] bg-sage-100 p-5 sm:p-8">
      <div className="max-w-xl">
        <p className="eyebrow !bg-white">Khám phá chức năng</p>
        <h2 className="mt-4 text-3xl font-black">Mọi công cụ trong hai thao tác</h2>
        <p className="mt-2 text-slate-600">Công khai cho mọi người, cá nhân hóa theo đúng vai trò khi đăng nhập.</p>
      </div>

      <div className="mt-8 space-y-8">
        {filteredGroups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-3 px-1 text-xs font-black uppercase tracking-[.15em] text-slate-500">{group.title}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(({ label, description, path, icon: Icon }) => {
                const handleClick = (e: React.MouseEvent) => {
                  if (path === "#tro-ly") {
                    e.preventDefault();
                    document.dispatchEvent(new CustomEvent("toggle-chatbot"));
                  }
                };

                return <Link key={label} to={path} onClick={handleClick} className="flex min-h-20 items-center gap-4 rounded-2xl border border-ink/10 bg-white p-4 font-black transition hover:-translate-y-0.5 hover:border-brand-500">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon size={21} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <strong className="block text-sm text-ink flex items-center gap-1.5 truncate">
                      {label}
                    </strong>
                    <span className="mt-0.5 block text-xs font-normal text-slate-500 truncate">{description}</span>
                  </span>
                  <ArrowRight className="ml-auto text-slate-400 shrink-0" size={17} />
                </Link>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>;
}
