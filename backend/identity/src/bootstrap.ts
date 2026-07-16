import bcrypt from "bcryptjs";
import { query } from "./db";

export async function bootstrapAdmin(): Promise<void> {
  const existing = await query<{ id: string }>("SELECT id FROM users WHERE role='ADMIN' LIMIT 1");
  if (existing[0]) return;

  const production = process.env.NODE_ENV === "production";
  const email = process.env.ADMIN_EMAIL ?? (production ? "" : "admin@demo.vn");
  const password = process.env.ADMIN_INITIAL_PASSWORD ?? (production ? "" : "Demo@12345");
  const name = process.env.ADMIN_NAME ?? "Quản trị CharityConnect";
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL và ADMIN_INITIAL_PASSWORD bắt buộc khi khởi tạo production");
  }
  if (password.length < 10) throw new Error("ADMIN_INITIAL_PASSWORD phải có ít nhất 10 ký tự");

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users(email,password_hash,name,role,terms_accepted_at)
     VALUES($1,$2,$3,'ADMIN',now()) ON CONFLICT(email) DO NOTHING`,
    [email.toLowerCase(), passwordHash, name],
  );
  process.stdout.write("identity-bootstrap-admin:created\n");
}
