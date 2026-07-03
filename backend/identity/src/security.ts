import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";

// Helmet-lite: các security header quan trọng, không cần thêm dependency.
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader("X-Powered-By");
  next();
}

// CORS whitelist: đọc từ env CORS_ORIGINS (phân tách bằng dấu phẩy), mặc định origin dev.
export function buildCorsOptions(): CorsOptions {
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  return {
    origin(origin, callback) {
      // Cho phép request không có Origin (curl, service nội bộ, healthcheck).
      if (!origin || origins.includes(origin)) { callback(null, true); return; }
      callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  };
}
