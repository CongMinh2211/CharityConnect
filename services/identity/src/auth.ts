import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db";
import type { AuthClaims, AuthRequest, Role } from "./types";

const secret = process.env.JWT_SECRET ?? "local-charityconnect-secret";

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, secret, { expiresIn: "8h" });
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ message: "Vui lòng đăng nhập" });
    return;
  }
  try {
    req.user = jwt.verify(token, secret) as AuthClaims;
    if (!req.user.session_id) { next(); return; }
    void query<{ id: string }>(
      `SELECT s.id FROM account_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND COALESCE(u.status::text,'ACTIVE')='ACTIVE'`,
      [req.user.session_id, req.user.sub],
    ).then((rows) => {
      if (!rows[0]) { res.status(401).json({ message: "Phiên đăng nhập đã bị thu hồi hoặc tài khoản đã bị khóa" }); return; }
      void query("UPDATE account_sessions SET last_seen_at=now() WHERE id=$1", [req.user!.session_id]);
      next();
    }).catch(() => {
      res.status(401).json({ message: "Không thể xác thực phiên đăng nhập" });
    });
  } catch {
    res.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn" });
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
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
