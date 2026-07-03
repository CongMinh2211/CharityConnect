import { Bot, Lock, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { iconMap } from "../../shared/components/FeatureHub";
import { canUseFunction, groupsForMenu } from "../../shared/lib/roleGuide";
import type { User } from "../../types";

interface FunctionMenuProps {
  open: boolean;
  user: User | null;
  unread: number;
  onClose: () => void;
}

export function FunctionMenu({ open, user, unread, onClose }: FunctionMenuProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button,a")?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("a,button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const roleLabel = user?.role === "DONOR" ? "Người quyên góp" : user?.role === "ORGANIZATION" ? "Tổ chức từ thiện" : user?.role === "ADMIN" ? "Quản trị viên" : "Khách truy cập";

  return (
    <div
      className="fixed inset-0 z-[70] bg-ink/45 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Tất cả chức năng" className="ml-auto flex h-full w-full max-w-xl flex-col bg-[#f6f8f3] shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">CharityConnect</p>
            <h2 className="mt-1 text-xl font-black">Tất cả chức năng</h2>
          </div>
          <button className="grid h-11 w-11 place-items-center rounded-xl border border-ink/10 bg-white hover:bg-sage-100" aria-label="Đóng menu" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="border-b border-ink/10 bg-ink px-5 py-4 text-white">
          <p className="font-bold">{user?.name ?? "Khách truy cập"}</p>
          <p className="mt-1 text-xs text-white/65">
            Vai trò: {roleLabel}
            {unread > 0 ? ` · ${unread} thông báo mới` : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 sm:pb-6">
          {groupsForMenu(user?.role).map((group) => (
            <section className="mb-6" key={group.title}>
              <div className="mb-2 px-2">
                <h3 className="text-[11px] font-black uppercase tracking-[.15em] text-slate-500">{group.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{group.subtitle}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const allowed = canUseFunction(item, user?.role);
                  const target = allowed ? item.path : "/dang-nhap";
                  const Icon = allowed ? iconMap[item.icon] : Lock;
                  const handleClick = (event: MouseEvent): void => {
                    if (allowed && item.path === "#tro-ly") event.preventDefault();
                    onClose();
                    if (allowed && item.path === "#tro-ly") document.dispatchEvent(new CustomEvent("toggle-chatbot"));
                  };
                  return (
                    <Link
                      key={`${group.title}-${item.label}`}
                      to={target}
                      onClick={handleClick}
                      className={`group flex min-h-[84px] gap-3 rounded-2xl border bg-white p-3 transition hover:border-brand-500 hover:shadow-card ${allowed ? "border-ink/10" : "border-dashed border-slate-300 opacity-85"}`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-brand-700">
                        <Icon size={20} />
                      </span>
                      <span>
                        <strong className="block text-sm text-ink">
                          {item.label}
                          {item.label === "Thông báo" && unread > 0 ? ` (${unread})` : ""}
                        </strong>
                        <span className="mt-1 block text-xs leading-4 text-slate-500">
                          {allowed ? item.description : "Cần đăng nhập đúng vai trò để mở chức năng này."}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-ink/10 bg-white p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
            <ShieldCheck className="text-brand-700" />
            <div>
              <p className="text-sm font-black">An toàn & minh bạch</p>
              <p className="text-xs text-slate-600">Phân quyền theo vai trò, audit log và xác minh công khai.</p>
            </div>
            <Bot className="ml-auto text-brand-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
