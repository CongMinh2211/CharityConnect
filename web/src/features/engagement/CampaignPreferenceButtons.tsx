import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../lib/api";
import type { CampaignPreference } from "../../types";

export function CampaignPreferenceButtons({ campaignId, compact = false }: { campaignId: string; compact?: boolean }): JSX.Element {
  const { user } = useAuth(); const navigate = useNavigate(); const client = useQueryClient();
  const preference = useQuery({ queryKey: ["campaign-preference", campaignId], queryFn: () => api<CampaignPreference>(`/me/campaign-preferences/${campaignId}`), enabled: user?.role === "DONOR" });
  const update = useMutation({
    mutationFn: (next: Pick<CampaignPreference, "saved" | "following">) => api<CampaignPreference>(`/me/campaign-preferences/${campaignId}`, { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: (data) => { client.setQueryData(["campaign-preference", campaignId], data); void client.invalidateQueries({ queryKey: ["campaign-preferences"] }); }
  });
  const ensureDonor = (): boolean => { if (user?.role === "DONOR") return true; navigate("/dang-nhap", { state: { notice: "Đăng nhập tài khoản người quyên góp để lưu hoặc theo dõi chiến dịch." } }); return false; };
  const current = preference.data ?? { campaign_id: campaignId, saved: false, following: false };
  const buttonClass = compact ? "inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 text-sm font-bold hover:bg-brand-50" : "btn-secondary flex-1";
  return <div className="flex flex-wrap gap-2" aria-label="Tùy chọn chiến dịch">
    <button type="button" className={buttonClass} aria-pressed={current.saved} disabled={update.isPending} onClick={() => { if (ensureDonor()) update.mutate({ saved: !current.saved, following: current.following }); }}><Heart size={17} className={current.saved ? "fill-rose-500 text-rose-500" : ""} />{current.saved ? "Đã lưu" : "Lưu"}</button>
    <button type="button" className={buttonClass} aria-pressed={current.following} disabled={update.isPending} onClick={() => { if (ensureDonor()) update.mutate({ saved: current.saved, following: !current.following }); }}>{current.following ? <BellOff size={17} /> : <Bell size={17} />}{current.following ? "Bỏ theo dõi" : "Theo dõi"}</button>
  </div>;
}
