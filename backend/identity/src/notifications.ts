import { google } from "googleapis";
import { createClient } from "redis";
import { Counter, Gauge, Histogram } from "prom-client";
import { pool } from "./db";

const sentCounter = new Counter({ name: "identity_email_sent_total", help: "Emails sent through Gmail", labelNames: ["template"] });
const failedCounter = new Counter({ name: "identity_email_failed_total", help: "Email delivery failures", labelNames: ["template"] });
const deliveryDuration = new Histogram({ name: "identity_email_delivery_seconds", help: "Time spent delivering an email", labelNames: ["template"] });
const queueGauge = new Gauge({ name: "identity_email_queue_size", help: "Pending notification emails" });

type EmailTemplate = "WELCOME" | "DONATION_THANK_YOU" | "CAMPAIGN_UPDATE" | "PASSWORD_RESET";
export interface OutboxRow {
  id: string;
  template: EmailTemplate;
  name: string;
  email: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const retryMinutes = [1, 5, 15, 60, 360];
const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function emailDeliveryMode(): "GMAIL" | "QUEUED_ONLY" {
  const required = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL"];
  return required.every((name) => Boolean(process.env[name])) ? "GMAIL" : "QUEUED_ONLY";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function formatVnd(value: unknown): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function renderEmail(row: OutboxRow): { subject: string; text: string; html: string } {
  const webUrl = process.env.PUBLIC_WEB_URL ?? "http://127.0.0.1:5173";
  if (row.template === "WELCOME") {
    const subject = "Chào mừng bạn đến với CharityConnect";
    const text = `Chào ${row.name}, tài khoản CharityConnect của bạn đã được tạo. Đăng nhập tại ${webUrl}/dang-nhap.`;
    return {
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10231d"><h1>Chào mừng ${escapeHtml(row.name)}!</h1><p>Tài khoản CharityConnect của bạn đã được tạo thành công.</p><p><a href="${webUrl}/dang-nhap" style="display:inline-block;padding:12px 20px;background:#8ed957;color:#10231d;border-radius:10px;text-decoration:none;font-weight:700">Đăng nhập CharityConnect</a></p><p style="color:#64748b">CharityConnect ghi nhận đóng góp bằng VND và cung cấp biên nhận có thể xác minh công khai.</p></div>`,
    };
  }
  if (row.template === "CAMPAIGN_UPDATE") {
    const campaignTitle = String(row.payload.campaign_title ?? "Chiến dịch bạn theo dõi");
    const path = String(row.payload.path ?? "/thong-bao");
    const targetUrl = `${webUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const subject = `Cập nhật mới – ${campaignTitle}`;
    const text = `Chào ${row.name}, ${String(row.payload.message ?? "chiến dịch bạn theo dõi vừa có cập nhật mới")}. Xem tại ${targetUrl}.`;
    return {
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10231d"><p style="font-weight:700;color:#2e7148">CHARITYCONNECT</p><h1>${escapeHtml(campaignTitle)}</h1><p>${escapeHtml(row.payload.message)}</p><p><a href="${targetUrl}" style="display:inline-block;padding:12px 20px;background:#8ed957;color:#10231d;border-radius:10px;text-decoration:none;font-weight:700">Xem cập nhật</a></p><p style="color:#64748b">Bạn nhận thư vì đang theo dõi chiến dịch này.</p></div>`,
    };
  }
  if (row.template === "PASSWORD_RESET") {
    const resetPath = String(row.payload.reset_path ?? "/quen-mat-khau");
    const resetUrl = `${webUrl}${resetPath.startsWith("/") ? resetPath : `/${resetPath}`}`;
    const subject = "Đặt lại mật khẩu CharityConnect";
    const text = `Chào ${row.name}, dùng liên kết sau để đặt lại mật khẩu CharityConnect trong ${String(row.payload.expires_minutes ?? 30)} phút: ${resetUrl}. Nếu bạn không yêu cầu, hãy bỏ qua email này.`;
    return {
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10231d"><p style="font-weight:700;color:#2e7148">CHARITYCONNECT</p><h1>Đặt lại mật khẩu</h1><p>Chào ${escapeHtml(row.name)}, liên kết đặt lại mật khẩu có hiệu lực trong ${escapeHtml(row.payload.expires_minutes ?? 30)} phút.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#8ed957;color:#10231d;border-radius:10px;text-decoration:none;font-weight:700">Đặt lại mật khẩu</a></p><p style="color:#64748b">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p></div>`,
    };
  }
  const receiptNumber = String(row.payload.receipt_number ?? "");
  const verifyUrl = `${webUrl}/xac-minh-bien-nhan?receipt=${encodeURIComponent(receiptNumber)}`;
  const subject = `Cảm ơn bạn đã quyên góp – ${receiptNumber}`;
  const text = `Chào ${row.name}, cảm ơn bạn đã đóng góp ${formatVnd(row.payload.amount)} cho chiến dịch ${String(row.payload.campaign_title ?? "")}. Mã biên nhận: ${receiptNumber}. Xác minh tại ${verifyUrl}.`;
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#10231d"><p style="font-weight:700;color:#2e7148">CHARITYCONNECT</p><h1>Cảm ơn sự tử tế của bạn, ${escapeHtml(row.name)}!</h1><p>Khoản đóng góp <strong>${escapeHtml(formatVnd(row.payload.amount))}</strong> cho chiến dịch <strong>${escapeHtml(row.payload.campaign_title)}</strong> đã được ghi nhận.</p><div style="padding:16px;background:#f2f7ed;border-radius:12px"><div>Mã biên nhận</div><strong>${escapeHtml(receiptNumber)}</strong></div><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#8ed957;color:#10231d;border-radius:10px;text-decoration:none;font-weight:700">Xác minh biên nhận</a></p><p style="color:#64748b">Biên nhận được liên kết với sổ cái minh bạch CharityConnect.</p></div>`,
  };
}

export function encodeMessage(to: string, subject: string, text: string, html: string): string {
  const sender = process.env.GMAIL_SENDER_EMAIL!;
  const boundary = `charityconnect-${Date.now()}`;
  const message = [
    `From: CharityConnect <${sender}>`, `To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary=${boundary}`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(text).toString("base64"),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html).toString("base64"),
    `--${boundary}--`, "",
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export async function sendWithGmail(row: OutboxRow): Promise<string> {
  const oauth = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth });
  const content = renderEmail(row);
  const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodeMessage(row.email, content.subject, content.text, content.html) } });
  return response.data.id ?? "gmail-accepted";
}

export async function claimNextEmail(): Promise<OutboxRow | null> {
  const result = await pool.query<OutboxRow>(
    `UPDATE email_outbox e SET status='SENDING',updated_at=now()
     FROM users u
     WHERE e.id=(SELECT id FROM email_outbox
       WHERE (status='PENDING' OR (status='SENDING' AND updated_at < now()-interval '10 minutes'))
         AND next_attempt_at<=now() AND attempts<5
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       AND u.id=e.recipient_user_id
     RETURNING e.id,e.template,e.payload,e.attempts,u.name,u.email`,
  );
  return result.rows[0] ?? null;
}

export async function deliverQueuedEmails(): Promise<void> {
  if (emailDeliveryMode() !== "GMAIL") return;
  const queued = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM email_outbox WHERE status IN ('PENDING','SENDING')");
  queueGauge.set(Number(queued.rows[0]?.count ?? 0));
  const row = await claimNextEmail();
  if (!row) return;
  const end = deliveryDuration.startTimer({ template: row.template });
  try {
    const gmailMessageId = await sendWithGmail(row);
    await pool.query("UPDATE email_outbox SET status='SENT',sent_at=now(),updated_at=now(),gmail_message_id=$1,last_error=NULL WHERE id=$2", [gmailMessageId, row.id]);
    sentCounter.inc({ template: row.template });
  } catch (error) {
    const attempts = row.attempts + 1;
    const status = attempts >= 5 ? "FAILED" : "PENDING";
    const delay = retryMinutes[Math.min(attempts - 1, retryMinutes.length - 1)];
    await pool.query(
      "UPDATE email_outbox SET status=$1,attempts=$2,next_attempt_at=now()+($3||' minutes')::interval,last_error=$4,updated_at=now() WHERE id=$5",
      [status, attempts, delay, String(error).slice(0, 500), row.id],
    );
    failedCounter.inc({ template: row.template });
  } finally {
    end();
  }
}

/* istanbul ignore next -- long-running Redis worker is covered by integration/manual Docker flow */
export async function startNotificationWorkers(): Promise<void> {
  const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  redis.on("error", (error) => process.stderr.write(`identity-notification-redis:${String(error)}\n`));
  await redis.connect();
  const group = "identity-notifications";
  const consumer = `identity-${process.pid}`;
  const streams = ["donation.completed", "campaign.updates"];
  for (const stream of streams) {
    try { await redis.xGroupCreate(stream, group, "0", { MKSTREAM: true }); } catch (error) {
      if (!String(error).includes("BUSYGROUP")) throw error;
    }
  }
  const consumeCampaignUpdates = async (): Promise<void> => {
    while (redis.isOpen) {
      try {
        const response = await redis.sendCommand(["XREADGROUP", "GROUP", group, consumer, "COUNT", "20", "BLOCK", "1000", "STREAMS", streams[1], ">"] ) as unknown;
        if (!Array.isArray(response)) continue;
        for (const streamItem of response as [string, [string, string[]][]][]) {
          for (const [messageId, flatFields] of streamItem[1]) {
            const fields: Record<string, string> = {};
            for (let index = 0; index < flatFields.length; index += 2) fields[flatFields[index]] = flatFields[index + 1];
            if (fields.event_id && fields.campaign_id) {
              const payload = JSON.stringify({ campaign_title: fields.campaign_title, message: fields.message, path: fields.path });
              await pool.query(
                `WITH accepted AS (
                   INSERT INTO processed_campaign_notification_events(event_id) VALUES($1)
                   ON CONFLICT DO NOTHING RETURNING event_id
                 ), followers AS (
                   SELECT p.user_id FROM campaign_preferences p,accepted WHERE p.campaign_id=$2 AND p.following
                 ), notices AS (
                   INSERT INTO user_notifications(user_id,event_id,type,campaign_id,title,message,path)
                   SELECT f.user_id,$1,$3,$2,$4,$5,$6 FROM followers f
                   ON CONFLICT(user_id,event_id) DO NOTHING RETURNING user_id
                 )
                 INSERT INTO email_outbox(event_id,template,recipient_user_id,payload)
                 SELECT $1||':'||n.user_id::text,'CAMPAIGN_UPDATE',n.user_id,$7::jsonb FROM notices n
                 ON CONFLICT(event_id,template) DO NOTHING`,
                [fields.event_id, fields.campaign_id, fields.type, fields.title, fields.message, fields.path, payload],
              );
            }
            await redis.xAck(streams[1], group, messageId);
          }
        }
      } catch (error) {
        process.stderr.write(`identity-campaign-update-worker:${String(error)}\n`);
        await sleep(1000);
      }
    }
  };
  void consumeCampaignUpdates();
  const stream = streams[0];
  while (redis.isOpen) {
    try {
      const response = await redis.sendCommand(["XREADGROUP", "GROUP", group, consumer, "COUNT", "20", "BLOCK", "1000", "STREAMS", stream, ">"]) as unknown;
      if (Array.isArray(response)) {
        for (const streamItem of response as [string, [string, string[]][]][]) {
          for (const [messageId, flatFields] of streamItem[1]) {
            const fields: Record<string, string> = {};
            for (let index = 0; index < flatFields.length; index += 2) fields[flatFields[index]] = flatFields[index + 1];
            if (fields.donor_id && fields.event_id) {
              const title = "Cảm ơn bạn đã quyên góp";
              const message = `Bạn đã quyên góp ${formatVnd(fields.amount)} cho chiến dịch "${fields.campaign_title}". Cảm ơn tấm lòng của bạn!`;
              const path = `/bien-nhan/${fields.event_id}`;
              await pool.query(
                `WITH accepted AS (
                   INSERT INTO processed_notification_events(event_id) VALUES($1)
                   ON CONFLICT DO NOTHING RETURNING event_id
                 ), notice AS (
                   INSERT INTO user_notifications(user_id,event_id,type,campaign_id,title,message,path)
                   SELECT $2,accepted.event_id,'DONATION_RECEIVED',$4,$5,$6,$7 FROM accepted
                   ON CONFLICT(user_id,event_id) DO NOTHING
                 )
                 INSERT INTO email_outbox(event_id,template,recipient_user_id,payload)
                 SELECT accepted.event_id,'DONATION_THANK_YOU',$2,$3::jsonb FROM accepted
                 ON CONFLICT(event_id,template) DO NOTHING`,
                [fields.event_id, fields.donor_id, JSON.stringify({ amount: Number(fields.amount), campaign_title: fields.campaign_title, receipt_number: fields.receipt_number, completed_at: fields.completed_at }), fields.campaign_id, title, message, path],
              );
            }
            await redis.xAck(stream, group, messageId);
          }
        }
      }
      await deliverQueuedEmails();
    } catch (error) {
      process.stderr.write(`identity-notification-worker:${String(error)}\n`);
      await sleep(1000);
    }
  }
}
