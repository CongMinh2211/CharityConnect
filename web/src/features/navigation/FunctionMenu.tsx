import {
  BarChart3,
  Bell,
  Bot,
  FileDown,
  Gauge,
  Heart,
  History,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Lock,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRoundCog,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { Role, User } from "../../types";

interface MenuItem {
  label: string;
  description: string;
  path: string;
  icon: typeof Search;
  roles?: Role[];
}

interface MenuGroup {
  title: string;
  subtitle: string;
  audience: "COMMON" | Role;
  items: MenuItem[];
}

interface FunctionMenuProps {
  open: boolean;
  user: User | null;
  unread: number;
  onClose: () => void;
}

const groups: MenuGroup[] = [
  {
    title: "Chức năng chung",
    subtitle: "Ai cũng dùng được, không phụ thuộc vai trò.",
    audience: "COMMON",
    items: [
      { label: "Chiến dịch", description: "Tìm kiếm, lọc và xem chiến dịch đang gây quỹ", path: "/", icon: Search },
      { label: "Thống kê", description: "Tổng tiền, lượt quyên góp và biểu đồ toàn hệ thống", path: "/thong-ke", icon: BarChart3 },
      { label: "Sổ cái minh bạch", description: "Hash-chain, Merkle proof và TrustChain", path: "/minh-bach", icon: Landmark },
      { label: "Xác minh biên nhận", description: "Kiểm tra mã hoặc QR biên nhận công khai", path: "/xac-minh-bien-nhan", icon: ReceiptText }
    ]
  },
  {
    title: "Người quyên góp",
    subtitle: "Quản lý tài khoản, theo dõi đóng góp cá nhân, thông báo và báo cáo PDF.",
    audience: "DONOR",
    items: [
      { label: "Tài khoản", description: "Hồ sơ, đổi mật khẩu, phiên đăng nhập và audit cá nhân", path: "/tai-khoan", icon: UserRoundCog, roles: ["DONOR"] },
      { label: "Chiến dịch đã lưu", description: "Danh sách yêu thích và bật/tắt theo dõi", path: "/yeu-thich", icon: Heart, roles: ["DONOR"] },
      { label: "Thông báo", description: "Cập nhật chiến dịch và báo cáo tác động", path: "/thong-bao", icon: Bell, roles: ["DONOR"] },
      { label: "Lịch sử & PDF", description: "Biên nhận, xác minh và báo cáo đóng góp năm", path: "/lich-su", icon: FileDown, roles: ["DONOR"] }
    ]
  },
  {
    title: "Tổ chức từ thiện",
    subtitle: "Quản lý tài khoản, chiến dịch, ngân sách, milestone và báo cáo quỹ.",
    audience: "ORGANIZATION",
    items: [
      { label: "Tài khoản", description: "Hồ sơ, đổi mật khẩu và phiên đăng nhập tổ chức", path: "/tai-khoan", icon: UserRoundCog, roles: ["ORGANIZATION"] },
      { label: "Dashboard tổ chức", description: "Tổng quan chiến dịch của tổ chức", path: "/to-chuc", icon: WalletCards, roles: ["ORGANIZATION"] },
      { label: "Ngân sách & mốc", description: "Kế hoạch tài chính, milestone và escrow", path: "/to-chuc?tab=finance", icon: ListChecks, roles: ["ORGANIZATION"] },
      { label: "Báo cáo quỹ", description: "Nộp bằng chứng sử dụng quỹ để admin duyệt", path: "/to-chuc?tab=reports", icon: History, roles: ["ORGANIZATION"] }
    ]
  },
  {
    title: "Quản trị viên",
    subtitle: "Kiểm soát tài khoản, kiểm duyệt, rủi ro, audit log và TrustChain anchor.",
    audience: "ADMIN",
    items: [
      { label: "Tài khoản", description: "Bảo mật tài khoản quản trị và audit cá nhân", path: "/tai-khoan", icon: UserRoundCog, roles: ["ADMIN"] },
      { label: "Quản lý tài khoản", description: "Khóa/mở user và kiểm soát tài khoản theo vai trò", path: "/quan-tri?tab=users", icon: Users, roles: ["ADMIN"] },
      { label: "Trung tâm quản trị", description: "Duyệt tổ chức, chiến dịch và báo cáo", path: "/quan-tri", icon: LayoutDashboard, roles: ["ADMIN"] },
      { label: "Risk Score", description: "Điểm rủi ro và Priority Rank tự động", path: "/quan-tri?tab=risk", icon: Gauge, roles: ["ADMIN"] },
      { label: "Audit Log", description: "Dấu vết kiểm duyệt và thay đổi trạng thái", path: "/quan-tri?tab=audit", icon: ListChecks, roles: ["ADMIN"] },
      { label: "TrustChain Anchor", description: "Tạo điểm neo Merkle cho ledger", path: "/quan-tri?tab=trustchain", icon: Landmark, roles: ["ADMIN"] }
    ]
  }
];

function visibleGroups(user: User | null): MenuGroup[] {
  if (!user) return groups;
  return groups.filter((group) => group.audience === "COMMON" || group.audience === user.role);
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
          {visibleGroups(user).map((group) => (
            <section className="mb-6" key={group.title}>
              <div className="mb-2 px-2">
                <h3 className="text-[11px] font-black uppercase tracking-[.15em] text-slate-500">{group.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{group.subtitle}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map(({ label, description, path, icon: Icon, roles }) => {
                  const allowed = !roles || Boolean(user && roles.includes(user.role));
                  const target = allowed ? path : "/dang-nhap";
                  return (
                    <Link
                      key={`${group.title}-${label}`}
                      to={target}
                      onClick={onClose}
                      className={`group flex min-h-[84px] gap-3 rounded-2xl border bg-white p-3 transition hover:border-brand-500 hover:shadow-card ${allowed ? "border-ink/10" : "border-dashed border-slate-300 opacity-85"}`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-brand-700">
                        {allowed ? <Icon size={20} /> : <Lock size={18} />}
                      </span>
                      <span>
                        <strong className="block text-sm text-ink">
                          {label}
                          {label === "Thông báo" && unread > 0 ? ` (${unread})` : ""}
                        </strong>
                        <span className="mt-1 block text-xs leading-4 text-slate-500">
                          {allowed ? description : "Cần đăng nhập đúng vai trò để mở chức năng này."}
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

