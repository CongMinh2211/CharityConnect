import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { query } from "./db";

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? null;
}

export async function createAccountSession(userId: string, req: Request): Promise<string> {
  const sessionId = randomUUID();
  await query(
    `INSERT INTO account_sessions(id,user_id,user_agent,ip_address,expires_at)
     VALUES($1,$2,$3,$4,now()+interval '8 hours')`,
    [sessionId, userId, req.headers["user-agent"] ?? null, clientIp(req)],
  );
  return sessionId;
}

