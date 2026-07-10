import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, HeartHandshake, MailCheck, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { api, isMockMode } from "../lib/api";
import type { AuthPayload, Role } from "../types";

type RegisterRole = Exclude<Role, "ADMIN">;

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", province: "", address: "", date_of_birth: "", organization_name: "",
    password: "", confirmPassword: "", role: "DONOR" as RegisterRole, terms_accepted: false,
  });
  const [validationError, setValidationError] = useState("");
  const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID) && !isMockMode;
  const profilePayload = () => ({
    name: form.name, phone: form.phone, province: form.province, address: form.address,
    date_of_birth: form.role === "DONOR" && form.date_of_birth ? form.date_of_birth : undefined,
    organization_name: form.role === "ORGANIZATION" ? form.organization_name : undefined,
  });
  const finishRegistration = (payload: AuthPayload) => {
    login(payload);
    navigate(payload.user.role === "ORGANIZATION" ? "/to-chuc" : "/", { state: { notice: "Tài khoản đã tạo thành công. Email chào mừng đã được xếp gửi." } });
  };
  const mutation = useMutation({
    mutationFn: () => api<AuthPayload>("/auth/register", { method: "POST", body: JSON.stringify({ ...profilePayload(), email: form.email, password: form.password, role: form.role, terms_accepted: form.terms_accepted }) }),
    onSuccess: finishRegistration,
  });
  const googleMutation = useMutation({
    mutationFn: (credential: string) => api<AuthPayload>("/auth/google", { method: "POST", body: JSON.stringify({ ...profilePayload(), credential, role: form.role, terms_accepted: form.terms_accepted }) }),
    onSuccess: finishRegistration,
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (form.password !== form.confirmPassword) { setValidationError("Mật khẩu xác nhận chưa khớp."); return; }
    if (!form.terms_accepted) { setValidationError("Bạn cần đồng ý điều khoản sử dụng."); return; }
    if (form.role === "ORGANIZATION" && !form.organization_name.trim()) { setValidationError("Vui lòng nhập tên tổ chức."); return; }
    setValidationError(""); mutation.mutate();
  }
  const error = validationError || mutation.error?.message || googleMutation.error?.message;

  return <div className="container-page py-8 lg:py-14"><div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-ink/10 bg-white shadow-card lg:grid-cols-[.8fr_1.2fr]">
    <aside className="bg-ink p-8 text-white sm:p-10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-ink"><HeartHandshake size={27} /></span><p className="mt-8 text-xs font-extrabold uppercase tracking-[.18em] text-brand-500">Hồ sơ riêng tư · minh bạch công khai</p><h1 className="mt-3 text-4xl font-black leading-tight">Bắt đầu hành trình thiện nguyện minh bạch.</h1><p className="mt-4 text-sm leading-6 text-white/65">Thông tin liên hệ giúp bảo vệ tài khoản và gửi biên nhận. Tên, số điện thoại và địa chỉ của bạn không xuất hiện trên chiến dịch, biên nhận công khai hay TrustChain.</p><ul className="mt-8 space-y-4 text-sm text-white/75"><li className="flex gap-3"><ShieldCheck className="shrink-0 text-brand-500" size={20} /> Theo dõi đóng góp bằng biên nhận và hash-chain.</li><li className="flex gap-3"><MailCheck className="shrink-0 text-brand-500" size={20} /> Nhận email chào mừng và cảm ơn sau mỗi lần đóng góp.</li><li className="flex gap-3"><CheckCircle2 className="shrink-0 text-brand-500" size={20} /> Tổ chức có quy trình xác minh rõ ràng.</li></ul></aside>
    <form className="p-6 sm:p-10" onSubmit={submit}><p className="text-sm font-bold text-brand-700">Đăng ký CharityConnect</p><h2 className="mt-1 text-3xl font-black">Tạo hồ sơ của bạn</h2><p className="mt-2 text-sm text-slate-500">Điền đúng thông tin liên hệ để quản lý tài khoản và nhận thông báo.</p>
      <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Loại tài khoản">{(["DONOR", "ORGANIZATION"] as const).map((role) => <button key={role} type="button" role="radio" aria-checked={form.role === role} className={form.role === role ? "btn-primary" : "btn-secondary"} onClick={() => update("role", role)}>{role === "DONOR" ? "Người quyên góp" : "Tổ chức"}</button>)}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="label">{form.role === "ORGANIZATION" ? "Người đại diện" : "Họ và tên"}</span><input className="input" autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} required /></label><label><span className="label">Số điện thoại</span><input className="input" type="tel" autoComplete="tel" placeholder="0901234567" pattern="[0-9+ -]{8,20}" value={form.phone} onChange={(event) => update("phone", event.target.value)} required /></label></div>
      {form.role === "ORGANIZATION" && <label className="mt-4 block"><span className="label">Tên tổ chức</span><input className="input" autoComplete="organization" placeholder="Quỹ / câu lạc bộ / tổ chức thiện nguyện" value={form.organization_name} onChange={(event) => update("organization_name", event.target.value)} required /></label>}
      <label className="mt-4 block"><span className="label">Email đăng nhập</span><input className="input" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} required /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Tỉnh / thành phố</span><input className="input" autoComplete="address-level1" placeholder="Đà Nẵng" value={form.province} onChange={(event) => update("province", event.target.value)} required /></label>{form.role === "DONOR" && <label><span className="label">Ngày sinh <em className="font-normal text-slate-400">(không bắt buộc)</em></span><input className="input" type="date" autoComplete="bday" value={form.date_of_birth} onChange={(event) => update("date_of_birth", event.target.value)} /></label>}</div>
      <label className="mt-4 block"><span className="label">Địa chỉ liên hệ</span><input className="input" autoComplete="street-address" placeholder="Số nhà, đường, phường/xã" value={form.address} onChange={(event) => update("address", event.target.value)} required /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Mật khẩu</span><input className="input" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => update("password", event.target.value)} required /></label><label><span className="label">Xác nhận mật khẩu</span><input className="input" type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} required /></label></div>
      <label className="mt-5 flex items-start gap-3 rounded-xl bg-sage-100 p-4 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={form.terms_accepted} onChange={(event) => update("terms_accepted", event.target.checked)} /><span>Tôi đồng ý điều khoản sử dụng và chính sách bảo vệ dữ liệu.</span></label>
      {error && <p className="mt-4 text-sm font-semibold text-rose-700" role="alert">{error}</p>}<button className="btn-primary mt-6 w-full" disabled={mutation.isPending || googleMutation.isPending}>{mutation.isPending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}</button>
      {googleEnabled && <><div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[.12em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />hoặc<span className="h-px flex-1 bg-slate-200" /></div>{form.terms_accepted ? <GoogleSignInButton mode="signup" disabled={mutation.isPending || googleMutation.isPending} onCredential={(credential) => googleMutation.mutate(credential)} /> : <p className="rounded-xl bg-sage-100 p-3 text-center text-xs text-slate-600">Đồng ý điều khoản để tiếp tục nhanh với Google.</p>}</>}
      <p className="mt-5 text-center text-sm text-slate-500">Đã có tài khoản? <Link className="font-bold text-brand-700" to="/dang-nhap">Đăng nhập</Link></p></form>
  </div></div>;
}
