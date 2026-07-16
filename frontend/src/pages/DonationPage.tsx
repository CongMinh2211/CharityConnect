import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatVnd } from "../lib/api";
import type { Campaign, Donation } from "../types";

const presets = [50_000, 100_000, 200_000, 500_000];
const MIN_AMOUNT = 1_000;
const MAX_AMOUNT = 1_000_000_000;
const REVIEW_THRESHOLD = 50_000_000;

function daysLeft(endDate?: string): number | null {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export function DonationPage(): JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(100_000);
  const [anonymous, setAnonymous] = useState(false);
  const [honorConsent, setHonorConsent] = useState(false);
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => api<Campaign>(`/campaigns/${id}`) });
  const donation = useMutation({
    mutationFn: () => api<Donation>("/donations", { method: "POST", body: JSON.stringify({ campaign_id: id, amount, anonymous, honor_consent: honorConsent && !anonymous }) }),
    onSuccess: (result) => {
      if (result.status === "PENDING_REVIEW") {
        void queryClient.invalidateQueries({ queryKey: ["donation-history"], refetchType: "none" });
        navigate("/lich-su", { state: { pendingReview: true } });
        return;
      }
      const expectedRaised = (campaign.data?.raised_amount ?? 0) + result.amount;
      queryClient.setQueryData<Campaign>(["campaign", id], (current) => current
        ? { ...current, raised_amount: Math.max(current.raised_amount, expectedRaised) }
        : current);
      queryClient.setQueriesData<Campaign[]>({ queryKey: ["campaigns"] }, (current) => current?.map((item) => item.id === id
        ? { ...item, raised_amount: Math.max(item.raised_amount, expectedRaised) }
        : item));

      // Các màn hình tổng hợp sẽ đọc lại dữ liệu mới khi người dùng mở chúng.
      for (const queryKey of [
        ["analytics-donations-public"], ["analytics-campaigns-public"], ["analytics-donations-role"],
        ["donation-history"], ["public-ledger"], ["ledger-verification"], ["transparency-campaigns"],
        ["home-role", "donations"],
      ]) void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
      queryClient.removeQueries({ queryKey: ["campaign-contract", id] });
      navigate(`/bien-nhan/${result.id}`, { state: { emailQueued: true } });
    }
  });
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); donation.mutate(); }

  const data = campaign.data;
  const goal = data?.goal_amount ?? 0;
  const raised = data?.raised_amount ?? 0;
  const percent = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const remaining = Math.max(0, goal - raised);
  const left = daysLeft(data?.end_date);
  const validAmount = Number.isFinite(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
  const projected = goal > 0 ? Math.min(100, ((raised + (validAmount ? amount : 0)) / goal) * 100) : 0;

  return (
    <div className="container-page max-w-2xl py-10">
      {campaign.isLoading ? (
        <div className="card p-6 sm:p-9"><div className="skeleton h-7 w-2/3" /><div className="skeleton mt-4 h-3 w-full" /><div className="skeleton mt-6 h-40 w-full" /></div>
      ) : (
        <form className="card p-6 sm:p-9" onSubmit={submit}>
          <p className="font-bold text-brand-700">Quyên góp an toàn</p>
          <h1 className="mt-1 text-3xl font-black">{data?.title ?? "Chiến dịch"}</h1>
          {data?.organization_name && <p className="mt-1 text-sm text-slate-500">Tổ chức: {data.organization_name}</p>}
          <p className="mt-2 text-slate-600">Khoản thường được xác nhận tức thì và ghi vào sổ cái minh bạch; khoản lớn sẽ qua bước quản trị viên xác minh.</p>

          {goal > 0 && (
            <div className="mt-6 rounded-2xl bg-sage-100/60 p-4">
              <div className="flex items-end justify-between gap-3">
                <div><span className="text-2xl font-black text-ink">{formatVnd(raised)}</span><span className="text-sm text-slate-600"> / {formatVnd(goal)}</span></div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-brand-700">{percent.toFixed(1)}%</span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ chiến dịch">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-xs font-semibold text-slate-600">
                <span>Còn thiếu {formatVnd(remaining)}</span>
                {left !== null && <span>{left > 0 ? `Còn ${left} ngày` : "Đã kết thúc"}</span>}
              </div>
            </div>
          )}

          <fieldset className="mt-8"><legend className="label">Chọn số tiền</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{presets.map((value) => <button type="button" key={value} onClick={() => setAmount(value)} className={amount === value ? "btn-primary" : "btn-secondary"} aria-pressed={amount === value}>{formatVnd(value)}</button>)}</div>
          </fieldset>
          <label className="mt-5 block"><span className="label">Số tiền khác (VND)</span>
            <input className="input" type="number" min={MIN_AMOUNT} max={MAX_AMOUNT} step={1000} value={Number.isFinite(amount) ? amount : ""} onChange={(event) => setAmount(Math.floor(Number(event.target.value)))} aria-invalid={!validAmount} required />
            {!validAmount && <span className="mt-2 block text-sm font-semibold text-amber-700">Số tiền phải từ {formatVnd(MIN_AMOUNT)} đến {formatVnd(MAX_AMOUNT)}.</span>}
          </label>

          {goal > 0 && validAmount && (
            <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">Sau đóng góp này, chiến dịch đạt {projected.toFixed(1)}% mục tiêu.</p>
          )}

          {validAmount && amount >= REVIEW_THRESHOLD && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Khoản từ {formatVnd(REVIEW_THRESHOLD)} trở lên sẽ được quản trị viên xác minh trước khi ghi nhận công khai — chưa cộng vào chiến dịch cho tới khi được duyệt.</p>
          )}

          <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span><strong>Quyên góp ẩn danh</strong><span className="mt-1 block text-sm text-slate-600">Tổ chức sẽ chỉ thấy “Ẩn danh”; quản trị hệ thống vẫn lưu danh tính để đối soát.</span></span></label>
          <label className={`mt-3 flex items-start gap-3 rounded-xl bg-slate-50 p-4 ${anonymous ? "opacity-50" : ""}`}><input className="mt-1 h-4 w-4" type="checkbox" checked={honorConsent && !anonymous} disabled={anonymous} onChange={(event) => setHonorConsent(event.target.checked)} /><span><strong>Cho phép vinh danh tên tôi công khai</strong><span className="mt-1 block text-sm text-slate-600">Tên bạn sẽ xuất hiện trên bảng “Tấm lòng vàng”. Không chọn thì bạn được ghi nhận là “Nhà hảo tâm ẩn danh”.</span></span></label>
          {donation.isError && <p className="mt-4 text-sm font-semibold text-rose-700">{donation.error.message}</p>}
          <button className="btn-primary mt-7 w-full" disabled={donation.isPending || !validAmount}>{donation.isPending ? "Đang xử lý…" : `Xác nhận ${formatVnd(validAmount ? amount : 0)}`}</button>
        </form>
      )}
    </div>
  );
}
