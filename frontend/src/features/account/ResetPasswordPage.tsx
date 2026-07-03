import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

export function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const token = params.get("token") ?? "";
  const mutation = useMutation({
    mutationFn: () => api<{ message: string }>("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }),
    onSuccess: () => window.setTimeout(() => navigate("/dang-nhap", { state: { notice: "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại." } }), 800),
  });
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!token || mismatch) return;
    mutation.mutate();
  }
  return (
    <div className="container-page py-10 lg:py-16">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-ink/10 bg-white p-8 shadow-card sm:p-10">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500"><KeyRound size={25} /></span>
        <h1 className="mt-6 text-3xl font-black">Đặt lại mật khẩu</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Liên kết chỉ dùng một lần. Sau khi đặt lại, các phiên đăng nhập cũ sẽ bị thu hồi.</p>
        {!token && <p className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">Thiếu token đặt lại mật khẩu.</p>}
        <form className="mt-7" onSubmit={submit}>
          <label className="block"><span className="label">Mật khẩu mới</span><input className="input" type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label className="mt-4 block"><span className="label">Nhập lại mật khẩu mới</span><input className="input" type="password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
          {mismatch && <p className="mt-3 text-sm font-bold text-rose-600">Mật khẩu nhập lại chưa khớp.</p>}
          <button className="btn-primary mt-6 w-full" disabled={!token || mismatch || mutation.isPending}>{mutation.isPending ? "Đang cập nhật…" : "Đặt lại mật khẩu"}</button>
        </form>
        {mutation.data && <p className="mt-5 rounded-2xl bg-brand-50 p-4 text-sm font-bold text-brand-800">{mutation.data.message}</p>}
        {mutation.error && <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{mutation.error.message}</p>}
        <p className="mt-6 text-center text-sm text-slate-500"><Link className="font-bold text-brand-700" to="/dang-nhap">Quay lại đăng nhập</Link></p>
      </div>
    </div>
  );
}

