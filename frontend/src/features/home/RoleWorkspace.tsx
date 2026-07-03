import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, Bell, FileDown, Heart, Landmark, LayoutDashboard, ListChecks, LogIn, ReceiptText, Search, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatVnd } from "../../lib/api";
import type { Campaign, CampaignPreference, Donation, ImpactReport, NotificationPage, RiskAssessment, User } from "../../types";

interface RoleWorkspaceProps {
  user: User | null;
}

interface OrganizationReview {
  user_id: string;
  legal_name: string;
  status: string;
}

export function RoleWorkspace({ user }: RoleWorkspaceProps): JSX.Element {
  const donorPrefs = useQuery({
    queryKey: ["home-role", "preferences", user?.id],
    queryFn: () => api<CampaignPreference[]>("/me/campaign-preferences"),
    enabled: user?.role === "DONOR"
  });
  const donorNotifications = useQuery({
    queryKey: ["home-role", "notifications", user?.id],
    queryFn: () => api<NotificationPage>("/me/notifications?status=UNREAD&limit=3"),
    enabled: user?.role === "DONOR"
  });
  const donorHistory = useQuery({
    queryKey: ["home-role", "donations", user?.id],
    queryFn: () => api<Donation[]>("/donations/history"),
    enabled: user?.role === "DONOR"
  });
  const orgCampaigns = useQuery({
    queryKey: ["home-role", "organization-campaigns", user?.id],
    queryFn: () => api<Campaign[]>("/organization/campaigns"),
    enabled: user?.role === "ORGANIZATION"
  });
  const adminOrganizations = useQuery({
    queryKey: ["home-role", "admin-organizations"],
    queryFn: () => api<OrganizationReview[]>("/admin/organizations?status=PENDING"),
    enabled: user?.role === "ADMIN"
  });
  const adminCampaigns = useQuery({
    queryKey: ["home-role", "admin-campaigns"],
    queryFn: () => api<Campaign[]>("/admin/campaigns?status=PENDING_REVIEW"),
    enabled: user?.role === "ADMIN"
  });
  const adminReports = useQuery({
    queryKey: ["home-role", "admin-reports"],
    queryFn: () => api<ImpactReport[]>("/admin/impact-reports?status=PENDING_REVIEW"),
    enabled: user?.role === "ADMIN"
  });
  const adminRisks = useQuery({
    queryKey: ["home-role", "admin-risks"],
    queryFn: () => api<RiskAssessment[]>("/admin/campaign-risks"),
    enabled: user?.role === "ADMIN"
  });

  if (!user) {
    return (
      <section className="container-page pb-14">
        <div className="relative overflow-hidden rounded-[2rem] border border-ink/10 bg-gradient-to-br from-white via-sage-100 to-brand-50 p-6 shadow-card sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-brand-700/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="eyebrow !bg-white"><Sparkles size={15} /> Không gian tài khoản</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-.035em] sm:text-4xl">Đăng nhập để thấy đúng chức năng của bạn</h2>
              <p className="mt-3 leading-7 text-slate-600">Mỗi vai trò có dữ liệu và nút quản lý riêng. Chức năng chung vẫn giữ nguyên cho mọi người.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/dang-nhap" className="btn-primary"><LogIn size={18} /> Đăng nhập</Link>
                <a href="#chien-dich" className="btn-secondary"><Search size={18} /> Khám phá chiến dịch</a>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-brand-700" /> Tổ chức xác minh</span>
                <span className="inline-flex items-center gap-1.5"><ReceiptText size={15} className="text-brand-700" /> Biên nhận tức thì</span>
                <span className="inline-flex items-center gap-1.5"><Landmark size={15} className="text-brand-700" /> Sổ cái công khai</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <LoginRoleCard icon={Heart} title="Người quyên góp" email="donor@demo.vn" text="Lưu, theo dõi, thông báo, lịch sử và PDF." />
              <LoginRoleCard icon={WalletCards} title="Tổ chức" email="org@demo.vn" text="Chiến dịch, ngân sách, mốc và báo cáo quỹ." />
              <LoginRoleCard icon={ShieldCheck} title="Admin" email="admin@demo.vn" text="Kiểm duyệt, Risk Score, Audit Log, TrustChain." />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (user.role === "DONOR") {
    const prefs = donorPrefs.data ?? [];
    const donations = donorHistory.data ?? [];
    const total = donations.reduce((sum, item) => sum + item.amount, 0);
    return (
      <section className="container-page pb-14">
        <WorkspaceShell
          eyebrow="Không gian người quyên góp"
          title={`Xin chào ${user.name}`}
          description="Dữ liệu được nối theo luồng: lưu/theo dõi chiến dịch → nhận thông báo → quyên góp → biên nhận/PDF → xác minh TrustChain."
        >
          <MetricGrid>
            <MetricCard label="Đã lưu" value={String(prefs.filter((item) => item.saved).length)} />
            <MetricCard label="Đang theo dõi" value={String(prefs.filter((item) => item.following).length)} />
            <MetricCard label="Thông báo chưa đọc" value={String(donorNotifications.data?.unread_count ?? 0)} />
            <MetricCard label="Tổng đã góp" value={formatVnd(total)} />
          </MetricGrid>
          <ActionGrid>
            <ActionCard icon={Heart} title="Yêu thích & theo dõi" text="Quản lý chiến dịch đã lưu, bật/tắt theo dõi." to="/yeu-thich" />
            <ActionCard icon={Bell} title="Thông báo web + Gmail" text="Nhận cập nhật mốc, báo cáo tác động và duyệt chiến dịch." to="/thong-bao" />
            <ActionCard icon={FileDown} title="Lịch sử & PDF" text="Tải báo cáo đóng góp theo năm và mở từng biên nhận." to="/lich-su" />
            <ActionCard icon={ReceiptText} title="Xác minh biên nhận" text="Kiểm tra mã biên nhận trên sổ cái công khai." to="/xac-minh-bien-nhan" />
          </ActionGrid>
        </WorkspaceShell>
      </section>
    );
  }

  if (user.role === "ORGANIZATION") {
    const campaigns = orgCampaigns.data ?? [];
    const raised = campaigns.reduce((sum, item) => sum + item.raised_amount, 0);
    const needsPlan = campaigns.filter((item) => ["DRAFT", "REJECTED"].includes(item.status)).length;
    return (
      <section className="container-page pb-14">
        <WorkspaceShell
          eyebrow="Không gian tổ chức"
          title="Quản lý từ kế hoạch đến giải ngân"
          description="Dữ liệu được nối theo chiến dịch: hồ sơ xác minh → kế hoạch ngân sách/milestone → admin duyệt → báo cáo quỹ → ledger và escrow."
        >
          <MetricGrid>
            <MetricCard label="Chiến dịch của tôi" value={String(campaigns.length)} />
            <MetricCard label="Đang nhận quyên góp" value={String(campaigns.filter((item) => item.status === "APPROVED").length)} />
            <MetricCard label="Cần hoàn thiện kế hoạch" value={String(needsPlan)} />
            <MetricCard label="Đã tiếp nhận" value={formatVnd(raised)} />
          </MetricGrid>
          <ActionGrid>
            <ActionCard icon={LayoutDashboard} title="Dashboard tổ chức" text="Tổng quan trạng thái và việc cần làm." to="/to-chuc" />
            <ActionCard icon={WalletCards} title="Ngân sách & mốc" text="Kế hoạch tài chính nối với mục tiêu gây quỹ." to="/to-chuc?tab=finance" />
            <ActionCard icon={ListChecks} title="Chiến dịch" text="Tạo, nộp duyệt, đóng chiến dịch và mở chi tiết công khai." to="/to-chuc?tab=campaigns" />
            <ActionCard icon={ShieldCheck} title="Báo cáo quỹ" text="Nộp bằng chứng để admin duyệt và cập nhật timeline tác động." to="/to-chuc?tab=reports" />
          </ActionGrid>
        </WorkspaceShell>
      </section>
    );
  }

  const pendingTotal = (adminOrganizations.data?.length ?? 0) + (adminCampaigns.data?.length ?? 0) + (adminReports.data?.length ?? 0);
  const highRisk = (adminRisks.data ?? []).filter((item) => item.level === "HIGH").length;
  return (
    <section className="container-page pb-14">
      <WorkspaceShell
        eyebrow="Không gian quản trị viên"
        title="Một màn hình nối kiểm duyệt, rủi ro và minh bạch"
        description="Admin xử lý hàng đợi, xem Risk Score, đối chiếu Audit Log và tạo TrustChain anchor từ cùng bộ dữ liệu chiến dịch/quỹ."
      >
        <MetricGrid>
          <MetricCard label="Tổng hàng đợi" value={String(pendingTotal)} />
          <MetricCard label="Tổ chức chờ duyệt" value={String(adminOrganizations.data?.length ?? 0)} />
          <MetricCard label="Chiến dịch chờ duyệt" value={String(adminCampaigns.data?.length ?? 0)} />
          <MetricCard label="Rủi ro cao" value={String(highRisk)} />
        </MetricGrid>
        <ActionGrid>
          <ActionCard icon={ShieldCheck} title="Hàng đợi kiểm duyệt" text="Duyệt tổ chức, chiến dịch và báo cáo tác động." to="/quan-tri" />
          <ActionCard icon={AlertTriangle} title="Risk Score" text="Điểm rủi ro tự động và lý do tính điểm." to="/quan-tri?tab=risk" />
          <ActionCard icon={BarChart3} title="Audit Log" text="Nối dấu vết Identity và Campaign theo thời gian." to="/quan-tri?tab=audit" />
          <ActionCard icon={Landmark} title="TrustChain Anchor" text="Neo ledger vào Merkle root trên blockchain." to="/quan-tri?tab=trustchain" />
        </ActionGrid>
      </WorkspaceShell>
    </section>
  );
}

function LoginRoleCard({ icon: Icon, title, email, text }: { icon: typeof Heart; title: string; email: string; text: string }): JSX.Element {
  return (
    <Link to="/dang-nhap" className="group rounded-2xl border border-ink/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-card">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={19} /></span>
      <p className="mt-3 font-black">{title}</p>
      <p className="mt-1 font-mono text-xs text-brand-700">{email}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-sm font-black text-ink">Đăng nhập <ArrowRight size={15} className="transition group-hover:translate-x-0.5" /></p>
    </Link>
  );
}

function WorkspaceShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-[2rem] border border-ink/10 bg-white p-5 shadow-card sm:p-8">
      <div className="max-w-3xl">
        <p className="eyebrow !bg-sage-100">{eyebrow}</p>
        <h2 className="mt-4 text-3xl font-black tracking-[-.035em]">{title}</h2>
        <p className="mt-3 leading-7 text-slate-600">{description}</p>
      </div>
      <div className="mt-7 space-y-5">{children}</div>
    </div>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function MetricCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <article className="rounded-2xl bg-sage-100 p-4">
      <p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-ink">{value}</p>
    </article>
  );
}

function ActionGrid({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function ActionCard({ icon: Icon, title, text, to }: { icon: typeof Heart; title: string; text: string; to: string }): JSX.Element {
  return (
    <Link to={to} className="group flex min-h-[128px] flex-col rounded-2xl border border-ink/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-card">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={21} /></span>
      <strong className="mt-4 text-sm">{title}</strong>
      <span className="mt-1 flex-1 text-xs leading-5 text-slate-500">{text}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-brand-700">Mở dữ liệu liên quan <ArrowRight className="transition group-hover:translate-x-0.5" size={14} /></span>
    </Link>
  );
}
