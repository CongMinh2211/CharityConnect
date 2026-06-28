import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatVnd } from "../lib/api";
import type { Campaign, Donation } from "../types";

const presets = [50_000, 100_000, 200_000, 500_000];

export function DonationPage(): JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [amount, setAmount] = useState(100_000);
  const [anonymous, setAnonymous] = useState(false);
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => api<Campaign>(`/campaigns/${id}`) });
  const donation = useMutation({
    mutationFn: () => api<Donation>("/donations", { method: "POST", body: JSON.stringify({ campaign_id: id, amount, anonymous }) }),
    onSuccess: (result) => navigate(`/bien-nhan/${result.id}`, { state: { emailQueued: true } })
  });
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); donation.mutate(); }
  return (
    <div className="container-page max-w-2xl py-10">
      <form className="card p-6 sm:p-9" onSubmit={submit}>
        <p className="font-bold text-brand-700">Quyên góp mô phỏng</p><h1 className="mt-1 text-3xl font-black">{campaign.data?.title ?? "Chiến dịch"}</h1>
        <p className="mt-2 text-slate-600">Không kết nối cổng thanh toán thật. Giao dịch hoàn tất ngay để phục vụ demo.</p>
        <fieldset className="mt-8"><legend className="label">Chọn số tiền</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{presets.map((value) => <button type="button" key={value} onClick={() => setAmount(value)} className={amount === value ? "btn-primary" : "btn-secondary"}>{formatVnd(value)}</button>)}</div></fieldset>
        <label className="mt-5 block"><span className="label">Số tiền khác (VND)</span><input className="input" type="number" min={1000} step={1000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} required /></label>
        <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4"><input className="mt-1 h-4 w-4" type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span><strong>Quyên góp ẩn danh</strong><span className="mt-1 block text-sm text-slate-600">Tổ chức sẽ chỉ thấy “Ẩn danh”; quản trị hệ thống vẫn lưu danh tính để đối soát.</span></span></label>
        {donation.isError && <p className="mt-4 text-sm font-semibold text-rose-700">{donation.error.message}</p>}
        <button className="btn-primary mt-7 w-full" disabled={donation.isPending || amount < 1000}>{donation.isPending ? "Đang xử lý…" : `Xác nhận ${formatVnd(amount)}`}</button>
      </form>
    </div>
  );
}
