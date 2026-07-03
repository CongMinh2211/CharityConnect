import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Campaign } from "../types";

interface CampaignFormProps {
  campaign?: Campaign | null;
  onDone?: () => void;
}

const categories = [
  { value: "COMMUNITY", label: "Cộng đồng" },
  { value: "HEALTH", label: "Y tế" },
  { value: "EDUCATION", label: "Giáo dục" },
  { value: "EMERGENCY", label: "Khẩn cấp" },
  { value: "ENVIRONMENT", label: "Môi trường" },
];

function toLocalInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function normalizeCategory(value?: string): string {
  return categories.some((item) => item.value === value) ? value! : "COMMUNITY";
}

export function CampaignForm({ campaign, onDone }: CampaignFormProps): JSX.Element {
  const client = useQueryClient();
  const editing = Boolean(campaign);
  const initial = useMemo(() => ({
    title: campaign?.title ?? "",
    summary: campaign?.summary ?? "",
    description: campaign?.description ?? "",
    category: normalizeCategory(campaign?.category),
    goalAmount: campaign?.goal_amount ?? 10_000_000,
    endDate: toLocalInput(campaign?.end_date),
  }), [campaign]);
  const [form, setForm] = useState(initial);

  useEffect(() => setForm(initial), [initial]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
      return api(editing ? `/organization/campaigns/${campaign!.id}` : "/organization/campaigns", { method: editing ? "PUT" : "POST", body });
    },
    onSuccess: () => {
      setForm({ title: "", summary: "", description: "", category: "COMMUNITY", goalAmount: 10_000_000, endDate: "" });
      void client.invalidateQueries({ queryKey: ["organization-campaigns"] });
      onDone?.();
    }
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form className="card p-6" onSubmit={submit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{editing ? "Chỉnh sửa bản nháp" : "Tạo chiến dịch"}</h2>
          <p className="mt-1 text-xs text-slate-500">{editing ? "Chỉ chiến dịch DRAFT/REJECTED được sửa trực tiếp." : "Lưu bản nháp trước, sau đó lập ngân sách và nộp duyệt."}</p>
        </div>
        {editing && <button type="button" className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-black hover:bg-sage-100" onClick={onDone}>Hủy</button>}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Tên chiến dịch</span><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={5} required /></label>
        <label className="sm:col-span-2"><span className="label">Tóm tắt</span><textarea className="input min-h-20" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} minLength={10} required /></label>
        <label className="sm:col-span-2"><span className="label">Nội dung</span><textarea className="input min-h-36" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} minLength={30} required /></label>
        <label><span className="label">Danh mục</span><select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span className="label">Mục tiêu (VND)</span><input className="input" type="number" min={1000} step={1000} value={form.goalAmount} onChange={(event) => setForm({ ...form, goalAmount: Number(event.target.value) })} required /></label>
        <label><span className="label">Ngày kết thúc</span><input className="input" type="datetime-local" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></label>
      </div>
      {mutation.isError && <p className="mt-4 text-sm font-semibold text-rose-700">{mutation.error.message}</p>}
      <button className="btn-primary mt-5" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : editing ? "Cập nhật bản nháp" : "Lưu bản nháp"}</button>
    </form>
  );
}

