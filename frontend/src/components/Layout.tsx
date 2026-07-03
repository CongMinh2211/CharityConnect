import { CircleCheck, HeartHandshake, LogOut, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AssistantWidget } from "./AssistantWidget";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export function Layout(): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/95 backdrop-blur">
        <div className="container-page flex min-h-[72px] items-center justify-between gap-4">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-lg font-black tracking-[-0.03em] text-ink"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-ink"><HeartHandshake size={23} strokeWidth={2.4} /></span><span className="hidden min-[430px]:inline">Charity<span className="text-brand-700">Connect</span></span></Link>
          <nav aria-label="Điều hướng chính" className="flex items-center gap-1 text-sm font-semibold">
            <NavLink to="/" end className={navClass}>Chiến dịch</NavLink>
            <NavLink to="/minh-bach" className={navClass}>Minh bạch</NavLink>
            <NavLink to="/thong-ke" className={navClass}>Thống kê</NavLink>
            {user?.role === "DONOR" && <NavLink to="/lich-su" className={navClass}>Lịch sử</NavLink>}
            {user?.role === "ORGANIZATION" && <NavLink to="/to-chuc" className={navClass}>Tổ chức</NavLink>}
            {user?.role === "ADMIN" && <NavLink to="/quan-tri" className={navClass}>Kiểm duyệt</NavLink>}
            {user ? <button className="ml-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 px-3 font-bold text-ink transition hover:bg-sage-100" onClick={logout} title={`Đăng xuất ${user.name}`}><span className="hidden md:inline">Đăng xuất</span><LogOut size={17} /></button> : <Link className="btn-primary ml-2 !min-h-10 !px-4" to="/dang-nhap">Đăng nhập</Link>}
          </nav>
        </div>
      </header>
      <main><NavigationNotice /><Outlet /></main>
      <footer className="border-t border-ink/10 bg-white py-10">
        <div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="flex items-center gap-2 font-black text-ink"><HeartHandshake size={20} className="text-brand-700" /> CharityConnect</p><p className="mt-1 text-sm text-slate-500">Quyên góp minh bạch, kết nối tin cậy.</p></div><p className="text-xs leading-5 text-slate-500">© 2026 CharityConnect · Gây quỹ minh bạch, an toàn</p></div>
      </footer>
      <AssistantWidget />
    </div>
  );
}

function NavigationNotice(): JSX.Element | null {
  const location = useLocation(); const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  if (!notice) return null;
  return <div className="container-page pt-5" role="status"><div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-950"><CircleCheck className="shrink-0 text-brand-700" size={20} /><span className="flex-1">{notice}</span><button type="button" className="rounded-lg p-1 hover:bg-brand-100" aria-label="Đóng thông báo" onClick={() => navigate(location.pathname + location.search, { replace: true, state: null })}><X size={17} /></button></div></div>;
}
