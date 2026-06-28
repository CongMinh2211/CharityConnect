import { useMutation } from "@tanstack/react-query";
import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, isMockMode } from "../lib/api";
import type { AuthPayload } from "../types";

const demoAccounts = [
  { label: "NgÆ°á»i quyÃªn gÃ³p", email: "donor@demo.vn", icon: UserRound, note: "QuyÃªn gÃ³p, biÃªn nháº­n, lá»‹ch sá»­" },
  { label: "Tá»• chá»©c", email: "org@demo.vn", icon: Building2, note: "Táº¡o vÃ  ná»™p duyá»‡t chiáº¿n dá»‹ch" },
  { label: "Quáº£n trá»‹ viÃªn", email: "admin@demo.vn", icon: ShieldCheck, note: "XÃ¡c minh vÃ  kiá»ƒm duyá»‡t" }
];

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({ mutationFn: () => api<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }), onSuccess(payload) { login(payload); navigate(payload.user.role === "ADMIN" ? "/quan-tri" : payload.user.role === "ORGANIZATION" ? "/to-chuc" : "/"); } });
  function submit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); mutation.mutate(); }
  function chooseDemo(accountEmail: string): void { setEmail(accountEmail); setPassword("Demo@123"); }
  return (
    <div className="container-page py-10 lg:py-16">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-ink/10 bg-white lg:grid-cols-[.95fr_1.05fr]">
        <section className="bg-ink p-8 text-white sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-brand-500">{isMockMode ? "TrÃ¬nh diá»…n Ä‘á»§ 3 vai trÃ²" : "ChÃ o má»«ng trá»Ÿ láº¡i"}</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em]">ÄÄƒng nháº­p Ä‘á»ƒ tiáº¿p tá»¥c hÃ nh trÃ¬nh.</h1>
          <p className="mt-4 leading-7 text-white/65">Má»—i vai trÃ² chá»‰ tháº¥y Ä‘Ãºng cÃ´ng viá»‡c cá»§a mÃ¬nh. Trong cháº¿ Ä‘á»™ demo, chá»n má»™t tÃ i khoáº£n Ä‘á»ƒ tá»± Ä‘iá»n thÃ´ng tin.</p>
          {isMockMode && <div className="mt-8 space-y-3">{demoAccounts.map(({ label, email: accountEmail, icon: Icon, note }) => <button type="button" className="flex w-full items-center gap-4 rounded-2xl border border-white/15 p-4 text-left transition hover:border-brand-500 hover:bg-white/5" onClick={() => chooseDemo(accountEmail)} key={accountEmail}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink"><Icon size={20} /></span><span><strong className="block">{label}</strong><span className="mt-0.5 block text-xs text-white/55">{note}</span></span></button>)}</div>}
        </section>
        <form className="p-8 sm:p-10" onSubmit={submit}>
          <h2 className="text-2xl font-black text-ink">ThÃ´ng tin Ä‘Äƒng nháº­p</h2>
          {isMockMode && <p className="mt-2 text-sm text-slate-500">Máº­t kháº©u chung: <code className="rounded bg-sage-100 px-2 py-1 font-bold text-ink">Demo@123</code></p>}
          <label className="mt-8 block"><span className="label">Email</span><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.vn" required /></label>
          <label className="mt-5 block"><span className="label">Máº­t kháº©u</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {mutation.isError && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{mutation.error.message}</p>}
          <button className="btn-primary mt-7 w-full" disabled={mutation.isPending}>{mutation.isPending ? "Äang Ä‘Äƒng nháº­pâ€¦" : "ÄÄƒng nháº­p"}</button>
          <p className="mt-4 text-center text-sm"><Link className="font-bold text-brand-700" to="/quen-mat-khau">Quên mật khẩu?</Link></p>
          <p className="mt-6 text-center text-sm text-slate-600">ChÆ°a cÃ³ tÃ i khoáº£n? <Link className="font-bold text-brand-700" to="/dang-ky">ÄÄƒng kÃ½</Link></p>
        </form>
      </div>
    </div>
  );
}

