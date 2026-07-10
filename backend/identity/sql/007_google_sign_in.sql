-- Google Sign-In: chỉ lưu Google subject (sub), không lưu ID token.
-- password_hash được phép NULL với tài khoản chỉ đăng nhập qua Google.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_subject TEXT UNIQUE;

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_subject
  ON users(google_subject)
  WHERE google_subject IS NOT NULL;
