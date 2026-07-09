import type { NextFunction, Request, Response } from "express";

// Rate limiter theo cửa sổ trượt (sliding window) trong bộ nhớ, không cần thêm dependency.
// Dùng cho các endpoint nhạy cảm (đăng nhập, đăng ký, đặt lại mật khẩu) để chống brute-force theo IP.
// Bổ sung cho khóa-tài-khoản (lockout) hiện có: lockout chặn theo tài khoản, rate limit chặn theo IP.

interface Bucket {
  hits: number[];
}

const store = new Map<string, Bucket>();

function clientKey(req: Request, scope: string): string {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  const ip = forwarded || req.ip || req.socket.remoteAddress || "unknown";
  return `${scope}:${ip}`;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  scope: string;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, scope } = options;
  const message = options.message ?? "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.";
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = clientKey(req, scope);
    const bucket = store.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((ts) => now - ts < windowMs);
    const remaining = Math.max(0, max - bucket.hits.length - 1);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    if (bucket.hits.length >= max) {
      const retryAfter = Math.ceil((bucket.hits[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      store.set(key, bucket);
      res.status(429).json({ message });
      return;
    }
    bucket.hits.push(now);
    store.set(key, bucket);
    next();
  };
}

// Dọn định kỳ các bucket rỗng để tránh rò rỉ bộ nhớ khi có nhiều IP khác nhau.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.hits.every((ts) => now - ts > 15 * 60_000)) store.delete(key);
  }
}, 5 * 60_000);
sweeper.unref?.();

// Cho phép test reset trạng thái giữa các case.
export function resetRateLimit(): void {
  store.clear();
}
