import type { Request } from "express";

export type Role = "DONOR" | "ORGANIZATION" | "ADMIN";
export type CampaignStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED";
export type CampaignCategory = "EMERGENCY" | "EDUCATION" | "HEALTH" | "ENVIRONMENT" | "COMMUNITY";
export type ImpactReportStatus = "DRAFT" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
export interface AuthClaims { sub: string; email: string; name: string; role: Role; session_id?: string }
export interface AuthRequest extends Request { user?: AuthClaims }
