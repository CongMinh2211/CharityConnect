import { useMutation } from "@tanstack/react-query";
import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { AuthPayload } from "../types";

const quickAccounts = [
  { label: "Người quyên góp", email: "donor@demo.vn", icon: UserRound, note: "Quyên góp, biên nhận, lịch sử" },
  { label: "Tổ chức", email: "org@demo.vn", icon: Building2, note: "Tạo và nộp duyệt chiến dịch" },
  { label: "Quản trị viên", email: "admin@demo.vn", icon: ShieldCheck, note: "Xác minh và kiểm duyệt" }
];

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({ mutationFn: () => api<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }), onSuccess(payload) { login(payload); navigate(payload.user.role === "ADMIN" ? "/quan-tri" : payload.user.role === "ORGANIZATION" ? "/to-chuc" : "/"); } });
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); mutation.mutate(); }
  function chooseAccount(accountEmail: string): void {
    const publicEmails: Record<string, string> = {
      "donor@demo.vn": "nguoituthien@charityconnect.vn",
      "org@demo.vn": "tochuc@charityconnect.vn",
      "admin@demo.vn": "quantri@charityconnect.vn",
    };
    setEmail(publicEmails[accountEmail] ?? accountEmail);
    setPassword("Demo@123");
  }
  return (
    <div className="container-page py-10 lg:py-16">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-ink/10 bg-white lg:grid-cols-[.95fr_1.05fr]">
        <section className="bg-ink p-8 text-white sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-brand-500">Ba vai trò, một nền tảng</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em]">Đăng nhập để tiếp tục hành trình.</h1>
          <p className="mt-4 leading-7 text-white/65">Mỗi vai trò chỉ thấy đúng công việc của mình. Chọn nhanh một vai trò để tự điền thông tin đăng nhập.</p>
          <div className="mt-8 space-y-3">{quickAccounts.map(({ label, email: accountEmail, icon: Icon, note }) => <button type="button" className="flex w-full items-center gap-4 rounded-2xl border border-white/15 p-4 text-left transition hover:border-brand-500 hover:bg-white/5" onClick={() => chooseAccount(accountEmail)} key={accountEmail}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink"><Icon size={20} /></span><span><strong className="block">{label}</strong><span className="mt-0.5 block text-xs text-white/55">{note}</span></span></button>)}</div>
        </section>
        <form className="p-8 sm:p-10" onSubmit={submit}>
          <h2 className="text-2xl font-black text-ink">Thông tin đăng nhập</h2>
          <p className="mt-2 text-sm text-slate-500">Bạn có thể chọn nhanh một vai trò ở khung bên trái hoặc nhập email tài khoản.</p>
          <label className="mt-8 block"><span className="label">Email</span><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.vn" required /></label>
          <label className="mt-5 block"><span className="label">Mật khẩu</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {mutation.isError && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{mutation.error.message}</p>}
          <button className="btn-primary mt-7 w-full" disabled={mutation.isPending}>{mutation.isPending ? "Đang đăng nhập…" : "Đăng nhập"}</button>
          <p className="mt-4 text-center text-sm"><Link className="font-bold text-brand-700" to="/quen-mat-khau">Quên mật khẩu?</Link></p>
          <p className="mt-6 text-center text-sm text-slate-600">Chưa có tài khoản? <Link className="font-bold text-brand-700" to="/dang-ky">Đăng ký</Link></p>
        </form>
      </div>
    </div>
  );
}
