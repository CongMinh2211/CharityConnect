import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthClaims, AuthRequest, Role } from "./types";

async function sessionIsActive(sessionId: string, userId: string): Promise<boolean> {
  const configured = process.env.IDENTITY_SERVICE_URL;
  if (!configured) return process.env.NODE_ENV !== "production";
  const identityUrl = /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
  const response = await fetch(`${identityUrl}/internal/sessions/${encodeURIComponent(sessionId)}/status?user_id=${encodeURIComponent(userId)}`, {
    headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN ?? "local-internal-token" },
  });
  if (!response.ok) return false;
  const payload = await response.json() as { active?: boolean };
  return payload.active === true;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  try {
    if (!token) throw new Error("missing");
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? "local-charityconnect-secret") as AuthClaims;
    if (req.user.session_id) {
      if (!await sessionIsActive(req.user.session_id, req.user.sub)) {
        res.status(401).json({ message: "Phiên đăng nhập đã bị thu hồi hoặc tài khoản đã bị khóa" });
        return;
      }
    } else if (process.env.NODE_ENV === "production") {
      res.status(401).json({ message: "Phiên đăng nhập không có định danh phiên hợp lệ" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ message: "Vui lòng đăng nhập" });
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "Không đủ quyền" });
      return;
    }
    next();
  };
}

export function internalOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.headers["x-internal-token"] !== (process.env.INTERNAL_SERVICE_TOKEN ?? "local-internal-token")) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  next();
}
