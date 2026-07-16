import { useQuery } from "@tanstack/react-query";
import { Bell, CircleCheck, Grid3X3, HeartHandshake, LogOut, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AssistantWidget } from "../components/AssistantWidget";
import { FunctionMenu } from "../features/navigation/FunctionMenu";
import { MobileNavigation } from "../features/navigation/MobileNavigation";
import { api } from "../lib/api";
import type { NotificationPage } from "../types";

const navClass = ({ isActive }: { isActive: boolean }): string => isActive ? "nav-link nav-link-active" : "nav-link";

export function AppShell(): JSX.Element {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ["notification-count", user?.id],
    queryFn: () => api<NotificationPage>("/me/notifications?status=UNREAD&limit=1"),
    enabled: user?.role === "DONOR",
    refetchInterval: 30_000
  });
  const unread = notifications.data?.unread_count ?? 0;

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/95 backdrop-blur">
        <div className="container-page flex min-h-[68px] items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 font-black tracking-[-.03em]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500"><HeartHandshake size={23} /></span>
            <span className="truncate text-base sm:text-lg">Charity<span className="text-brand-700">Connect</span></span>
          </Link>
          <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 text-sm font-semibold md:flex">
            <NavLink to="/" end className={navClass}>Kiểm chứng</NavLink>
            <NavLink to="/kiem-tra-nguon" className={navClass}>Kiểm tra nguồn</NavLink>
            <NavLink to="/chien-dich" className={navClass}>Chiến dịch</NavLink>
            <NavLink to="/canh-bao" className={navClass}>Cảnh báo</NavLink>
            <NavLink to="/minh-bach" className={navClass}>Minh bạch</NavLink>
            <NavLink to="/thong-ke" className={navClass}>Sao kê</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            {user?.role === "DONOR" && (
              <Link to="/thong-bao" className="relative hidden h-11 w-11 place-items-center rounded-xl border border-ink/10 sm:grid" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`}>
                <Bell size={19} />
                {unread > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">{unread}</span>}
              </Link>
            )}
            <button className="hidden h-11 w-11 place-items-center rounded-xl border border-ink/10 bg-sage-100 hover:bg-brand-50 sm:grid" aria-label="Mở tất cả chức năng" onClick={() => setMenuOpen(true)}>
              <Grid3X3 size={20} />
            </button>
            {user ? (
              <button className="hidden min-h-11 items-center gap-2 rounded-xl border border-ink/15 px-3 text-sm font-bold sm:inline-flex" onClick={logout} title={`Đăng xuất ${user.name}`}>
                <span className="hidden lg:inline">Đăng xuất</span><LogOut size={17} />
              </button>
            ) : (
              <Link className="btn-primary !min-h-10 !px-3 text-sm sm:!px-4" to="/dang-nhap">Đăng nhập</Link>
            )}
          </div>
        </div>
      </header>
      <main><NavigationNotice /><Outlet /></main>
      <footer className="border-t border-ink/10 bg-white py-10">
        <div className="container-page flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 font-black"><HeartHandshake size={20} className="text-brand-700" /> CharityConnect Verify</p>
            <p className="mt-1 text-sm text-slate-500">Kiểm chứng nguồn, quyên góp minh bạch, kết nối tin cậy.</p>
          </div>
          <p className="text-xs text-slate-500">© 2026 CharityConnect · Nói không với từ thiện giả</p>
        </div>
      </footer>
      <MobileNavigation user={user} unread={unread} onOpenMenu={() => setMenuOpen(true)} />
      <FunctionMenu open={menuOpen} user={user} unread={unread} onClose={() => setMenuOpen(false)} />
      <AssistantWidget />
    </div>
  );
}

function NavigationNotice(): JSX.Element | null {
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  if (!notice) return null;
  return (
    <div className="container-page pt-5" role="status">
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold">
        <CircleCheck className="shrink-0 text-brand-700" size={20} />
        <span className="flex-1">{notice}</span>
        <button className="rounded-lg p-1 hover:bg-brand-100" aria-label="Đóng thông báo" onClick={() => navigate(location.pathname + location.search, { replace: true, state: null })}>
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
