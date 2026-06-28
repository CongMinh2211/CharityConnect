import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { CampaignCard } from "../../components/CampaignCard";
import { api } from "../../lib/api";
import type { Campaign, CampaignPreference } from "../../types";
import { CampaignPreferenceButtons } from "./CampaignPreferenceButtons";

export function FavoritesPage(): JSX.Element {
  const preferences = useQuery({ queryKey: ["campaign-preferences"], queryFn: () => api<CampaignPreference[]>("/me/campaign-preferences") });
  const campaigns = useQuery({ queryKey: ["campaigns", "favorites"], queryFn: () => api<Campaign[]>("/campaigns") });
  const saved = campaigns.data?.filter((campaign) => preferences.data?.some((item) => item.campaign_id === campaign.id && item.saved)) ?? [];
  return <div className="container-page py-10 sm:py-14"><div className="max-w-2xl"><p className="eyebrow"><Heart size={16} /> Người quyên góp</p><h1 className="mt-4 text-3xl font-black sm:text-4xl">Chiến dịch đã lưu</h1><p className="mt-3 text-slate-600">Giữ lại các chiến dịch bạn quan tâm; bật theo dõi khi muốn nhận cập nhật trong web và email.</p></div>
    {(preferences.isLoading || campaigns.isLoading) && <div className="mt-8 grid gap-6 md:grid-cols-2"><div className="skeleton h-80" /><div className="skeleton h-80" /></div>}
    {saved.length > 0 ? <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{saved.map((campaign) => <div key={campaign.id} className="space-y-3"><CampaignCard campaign={campaign} /><CampaignPreferenceButtons campaignId={campaign.id} compact /></div>)}</div> : !campaigns.isLoading && <div className="card mt-8 p-10 text-center"><Heart className="mx-auto text-slate-300" size={42} /><h2 className="mt-4 text-xl font-black">Chưa có chiến dịch đã lưu</h2><p className="mt-2 text-sm text-slate-500">Mở một chiến dịch và chọn “Lưu” để xem lại tại đây.</p></div>}
  </div>;
}
