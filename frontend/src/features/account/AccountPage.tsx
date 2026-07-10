import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MonitorSmartphone, Save, ShieldCheck, UserRoundCog } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../lib/api";
import type { AccountSession, AuditLogEntry, User } from "../../types";

type Tab = "profile" | "security" | "sessions" | "audit";
type ProfileInput = Pick<User, "name" | "phone" | "province" | "address" | "date_of_birth" | "organization_name">;

const tabs: Array<{ id: Tab; label: string; icon: typeof UserRoundCog }> = [
  { id: "profile", label: "Hồ sơ", icon: UserRoundCog },
  { id: "security", label: "Bảo mật", icon: KeyRound },
  { id: "sessions", label: "Phiên đăng nhập", icon: MonitorSmartphone },
  { id: "audit", label: "Nhật ký của tôi", icon: ShieldCheck },
];

export function AccountPage(): JSX.Element {
  const { user, updateUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [profileMessage, setProfileMessage] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");

  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<User>("/profile"), enabled: Boolean(user) });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<AccountSession[]>("/sessions"), enabled: Boolean(user) && tab === "sessions" });
  const audit = useQuery({ queryKey: ["me-audit"], queryFn: () => api<AuditLogEntry[]>("/me/audit-logs"), enabled: Boolean(user) && tab === "audit" });

  const profileMutation = useMutation({
    mutationFn: (payload: ProfileInput) => api<User>("/profile", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess(nextUser) {
      updateUser(nextUser);
      setProfileMessage("Đã cập nhật hồ sơ.");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: { current_password: string; new_password: string }) => api<{ message: string }>("/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess(data) {
      setSecurityMessage(data.message ?? "Đã đổi mật khẩu.");
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => api<{ message: string }>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const revokeAll = useMutation({
    mutationFn: () => api<{ message: string }>("/sessions", { method: "DELETE" }),
    onSuccess() {
      logout();
    },
  });

  const roleLabel = useMemo(() => user?.role === "DONOR" ? "Người quyên góp" : user?.role === "ORGANIZATION" ? "Tổ chức từ thiện" : "Quản trị viên", [user?.role]);
  const activeUser = profile.data ?? user;

  return (
    <div className="container-page py-8">
      <section className="rounded-[2rem] bg-ink p-6 text-white shadow-card sm:p-8">
        <p className="text-xs font-black uppercase tracking-[.18em] text-brand-500">Account Control</p>
        <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-[-.04em] sm:text-5xl">Tài khoản & bảo mật</h1>
            <p className="mt-3 max-w-2xl text-white/70">Quản lý hồ sơ, đổi mật khẩu, kiểm soát phiên đăng nhập và xem audit cá nhân. Email đăng nhập giữ chỉ đọc để tránh luồng xác minh email thừa.</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="font-black">{activeUser?.name}</p>
            <p className="text-sm text-white/65">{activeUser?.email} · {roleLabel}</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-ink/10 bg-white p-3 shadow-sm">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`mb-2 flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-black ${tab === id ? "bg-brand-500 text-ink" : "hover:bg-sage-100"}`}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </aside>

        <section className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          {tab === "profile" && <ProfileTab user={activeUser} message={profileMessage} loading={profileMutation.isPending} error={profileMutation.error as Error | null} onSubmit={(profile) => profileMutation.mutate(profile)} />}
          {tab === "security" && <SecurityTab message={securityMessage} loading={passwordMutation.isPending} error={passwordMutation.error as Error | null} onSubmit={(payload) => passwordMutation.mutate(payload)} />}
          {tab === "sessions" && <SessionsTab sessions={sessions.data ?? []} loading={sessions.isLoading} error={sessions.error as Error | null} revokeLoading={revokeSession.isPending || revokeAll.isPending} onRevoke={(id) => revokeSession.mutate(id)} onRevokeAll={() => revokeAll.mutate()} />}
          {tab === "audit" && <AuditTab logs={audit.data ?? []} loading={audit.isLoading} error={audit.error as Error | null} />}
        </section>
      </div>
    </div>
  );
}

function ProfileTab({ user, message, loading, error, onSubmit }: { user: User | null | undefined; message: string; loading: boolean; error: Error | null; onSubmit: (profile: ProfileInput) => void }): JSX.Element {
  const [form, setForm] = useState<ProfileInput>({
    name: user?.name ?? "", phone: user?.phone ?? "", province: user?.province ?? "", address: user?.address ?? "",
    date_of_birth: user?.date_of_birth?.slice(0, 10) ?? "", organization_name: user?.organization_name ?? "",
  });
  useEffect(() => {
    setForm({
      name: user?.name ?? "", phone: user?.phone ?? "", province: user?.province ?? "", address: user?.address ?? "",
      date_of_birth: user?.date_of_birth?.slice(0, 10) ?? "", organization_name: user?.organization_name ?? "",
    });
  }, [user?.id, user?.name, user?.phone, user?.province, user?.address, user?.date_of_birth, user?.organization_name]);
  const isOrganization = user?.role === "ORGANIZATION";
  function update<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]): void { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event: FormEvent): void {
    event.preventDefault();
    onSubmit({ ...form, date_of_birth: form.date_of_birth || null, organization_name: isOrganization ? form.organization_name : null });
  }
  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h2 className="text-2xl font-black">Hồ sơ liên hệ</h2>
      <p className="mt-2 text-sm text-slate-500">Bạn tự quản lý thông tin liên hệ. Email đăng nhập chỉ đọc; số điện thoại và địa chỉ không công khai trong chiến dịch, biên nhận hay TrustChain.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><label><span className="label">{isOrganization ? "Người đại diện" : "Họ và tên"}</span><input className="input" value={form.name ?? ""} onChange={(event) => update("name", event.target.value)} minLength={2} required /></label><label><span className="label">Số điện thoại</span><input className="input" type="tel" value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} placeholder="0901234567" /></label></div>
      {isOrganization && <label className="mt-4 block"><span className="label">Tên tổ chức</span><input className="input" value={form.organization_name ?? ""} onChange={(event) => update("organization_name", event.target.value)} placeholder="Quỹ / câu lạc bộ / tổ chức thiện nguyện" /></label>}
      <label className="mt-4 block"><span className="label">Email đăng nhập</span><input className="input mt-2 bg-sage-100 text-slate-500" value={user?.email ?? ""} readOnly /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Tỉnh / thành phố</span><input className="input" value={form.province ?? ""} onChange={(event) => update("province", event.target.value)} placeholder="Đà Nẵng" /></label>{!isOrganization && <label><span className="label">Ngày sinh</span><input className="input" type="date" value={form.date_of_birth ?? ""} onChange={(event) => update("date_of_birth", event.target.value)} /></label>}</div>
      <label className="mt-4 block"><span className="label">Địa chỉ liên hệ</span><input className="input" value={form.address ?? ""} onChange={(event) => update("address", event.target.value)} placeholder="Số nhà, đường, phường/xã" /></label>
      {message && <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800">{message}</p>}
      {error && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error.message}</p>}
      <button className="btn-primary mt-6" disabled={loading}><Save size={18} /> Lưu hồ sơ</button>
    </form>
  );
}

function SecurityTab({ message, loading, error, onSubmit }: { message: string; loading: boolean; error: Error | null; onSubmit: (payload: { current_password: string; new_password: string }) => void }): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (mismatch) return;
    onSubmit({ current_password: currentPassword, new_password: newPassword });
    setCurrentPassword(""); setNewPassword(""); setConfirm("");
  }
  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h2 className="text-2xl font-black">Bảo mật</h2>
      <p className="mt-2 text-sm text-slate-500">Đổi mật khẩu sẽ thu hồi các phiên đăng nhập khác. Mật khẩu nên tối thiểu 8 ký tự.</p>
      <label className="mt-6 block text-sm font-black">Mật khẩu hiện tại</label>
      <input className="input mt-2" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      <label className="mt-4 block text-sm font-black">Mật khẩu mới</label>
      <input className="input mt-2" type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      <label className="mt-4 block text-sm font-black">Nhập lại mật khẩu mới</label>
      <input className="input mt-2" type="password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      {mismatch && <p className="mt-3 text-sm font-bold text-rose-600">Mật khẩu nhập lại chưa khớp.</p>}
      {message && <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800">{message}</p>}
      {error && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error.message}</p>}
      <button className="btn-primary mt-6" disabled={loading || mismatch}><KeyRound size={18} /> Đổi mật khẩu</button>
    </form>
  );
}

function SessionsTab({ sessions, loading, error, revokeLoading, onRevoke, onRevokeAll }: { sessions: AccountSession[]; loading: boolean; error: Error | null; revokeLoading: boolean; onRevoke: (id: string) => void; onRevokeAll: () => void }): JSX.Element {
  if (loading) return <p className="text-sm text-slate-500">Đang tải phiên đăng nhập…</p>;
  if (error) return <p className="text-sm font-bold text-rose-600">{error.message}</p>;
  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h2 className="text-2xl font-black">Phiên đăng nhập</h2><p className="mt-2 text-sm text-slate-500">Thu hồi phiên lạ để giảm rủi ro tài khoản.</p></div>
        <button className="btn-outline" disabled={revokeLoading || !sessions.length} onClick={onRevokeAll}>Đăng xuất tất cả</button>
      </div>
      <div className="mt-5 grid gap-3">
        {sessions.length === 0 && <p className="rounded-2xl bg-sage-100 p-4 text-sm text-slate-500">Chưa có phiên đăng nhập nào. Hãy đăng xuất rồi đăng nhập lại để tạo phiên mới.</p>}
        {sessions.map((session) => (
          <article key={session.id} className="rounded-2xl border border-ink/10 p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <div>
                <p className="font-black">{session.current ? "Phiên hiện tại" : "Thiết bị khác"} {session.revoked_at ? "· Đã thu hồi" : ""}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{session.user_agent ?? "Trình duyệt"} · {session.ip_address ?? "local"}</p>
                <p className="mt-2 text-xs text-slate-500">Tạo lúc {formatDate(session.created_at)}</p>
              </div>
              <button className="btn-outline" disabled={revokeLoading || Boolean(session.revoked_at)} onClick={() => onRevoke(session.id)}>Thu hồi</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AuditTab({ logs, loading, error }: { logs: AuditLogEntry[]; loading: boolean; error: Error | null }): JSX.Element {
  if (loading) return <p className="text-sm text-slate-500">Đang tải audit cá nhân…</p>;
  if (error) return <p className="text-sm font-bold text-rose-600">{error.message}</p>;
  return (
    <div>
      <h2 className="text-2xl font-black">Nhật ký của tôi</h2>
      <p className="mt-2 text-sm text-slate-500">Chỉ hiển thị hành động liên quan đến tài khoản hiện tại. Audit log là dữ liệu bất biến.</p>
      <div className="mt-5 overflow-hidden rounded-2xl border border-ink/10">
        {logs.length === 0 ? <p className="p-4 text-sm text-slate-500">Chưa có audit cá nhân.</p> : logs.map((log) => (
          <div key={log.id} className="grid gap-1 border-b border-ink/10 p-4 last:border-b-0 sm:grid-cols-[180px_1fr]">
            <time className="text-xs text-slate-500">{formatDate(log.created_at)}</time>
            <div><p className="font-black">{log.action}</p><p className="text-xs text-slate-500">{log.entity_type} · {log.entity_id}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
