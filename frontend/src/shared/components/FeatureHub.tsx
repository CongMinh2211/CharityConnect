import {
  ArrowRight,
  AlertTriangle,
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
  Newspaper,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRoundCog,
  Users,
  Video,
  WalletCards
} from "lucide-react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { Role } from "../../types";
import { canUseFunction, groupsForMenu, type FunctionIcon } from "../lib/roleGuide";

export const iconMap: Record<FunctionIcon, typeof Search> = {
  alert: AlertTriangle,
  "bar-chart": BarChart3,
  bell: Bell,
  bot: Bot,
  "file-down": FileDown,
  gauge: Gauge,
  heart: Heart,
  history: History,
  landmark: Landmark,
  layout: LayoutDashboard,
  list: ListChecks,
  newspaper: Newspaper,
  receipt: ReceiptText,
  search: Search,
  shield: ShieldCheck,
  "user-cog": UserRoundCog,
  users: Users,
  video: Video,
  wallet: WalletCards
};

interface FeatureHubProps {
  role?: Role;
}

const ROLE_LABELS: Record<Role, string> = {
  DONOR: "Người quyên góp",
  ORGANIZATION: "Tổ chức từ thiện",
  ADMIN: "Quản trị viên"
};

export function FeatureHub({ role }: FeatureHubProps): JSX.Element {
  const groups = groupsForMenu(role);

  return (
    <section className="container-page pb-16">
      <div className="rounded-[2rem] bg-sage-100 p-5 sm:p-8">
        <div className="max-w-xl">
          <p className="eyebrow !bg-white">{role ? `Vai trò: ${ROLE_LABELS[role]}` : "Khám phá chức năng"}</p>
          <h2 className="mt-4 text-3xl font-black">Mọi công cụ trong hai thao tác</h2>
          <p className="mt-2 text-slate-600">
            {role
              ? "Đây là các chức năng bạn có thể dùng ngay theo vai trò của mình. Chức năng chung luôn mở."
              : "Chức năng chung luôn mở. Đăng nhập để mở khóa nhóm Người quyên góp, Tổ chức hoặc Quản trị theo vai trò của bạn."}
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[.15em] text-slate-500">{group.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{group.subtitle}</p>
                </div>
                {group.audience !== "COMMON" && group.audience !== role && (
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500">Cần đúng vai trò</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const allowed = canUseFunction(item, role);
                  const Icon = allowed ? iconMap[item.icon] : Lock;
                  const target = allowed ? item.path : "/dang-nhap";
                  const handleClick = (event: MouseEvent) => {
                    if (allowed && item.path === "#tro-ly") {
                      event.preventDefault();
                      document.dispatchEvent(new CustomEvent("toggle-chatbot"));
                    }
                  };

                  return (
                    <Link
                      key={`${group.title}-${item.label}`}
                      to={target}
                      onClick={handleClick}
                      className={`flex min-h-20 items-center gap-4 rounded-2xl border bg-white p-4 font-black transition hover:-translate-y-0.5 hover:border-brand-500 ${
                        allowed ? "border-ink/10" : "border-dashed border-slate-300 opacity-80"
                      }`}
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                        <Icon size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-ink">{item.label}</strong>
                        <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">
                          {allowed ? item.description : "Đăng nhập đúng vai trò để mở chức năng này."}
                        </span>
                      </span>
                      <ArrowRight className="ml-auto shrink-0 text-slate-400" size={17} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
