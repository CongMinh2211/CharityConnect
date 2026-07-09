import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleDollarSign, HandHeart, Landmark, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer as RechartsResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { api, formatVnd } from "../lib/api";
import type { AnalyticsPeriod, CampaignAnalytics, DonationAnalytics, UserAnalytics } from "../types";

const periods: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "90d", label: "90 ngày" },
  { value: "all", label: "Toàn bộ" },
];
const colors = ["#2e7148", "#2563eb", "#8ed957", "#f59e0b", "#8b5cf6"];
const compactVnd = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

function ResponsiveContainer(props: ComponentProps<typeof RechartsResponsiveContainer>): JSX.Element {
  return <RechartsResponsiveContainer initialDimension={{ width: 640, height: 320 }} {...props} />;
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CircleDollarSign }): JSX.Element {
  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-500">{label}</p>
          <p className="mt-2 break-words text-xl font-black tracking-tight text-ink sm:text-2xl">{value}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-brand-700"><Icon size={20} /></span>
      </div>
    </article>
  );
}

function EmptyChart(): JSX.Element {
  return <div className="grid h-64 place-items-center rounded-xl bg-sage-100 px-4 text-center text-sm font-semibold text-slate-500">Chưa có giao dịch trong khoảng thời gian này.</div>;
}

export function StatisticsPage(): JSX.Element {
  const { user } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const donations = useQuery({ queryKey: ["analytics-donations-public", period], queryFn: () => api<DonationAnalytics>(`/analytics/donations/public?period=${period}`) });
  const campaigns = useQuery({ queryKey: ["analytics-campaigns-public", period], queryFn: () => api<CampaignAnalytics>(`/analytics/campaigns/public?period=${period}`) });
  const users = useQuery({ queryKey: ["analytics-users-public"], queryFn: () => api<UserAnalytics>("/analytics/users/public") });
  const roleDonationPath = user?.role === "DONOR" ? "me" : user?.role === "ORGANIZATION" ? "organization" : user?.role === "ADMIN" ? "admin" : null;
  const roleDonations = useQuery({ queryKey: ["analytics-donations-role", roleDonationPath, period], queryFn: () => api<DonationAnalytics>(`/analytics/donations/${roleDonationPath}?period=${period}`), enabled: Boolean(roleDonationPath) });

  const loading = donations.isLoading || campaigns.isLoading || users.isLoading;
  const failed = donations.isError || campaigns.isError || users.isError;
  const totals = donations.data?.totals;
  const campaignTotals = campaigns.data?.totals;
  const progress = campaigns.data?.campaign_progress ?? [];
  const categoryData = campaigns.data?.category_distribution ?? [];
  const reconciliationDelta = totals && campaignTotals ? totals.donation_amount - campaignTotals.raised_amount : 0;
  const reconciliationOk = Math.abs(reconciliationDelta) === 0;

  return (
    <div className="pb-16">
      <section className="border-b border-ink/10 bg-ink py-10 text-white sm:py-12">
        <div className="container-page">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand-500">Toàn dân chung tay</p>
          <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-[-.035em] sm:text-5xl">Mỗi con số đều có thể kiểm chứng.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">Thống kê lấy Donation Service làm nguồn chuẩn cho tiền và giao dịch; Campaign Service chỉ bổ sung mục tiêu, danh mục và trạng thái.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex" aria-label="Khoảng thời gian">
              {periods.map((item) => (
                <button key={item.value} className={period === item.value ? "rounded-full bg-brand-500 px-4 py-2 text-xs font-extrabold text-ink" : "rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/75"} onClick={() => setPeriod(item.value)}>{item.label}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="container-page py-8 sm:py-10">
        {loading && <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><RefreshCw className="animate-spin" size={17} /> Đang tổng hợp dữ liệu…</div>}
        {failed && <div className="card border-rose-200 p-5 text-rose-700">Không thể tải thống kê. Vui lòng thử lại.</div>}

        {totals && (
          <>
            <section aria-label="Chỉ số toàn hệ thống" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <MetricCard label="Tổng quyên góp" value={formatVnd(totals.donation_amount)} icon={CircleDollarSign} />
              <MetricCard label="Lượt đóng góp" value={totals.donation_count.toLocaleString("vi-VN")} icon={HandHeart} />
              <MetricCard label="Người chung tay" value={totals.unique_donors.toLocaleString("vi-VN")} icon={UsersRound} />
              <MetricCard label="Chiến dịch hoạt động" value={String(campaignTotals?.active_count ?? 0)} icon={BarChart3} />
              <MetricCard label="Quỹ đã xác minh" value={formatVnd(totals.verified_fund_usage)} icon={ShieldCheck} />
              <MetricCard label="Số dư minh bạch" value={formatVnd(totals.transparent_balance)} icon={Landmark} />
            </section>

            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${reconciliationOk ? "border-brand-200 bg-brand-50 text-brand-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              Đối soát tiền: Donation completed {formatVnd(totals.donation_amount)} · Campaign raised {formatVnd(campaignTotals?.raised_amount ?? 0)} · Sai lệch {formatVnd(Math.abs(reconciliationDelta))}.
            </div>
            <p className="mt-3 text-left text-xs text-slate-500 sm:text-right">Cập nhật lúc {new Date(donations.data!.as_of).toLocaleString("vi-VN")} · {users.data?.totals.verified_organization_count ?? 0} tổ chức đã xác minh</p>

            <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
              <article className="card min-w-0 p-5 sm:p-7">
                <h2 className="text-xl font-black">Dòng tiền thiện nguyện</h2>
                <p className="mt-1 text-sm text-slate-500">Tổng số tiền theo {period === "all" ? "tháng" : "ngày"}</p>
                <div className="mt-6 h-64 min-w-0 sm:h-72" aria-label="Biểu đồ xu hướng quyên góp">
                  {donations.data!.timeline.length ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <AreaChart data={donations.data!.timeline}>
                        <defs><linearGradient id="donationFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2e7148" stopOpacity={0.35} /><stop offset="95%" stopColor="#2e7148" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dce5d7" />
                        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} minTickGap={18} />
                        <YAxis tickFormatter={(value) => compactVnd.format(Number(value))} tick={{ fontSize: 11 }} width={52} />
                        <Tooltip formatter={(value) => formatVnd(Number(value))} />
                        <Area type="monotone" dataKey="donation_amount" name="Quyên góp" stroke="#2e7148" strokeWidth={3} fill="url(#donationFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <EmptyChart />}
                </div>
              </article>

              <article className="card min-w-0 p-5 sm:p-7">
                <h2 className="text-xl font-black">Theo lĩnh vực</h2>
                <p className="mt-1 text-sm text-slate-500">Số tiền donation đã ghi nhận theo danh mục</p>
                <div className="mt-4 h-64 min-w-0 sm:h-72">
                  {categoryData.length ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="raised_amount" nameKey="category" innerRadius={48} outerRadius={86} paddingAngle={3}>
                          {categoryData.map((item, index) => <Cell key={item.category} fill={colors[index % colors.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => formatVnd(Number(value))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <EmptyChart />}
                </div>
              </article>
            </section>

            <article className="card mt-6 min-w-0 overflow-hidden">
              <div className="p-5 sm:p-7">
                <h2 className="text-xl font-black">Tiến độ chiến dịch</h2>
                <p className="mt-1 text-sm text-slate-500">Đối chiếu mục tiêu, tiền đã nhận, tiền đã sử dụng và số dư minh bạch.</p>
              </div>
              <div className="hidden h-80 min-w-0 px-3 sm:block sm:px-6">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={progress} layout="vertical" margin={{ left: 18, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={(value) => compactVnd.format(Number(value))} />
                    <YAxis type="category" dataKey="title" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatVnd(Number(value))} />
                    <Legend />
                    <Bar dataKey="goal_amount" name="Mục tiêu" fill="#dce5d7" radius={[0, 5, 5, 0]} />
                    <Bar dataKey="raised_amount" name="Đã nhận" fill="#2e7148" radius={[0, 5, 5, 0]} />
                    <Bar dataKey="used_amount" name="Đã sử dụng" fill="#2563eb" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <CampaignProgressMobile items={progress} />
              <div className="hidden overflow-x-auto border-t border-ink/10 sm:block">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <caption className="sr-only">Dữ liệu tiến độ chiến dịch</caption>
                  <thead className="bg-sage-100 text-xs uppercase text-slate-500">
                    <tr><th className="px-5 py-3">Chiến dịch</th><th className="px-5 py-3">Mục tiêu</th><th className="px-5 py-3">Đã nhận</th><th className="px-5 py-3">Đã sử dụng</th><th className="px-5 py-3">Số dư</th><th className="px-5 py-3">Tiến độ</th></tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {progress.map((item) => {
                      const used = item.used_amount ?? 0;
                      const balance = item.transparent_balance ?? Math.max(0, item.raised_amount - used);
                      return <tr key={item.id}><td className="px-5 py-3 font-bold">{item.title}</td><td className="px-5 py-3">{formatVnd(item.goal_amount)}</td><td className="px-5 py-3">{formatVnd(item.raised_amount)}</td><td className="px-5 py-3">{formatVnd(used)}</td><td className="px-5 py-3">{formatVnd(balance)}</td><td className="px-5 py-3">{item.progress_percent}%</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}

        {user && roleDonations.data && (
          <section className="mt-10 rounded-[1.75rem] bg-ink p-5 text-white sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[.17em] text-brand-500">Góc nhìn của bạn · {user.role}</p>
            <h2 className="mt-2 text-2xl font-black">{user.role === "DONOR" ? "Dấu ấn sẻ chia cá nhân" : user.role === "ORGANIZATION" ? "Hiệu quả gây quỹ của tổ chức" : "Tổng quan quản trị nền tảng"}</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <RoleMetric label="Tổng giá trị" value={formatVnd(roleDonations.data.totals.donation_amount)} />
              <RoleMetric label="Số lượt" value={roleDonations.data.totals.donation_count.toLocaleString("vi-VN")} />
              <RoleMetric label="Trung bình" value={formatVnd(roleDonations.data.totals.average_amount)} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function CampaignProgressMobile({ items }: { items: CampaignAnalytics["campaign_progress"] }): JSX.Element {
  return (
    <div className="grid gap-3 border-t border-ink/10 p-4 sm:hidden">
      {items.map((item) => {
        const used = item.used_amount ?? 0;
        const balance = item.transparent_balance ?? Math.max(0, item.raised_amount - used);
        return (
          <article key={item.id} className="rounded-2xl border border-ink/10 p-4">
            <p className="font-black text-ink">{item.title}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sage-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, item.progress_percent)}%` }} /></div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-slate-500">Mục tiêu</dt><dd className="font-black">{formatVnd(item.goal_amount)}</dd></div>
              <div><dt className="text-slate-500">Đã nhận</dt><dd className="font-black">{formatVnd(item.raised_amount)}</dd></div>
              <div><dt className="text-slate-500">Đã sử dụng</dt><dd className="font-black">{formatVnd(used)}</dd></div>
              <div><dt className="text-slate-500">Số dư</dt><dd className="font-black">{formatVnd(balance)}</dd></div>
            </dl>
          </article>
        );
      })}
      {items.length === 0 && <p className="rounded-2xl bg-sage-100 p-4 text-sm text-slate-500">Chưa có chiến dịch để thống kê.</p>}
    </div>
  );
}

function RoleMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="text-xs text-white/55">{label}</p>
      <p className="mt-1 break-words text-2xl font-black">{value}</p>
    </div>
  );
}
