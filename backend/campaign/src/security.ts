import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";

// Helmet-lite: security headers không cần thêm dependency.
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.removeHeader("X-Powered-By");
  next();
}

export function buildCorsOptions(): CorsOptions {
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) { callback(null, true); return; }
      callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  };
}
