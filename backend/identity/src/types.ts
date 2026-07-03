import type { Request } from "express";

export type Role = "DONOR" | "ORGANIZATION" | "ADMIN";
export type OrganizationStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface AuthClaims {
  sub: string;
  email: string;
  name: string;
  role: Role;
  session_id?: string;
}

export interface AuthRequest extends Request {
  user?: AuthClaims;
}
