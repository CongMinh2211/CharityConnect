import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export function OrganizationApplicationForm(): JSX.Element {
  const client = useQueryClient();
  const [form, setForm] = useState({ legalName: "", registrationNumber: "", description: "" });
  const [document, setDocument] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const body = new FormData(); Object.entries(form).forEach(([key, value]) => body.append(key, value)); if (document) body.append("document", document);
      return api("/organizations/application", { method: "POST", body });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["organization-profile"] })
  });
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); mutation.mutate(); }
  return <form className="card p-6" onSubmit={submit}><h2 className="text-xl font-black">Hồ sơ xác minh tổ chức</h2><p className="mt-2 text-sm text-slate-600">Hồ sơ được liên kết trực tiếp với tài khoản tổ chức và xuất hiện trong hàng đợi Admin trong tối đa 5 giây.</p><label className="mt-5 block"><span className="label">Tên pháp lý</span><input className="input" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} required /></label><label className="mt-4 block"><span className="label">Mã đăng ký</span><input className="input" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} required /></label><label className="mt-4 block"><span className="label">Mô tả</span><textarea className="input min-h-28" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="mt-4 block"><span className="label">Tài liệu xác minh</span><input className="input py-2" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setDocument(e.target.files?.[0] ?? null)} /></label>{mutation.isSuccess && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Đã nộp hồ sơ. Trạng thái sẽ tự cập nhật khi Admin duyệt.</p>}{mutation.isError && <p className="mt-4 text-sm font-semibold text-rose-700">{mutation.error.message}</p>}<button className="btn-primary mt-5" disabled={mutation.isPending}>{mutation.isPending ? "Đang nộp…" : "Nộp hồ sơ"}</button></form>;
}
