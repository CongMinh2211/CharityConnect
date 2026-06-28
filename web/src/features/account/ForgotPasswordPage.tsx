import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, isMockMode } from "../../lib/api";

export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<{ message: string; demo_token?: string }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }),
  });
  function submit(event: FormEvent): void {
    event.preventDefault();
    mutation.mutate();
  }
  return (
    <div className="container-page py-10 lg:py-16">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-ink/10 bg-white p-8 shadow-card sm:p-10">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500"><MailCheck size={25} /></span>
        <h1 className="mt-6 text-3xl font-black">Quên mật khẩu</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Nhập email tài khoản. Hệ thống luôn trả thông báo chung để tránh dò tài khoản.</p>
        <form className="mt-7" onSubmit={submit}>
          <label className="block"><span className="label">Email</span><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <button className="btn-primary mt-6 w-full" disabled={mutation.isPending}>{mutation.isPending ? "Đang xử lý…" : "Gửi hướng dẫn"}</button>
        </form>
        {mutation.data && (
          <div className="mt-5 rounded-2xl bg-brand-50 p-4 text-sm">
            <p className="font-bold text-brand-800">{mutation.data.message}</p>
            {isMockMode && mutation.data.demo_token && <p className="mt-2 break-all text-slate-600">Token demo: <Link className="font-black text-brand-700" to={`/dat-lai-mat-khau?token=${encodeURIComponent(mutation.data.demo_token)}`}>{mutation.data.demo_token}</Link></p>}
          </div>
        )}
        {mutation.error && <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{mutation.error.message}</p>}
        <p className="mt-6 text-center text-sm text-slate-500"><Link className="font-bold text-brand-700" to="/dang-nhap">Quay lại đăng nhập</Link></p>
      </div>
    </div>
  );
}

