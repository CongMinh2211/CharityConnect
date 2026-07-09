import { Bell, Landmark, LayoutDashboard, Menu, Search, ShieldCheck, UserCog } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { User } from "../../types";

interface MobileNavigationProps { user: User | null; unread: number; onOpenMenu: () => void }

const itemClass = ({ isActive }: { isActive: boolean }): string => `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold ${isActive ? "text-brand-700" : "text-slate-500"}`;

export function MobileNavigation({ user, unread, onOpenMenu }: MobileNavigationProps): JSX.Element {
  const roleItem = getRoleItem(user);
  const RoleIcon = roleItem.Icon;
  return (
    <nav aria-label="Điều hướng điện thoại" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-ink/10 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(16,35,29,.08)] backdrop-blur sm:hidden">
      <NavLink to="/" end className={itemClass}><ShieldCheck size={20} /><span>Kiểm chứng</span></NavLink>
      <NavLink to="/minh-bach" className={itemClass}><Landmark size={20} /><span>Minh bạch</span></NavLink>
      <NavLink to={roleItem.path} className={itemClass}>
        <span className="relative">
          <RoleIcon size={20} />
          {user?.role === "DONOR" && unread > 0 && <span className="absolute -right-2 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[9px] text-white">{unread}</span>}
        </span>
        <span>{roleItem.label}</span>
      </NavLink>
      <button type="button" className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500" onClick={onOpenMenu}><Menu size={20} /><span>Thêm</span></button>
    </nav>
  );
}

function getRoleItem(user: User | null): { path: string; label: string; Icon: typeof Bell } {
  if (user?.role === "DONOR") return { path: "/thong-bao", label: "Thông báo", Icon: Bell };
  if (user?.role === "ORGANIZATION") return { path: "/to-chuc", label: "Tổ chức", Icon: LayoutDashboard };
  if (user?.role === "ADMIN") return { path: "/quan-tri", label: "Quản trị", Icon: UserCog };
  return { path: "/chien-dich", label: "Chiến dịch", Icon: Search };
}
