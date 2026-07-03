import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { google } from "googleapis";

const rootEnv = path.resolve(process.cwd(), "../..", ".env");
const redirectUri = "http://127.0.0.1:53682/oauth2callback";

function parseEnv(source: string): Record<string, string> {
  return Object.fromEntries(source.split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

function updateEnv(key: string, value: string): void {
  const source = readFileSync(rootEnv, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  const next = pattern.test(source) ? source.replace(pattern, line) : `${source.replace(/\s*$/, "")}\r\n${line}\r\n`;
  writeFileSync(rootEnv, next, "utf8");
}

async function main(): Promise<void> {
  const env = parseEnv(readFileSync(rootEnv, "utf8"));
  const clientId = process.env.GMAIL_CLIENT_ID || env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Hãy điền GMAIL_CLIENT_ID và GMAIL_CLIENT_SECRET trong .env trước.");
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["https://www.googleapis.com/auth/gmail.send"] });

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const callback = new URL(request.url ?? "/", redirectUri);
      if (callback.pathname !== "/oauth2callback") { response.writeHead(404).end(); return; }
      const error = callback.searchParams.get("error"); const authorizationCode = callback.searchParams.get("code");
      if (error || !authorizationCode) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Ủy quyền Gmail thất bại. Có thể đóng cửa sổ này.");
        server.close(); reject(new Error(error ?? "Missing authorization code")); return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<h2>Đã cấp quyền gửi Gmail.</h2><p>Bạn có thể đóng cửa sổ này và quay lại terminal.</p>");
      server.close(); resolve(authorizationCode);
    });
    server.listen(53682, "127.0.0.1", () => {
      console.log("Đang mở trang cấp quyền Gmail trong trình duyệt…");
      console.log("Nếu trình duyệt không tự mở, hãy mở URL sau:\n" + url);
      spawn("powershell", ["-NoProfile", "-Command", "Start-Process", url], { detached: true, stdio: "ignore" }).unref();
    });
    server.on("error", reject);
  });
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google không trả refresh token. Hãy thu hồi quyền ứng dụng cũ rồi chạy lại.");
  updateEnv("GMAIL_REFRESH_TOKEN", tokens.refresh_token);
  console.log("Đã lưu GMAIL_REFRESH_TOKEN an toàn vào .env (không in token ra màn hình).");
}

void main().catch((error) => { console.error("Không thể cấu hình Gmail OAuth:", error instanceof Error ? error.message : error); process.exitCode = 1; });
