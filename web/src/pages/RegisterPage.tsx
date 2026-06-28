import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, HeartHandshake, MailCheck, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { AuthPayload, Role } from "../types";

type RegisterRole = Exclude<Role, "ADMIN">;

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "DONOR" as RegisterRole, terms_accepted: false });
  const [validationError, setValidationError] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<AuthPayload>("/auth/register", { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role, terms_accepted: form.terms_accepted }) }),
    onSuccess(payload) {
      login(payload);
      navigate(payload.user.role === "ORGANIZATION" ? "/to-chuc" : "/", { state: { notice: "Tài khoản đã tạo thành công. Email chào mừng đã được xếp gửi." } });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (form.password !== form.confirmPassword) { setValidationError("Mật khẩu xác nhận chưa khớp."); return; }
    if (!form.terms_accepted) { setValidationError("Bạn cần đồng ý điều khoản sử dụng."); return; }
    setValidationError(""); mutation.mutate();
  }

  return <div className="container-page py-10 lg:py-16"><div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-ink/10 bg-white shadow-card lg:grid-cols-[.9fr_1.1fr]">
    <aside className="bg-ink p-8 text-white sm:p-10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-ink"><HeartHandshake size={27} /></span><p className="mt-8 text-xs font-extrabold uppercase tracking-[.18em] text-brand-500">Một tài khoản · nhiều cách sẻ chia</p><h1 className="mt-3 text-4xl font-black leading-tight">Bắt đầu hành trình thiện nguyện minh bạch.</h1><ul className="mt-8 space-y-4 text-sm text-white/75"><li className="flex gap-3"><ShieldCheck className="shrink-0 text-brand-500" size={20} /> Theo dõi đóng góp bằng biên nhận và hash-chain.</li><li className="flex gap-3"><MailCheck className="shrink-0 text-brand-500" size={20} /> Nhận email chào mừng và cảm ơn sau mỗi lần đóng góp.</li><li className="flex gap-3"><CheckCircle2 className="shrink-0 text-brand-500" size={20} /> Tổ chức có quy trình xác minh rõ ràng.</li></ul></aside>
    <form className="p-7 sm:p-10" onSubmit={submit}><p className="text-sm font-bold text-brand-700">Đăng ký CharityConnect</p><h2 className="mt-1 text-3xl font-black">Tạo tài khoản</h2><div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Loại tài khoản">{(["DONOR", "ORGANIZATION"] as const).map((role) => <button key={role} type="button" role="radio" aria-checked={form.role === role} className={form.role === role ? "btn-primary" : "btn-secondary"} onClick={() => setForm({ ...form, role })}>{role === "DONOR" ? "Người quyên góp" : "Tổ chức"}</button>)}</div><label className="mt-5 block"><span className="label">Họ tên / tên đại diện</span><input className="input" autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="mt-4 block"><span className="label">Email</span><input className="input" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Mật khẩu</span><input className="input" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label><span className="label">Xác nhận mật khẩu</span><input className="input" type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></label></div><label className="mt-5 flex items-start gap-3 rounded-xl bg-sage-100 p-4 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={form.terms_accepted} onChange={(event) => setForm({ ...form, terms_accepted: event.target.checked })} /><span>Tôi đồng ý điều khoản sử dụng và chính sách bảo vệ dữ liệu.</span></label>{(validationError || mutation.isError) && <p className="mt-4 text-sm font-semibold text-rose-700" role="alert">{validationError || mutation.error?.message}</p>}<button className="btn-primary mt-6 w-full" disabled={mutation.isPending}>{mutation.isPending ? "Đang tạo tài khoản…" : "Đăng ký"}</button><p className="mt-5 text-center text-sm text-slate-500">Đã có tài khoản? <Link className="font-bold text-brand-700" to="/dang-nhap">Đăng nhập</Link></p></form>
  </div></div>;
}
