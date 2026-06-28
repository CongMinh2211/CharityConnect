import { ArrowUpRight, BadgeCheck, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { formatVnd } from "../lib/api";
import type { Campaign } from "../types";

interface CampaignCardProps { campaign: Campaign }

export function CampaignCard({ campaign }: CampaignCardProps): JSX.Element {
  const percent = Math.min(100, Math.round((campaign.raised_amount / campaign.goal_amount) * 100));
  const daysLeft = Math.max(0, Math.ceil((new Date(campaign.end_date).getTime() - Date.now()) / 86_400_000));
  return (
    <article className="campaign-card group">
      <Link className="block overflow-hidden" to={`/chien-dich/${campaign.id}`} aria-label={`Xem ${campaign.title}`}>
        <img className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.03]" src={campaign.image_url ?? "/images/community.jpg"} alt={campaign.title} loading="lazy" />
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.12em]">
          <span className="text-brand-700">{campaign.category}</span>
          <span className="flex items-center gap-1 text-slate-500"><CalendarDays size={14} aria-hidden="true" /> {daysLeft} ngày</span>
        </div>
        <Link to={`/chien-dich/${campaign.id}`}><h3 className="mt-3 text-xl font-extrabold leading-snug text-ink transition group-hover:text-brand-700">{campaign.title}</h3></Link>
        <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{campaign.summary}</p>
        <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><BadgeCheck size={17} className="text-brand-600" aria-hidden="true" />{campaign.organization_name}</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-sage-200" aria-label={`Đã đạt ${percent}%`}>
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div><strong className="block text-lg text-ink">{formatVnd(campaign.raised_amount)}</strong><span className="text-xs text-slate-500">trên {formatVnd(campaign.goal_amount)}</span></div>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-700">{percent}% <ArrowUpRight size={16} aria-hidden="true" /></span>
        </div>
      </div>
    </article>
  );
}
