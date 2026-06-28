import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { NotificationPage } from "../../types";

export function NotificationsPage(): JSX.Element {
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL"); const client = useQueryClient();
  const notifications = useQuery({ queryKey: ["notifications", filter], queryFn: () => api<NotificationPage>(`/me/notifications?status=${filter}`) });
  const refresh = (): void => { void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["notification-count"] }); };
  const read = useMutation({ mutationFn: (id: string) => api(`/me/notifications/${id}/read`, { method: "PATCH" }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api("/me/notifications/read-all", { method: "PATCH" }), onSuccess: refresh });
  return <div className="container-page py-10 sm:py-14"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow"><Bell size={16} /> Trung tâm cập nhật</p><h1 className="mt-4 text-3xl font-black sm:text-4xl">Thông báo</h1><p className="mt-2 text-slate-600">{notifications.data?.unread_count ?? 0} thông báo chưa đọc.</p></div><button className="btn-secondary" disabled={!notifications.data?.unread_count || readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck size={18} /> Đánh dấu tất cả đã đọc</button></div>
    <div className="mt-7 flex gap-2">{(["ALL", "UNREAD"] as const).map((item) => <button className={filter === item ? "filter-pill filter-pill-active" : "filter-pill"} key={item} onClick={() => setFilter(item)}>{item === "ALL" ? "Tất cả" : "Chưa đọc"}</button>)}</div>
    <div className="mt-5 space-y-3">{notifications.isLoading && <div className="skeleton h-28" />}{notifications.data?.items.map((item) => <article key={item.id} className={`card flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${item.read_at ? "opacity-70" : "border-brand-300"}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.read_at ? "bg-slate-100" : "bg-brand-100 text-brand-800"}`}><Bell size={19} /></span><div className="min-w-0 flex-1"><Link className="font-black hover:text-brand-700" to={item.path} onClick={() => { if (!item.read_at) read.mutate(item.id); }}>{item.title}</Link><p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p><time className="mt-1 block text-xs text-slate-400">{new Date(item.created_at).toLocaleString("vi-VN")}</time></div>{!item.read_at && <button className="min-h-11 rounded-xl border border-ink/10 px-3 text-sm font-bold hover:bg-sage-100" onClick={() => read.mutate(item.id)}>Đã đọc</button>}</article>)}
      {!notifications.isLoading && notifications.data?.items.length === 0 && <div className="card p-10 text-center text-slate-500">Không có thông báo phù hợp bộ lọc.</div>}
    </div></div>;
}
