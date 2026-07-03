import type { CampaignStatus } from "./types";

const transitions: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["CLOSED"],
  REJECTED: ["PENDING_REVIEW"],
  CLOSED: []
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return transitions[from].includes(to);
}

export function isDonationEligible(status: CampaignStatus, endDate: Date, now = new Date()): boolean {
  return status === "APPROVED" && endDate.getTime() > now.getTime();
}

