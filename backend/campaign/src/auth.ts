import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthClaims, AuthRequest, Role } from "./types";

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  try {
    if (!token) throw new Error("missing");
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? "local-charityconnect-secret") as AuthClaims;
    next();
  } catch {
    res.status(401).json({ message: "Vui lòng đăng nhập" });
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) { res.status(403).json({ message: "Không đủ quyền" }); return; }
    next();
  };
}

export function internalOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.headers["x-internal-token"] !== (process.env.INTERNAL_SERVICE_TOKEN ?? "local-internal-token")) {
    res.status(403).json({ message: "Forbidden" }); return;
  }
  next();
}

