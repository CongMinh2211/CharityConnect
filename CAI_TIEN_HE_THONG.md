# CharityConnect — Báo cáo phân tích & cải tiến hệ thống

Phạm vi: giữ nguyên kiến trúc microservice hiện có (React + Express + FastAPI + PostgreSQL + Redis + Nginx), không thêm chat/blog/NFT/token/ví crypto/AI recommendation. Chỉ củng cố: tài khoản, quy trình quyên góp, minh bạch blockchain, kiểm soát dữ liệu, audit, security, performance.

**Hiện trạng đã xác nhận từ code** (khác với giả định "chỉ có hash-chain"):

- Đã có: hash-chain ledger (canonical JSON + SHA-256, `domain.py`), Merkle root + Merkle proof + anchor Sepolia/mô phỏng (`trustchain.py`, `004_trustchain_merkle.sql`), Outbox pattern (`outbox_events`), Redis Streams `donation.completed` + consumer idempotent (`processed_donation_events`), audit_logs mỗi service, Nginx gateway `/api/v1`, Prometheus/Grafana/SonarQube.
- Còn thiếu: refresh token (JWT access 8h duy nhất), password history, helmet, rate limit, CSRF strategy rõ ràng, hash file bằng chứng vào ledger, audit thiếu reason/IP/user-agent, cache Redis cho endpoint công khai, cơ chế Request Update sau khi Approved chưa nhất quán.

---

## 1. Kiến trúc mới

Giữ 4 service + gateway, chuẩn hóa nội bộ theo Clean Architecture:

```
React SPA ──> Nginx API Gateway (/api/v1, rate limit, security headers)
                ├─ Identity Service (Express/TS)  ── identity-db
                ├─ Campaign Service (Express/TS)  ── campaign-db
                ├─ Donation/Transparency (FastAPI) ── donation-db
                └─ Assistant (FastAPI, ngoài phạm vi cải tiến)
              Redis: (a) Streams sự kiện, (b) Cache đọc công khai, (c) Rate limit counter
```

Mỗi service chia 4 tầng: `api` (routes/controllers, validate bằng Zod/Pydantic) → `application` (use case, transaction script) → `domain` (entity, state machine, hash/merkle thuần) → `infrastructure` (Postgres repo, Redis, mailer). Quy tắc: domain không import framework; controller không chạm SQL.

Giao tiếp: đồng bộ qua Internal API có header `X-Internal-Token` (đã có `/internal/...`, cần thêm token); bất đồng bộ qua Outbox → Redis Streams (giữ nguyên, bổ sung dead-letter stream `donation.completed.dlq` và retry counter).

## 2. Frontend Improvements

Layout chung sau đăng nhập: **Sidebar trái (thu gọn được) + Header trên + vùng nội dung**.

- **Sidebar**: logo, menu theo role (icon + label), badge số việc chờ (Admin: số campaign/report chờ duyệt), mục active có thanh màu, footer chứa avatar + role + logout.
- **Header**: breadcrumb, ô tìm kiếm toàn cục, chuông thông báo (dropdown, đã có API `/me/notifications`), menu user (Hồ sơ / Đổi mật khẩu / Phiên đăng nhập).
- **Dashboard mỗi role**: hàng KPI cards (4 thẻ: số liệu + delta so kỳ trước + sparkline) → biểu đồ chính (line/bar theo thời gian) → bảng dữ liệu gần đây → timeline hoạt động.

Theo role:

- **Guest**: trang chủ hero + lưới campaign card (ảnh, progress bar, badge trạng thái, số ngày còn lại), trang Minh bạch (Ledger Explorer công khai), trang Verify QR (dán mã hoặc quét), Đăng ký/Đăng nhập.
- **Donor**: Dashboard (tổng đã góp, số chiến dịch, biên nhận, biểu đồ theo tháng); Quyên góp (stepper 3 bước: chọn số tiền → xác nhận → nhận receipt QR); Lịch sử (bảng: ngày, chiến dịch, số tiền, trạng thái ledger ✓, nút xem receipt); Receipt QR (mã QR + số biên nhận + link verify + trạng thái anchor); Theo dõi Impact Report của chiến dịch đã góp.
- **Organization**: Dashboard (tổng huy động, campaign đang chạy, report chờ duyệt); Hồ sơ xác minh (upload giấy phép, trạng thái PENDING/VERIFIED/REJECTED kèm lý do); CRUD Campaign dạng wizard (thông tin → mục tiêu → kế hoạch tài chính → ảnh → xem trước → Gửi duyệt), chỉ sửa khi DRAFT/REJECTED; CRUD Impact Report + Upload Evidence (kéo-thả, hiện hash SHA-256 của file ngay khi upload); nút "Yêu cầu cập nhật" khi đã APPROVED.
- **Admin**: Dashboard hệ thống (user mới, tiền quyên góp, hàng chờ duyệt, trạng thái anchor); Quản lý User (bảng: search/filter role/status, khóa-mở khóa kèm lý do); Quản lý Organization (hàng chờ xác minh, xem tài liệu, Approve/Reject + lý do); Duyệt Campaign & Impact Report (màn so sánh nội dung + evidence, diff khi là Request Update); Blockchain Monitor (danh sách anchor: root, khoảng position, network, tx hash, trạng thái, nút "Tạo điểm neo", cảnh báo số entry chưa neo); Audit Log (bảng filter theo actor/action/khoảng thời gian, xem old/new value dạng diff JSON).

Thành phần chuẩn hóa: `StatusBadge` (DRAFT xám, PENDING vàng, APPROVED xanh, REJECTED đỏ, CLOSED đen), `ProgressBar` mục tiêu quyên góp, `Timeline` trạng thái hồ sơ, `DataTable` (sort, filter, pagination server-side), `HashText` (rút gọn + copy), `AnchorStatusChip` (SIMULATED/PENDING/CONFIRMED).

**Blockchain Explorer (public)**: bảng ledger entries (position, loại sự kiện, campaign, hash rút gọn, thời gian) → click mở drawer: public payload, previous_hash → entry_hash, Merkle proof từng bước, anchor chứa entry đó, link Etherscan nếu CONFIRMED. Nút "Verify chuỗi" chạy `/transparency/verify` và hiển thị kết quả từng đoạn.

**Receipt Verification**: nhập số biên nhận / quét QR → hiển thị 4 bước kiểm tra (① biên nhận tồn tại ② entry hash khớp ③ Merkle proof hợp lệ ④ root có trên chain) với tick xanh/đỏ từng bước.

## 3. Backend Improvements

Đánh giá API hiện tại: khá đầy đủ (xem mục 7 cho phần thiếu). Các điểm cần chuẩn hóa:

- **Authentication**: thêm refresh token rotation (mục 6). Access token rút xuống 15 phút.
- **Authorization/RBAC**: middleware chung `requireRole(...roles)` + kiểm tra ownership ở tầng application (org chỉ sửa campaign của mình — hiện đã có `/internal/campaigns/:id/owner`, chuẩn hóa thành policy check tập trung).
- **Validation**: đã có Zod/Pydantic; bổ sung giới hạn kích thước/loại file upload (multer fileFilter + MIME sniffing), chuẩn hóa error envelope `{code, message, details, traceId}`.
- **Business logic**: state machine tường minh cho Campaign (`DRAFT→PENDING_REVIEW→APPROVED/REJECTED→CLOSED`) và ImpactReport; chuyển transition vào domain layer, cấm update ngoài transition hợp lệ (một phần đã có trong `state.ts` và migration `005_controlled_crud.sql`).
- **Exception**: global error handler mỗi service, không lộ stack trace, log kèm traceId.
- **Idempotency**: giữ `processed_donation_events`; thêm header `Idempotency-Key` cho `POST /donations` (lưu key + response hash trong Redis TTL 24h).
- **Transaction**: mọi use case ghi nhiều bảng dùng 1 transaction (donation + receipt + outbox + ledger đã đúng mẫu; áp dụng tương tự cho approve campaign + audit + notification outbox).
- **Caching**: Redis cache-aside cho `GET /campaigns` (TTL 60s, invalidate khi approve/close/donation), `GET /analytics/*/public` (TTL 5 phút), chi tiết campaign (TTL 30s).
- **Event/Outbox**: giữ nguyên; thêm bảng outbox cho campaign-service (sự kiện `campaign.approved` → notification) thay vì gọi trực tiếp.
- **API Gateway**: Nginx thêm `limit_req_zone` (đăng nhập 5 req/phút/IP, donation 30 req/phút/user), security headers, ẩn `/internal/*` khỏi gateway (chỉ mạng docker nội bộ).

## 4. Database Improvements

Giữ database-per-service. Bảng theo yêu cầu (bảng đã tồn tại ghi chú "có sẵn"):

| Bảng | DB | PK | FK / Unique / Check chính | Ghi chú |
|---|---|---|---|---|
| users (có sẵn) | identity | id UUID | UNIQUE(email); status ACTIVE/DISABLED | thêm `failed_login_count`, `locked_until` |
| organizations (có sẵn: organization_profiles) | identity | user_id → users CASCADE | UNIQUE(registration_number); status enum | thêm `website`, `contact_phone` |
| password_history (mới) | identity | id | FK user_id CASCADE; index (user_id, created_at DESC) | giữ 5 hash gần nhất, CHECK không trùng khi đổi |
| refresh_tokens (mới) | identity | id | FK user_id CASCADE; UNIQUE(token_hash); `replaced_by`, `revoked_at`; partial index active | rotation + phát hiện reuse |
| notifications (có sẵn) | identity | id | FK user_id; index (user_id, read_at NULL) | |
| audit_logs (có sẵn, mở rộng) | mỗi DB | id | index (actor_id, created_at DESC), (entity_type, entity_id) | thêm `actor_role, reason, ip_address, user_agent, trace_id` |
| campaigns (có sẵn) | campaign | id | CHECK goal>0, raised≥0, end_date>created; index (status,end_date), (org_id,created) | thêm `version INT` (optimistic lock) |
| campaign_update_requests (mới) | campaign | id | FK campaign_id; status PENDING/APPROVED/REJECTED; payload JSONB | Request Update sau Approved |
| impact_reports (có sẵn) | campaign | id | FK campaign_id CASCADE; status enum | |
| evidence_files (có sẵn, mở rộng) | campaign | id | FK report_id CASCADE; UNIQUE(file_hash) per report | thêm `file_hash CHAR(64)`, `mime_type`, `size_bytes` CHECK ≤ 50MB |
| donations (có sẵn) | donation | id | CHECK amount>0; index (donor_id,created), (campaign_id,created) | bất biến — REVOKE UPDATE/DELETE |
| receipts (có sẵn) | donation | id | UNIQUE(receipt_number), UNIQUE(donation_id) FK | bất biến |
| ledger_entries (có sẵn) | donation | position BIGINT | UNIQUE(event_id), UNIQUE(entry_hash); CHECK hex64 | trigger cấm UPDATE/DELETE |
| ledger_anchors (có sẵn) | donation | id | UNIQUE(from_position,to_position); status CHECK | + anchor_entries (proof JSONB) |

- **Trigger đề xuất**: (1) `forbid_mutation()` BEFORE UPDATE/DELETE trên donations, receipts, ledger_entries, ledger_anchors → RAISE EXCEPTION; (2) `touch_updated_at()` trên bảng có updated_at; (3) trigger ghi audit khi UPDATE users.status.
- **Cascade**: chỉ cascade dữ liệu phụ thuộc hồ sơ (profile, token, notification). KHÔNG cascade donations/ledger (dùng RESTRICT).
- **Migration**: tiếp tục file SQL đánh số (`005_refresh_tokens.sql`, `006_password_history.sql`, `005_evidence_hash.sql`, `006_update_requests.sql`, `005_ledger_immutable_trigger.sql`), mỗi file idempotent (`IF NOT EXISTS`) như hiện tại; thêm bảng `schema_migrations` ghi version đã áp.

## 5. Blockchain Improvements

Pipeline hiện có đã đúng hướng; cải tiến từng khâu:

```
Sự kiện (donation / fund-usage-verified)
 → Canonical JSON (sort keys, UTC ISO, không khoảng trắng)   [đã có: canonical_json()]
 → entry_hash = SHA-256(prev_hash ‖ canonical(payload))      [đã có: ledger_hash()]
 → Hash Chain (position, previous_hash, entry_hash)          [đã có]
 → Batch ≤100 entry → Merkle Tree → Merkle Root              [đã có: merkle_root()]
 → Anchor: Sepolia tx data "CHARITYCONNECT:MERKLE:<root>"    [đã có, kèm LOCAL_SIMULATION]
 → Receipt Verification (leaf + proof + root + tx)           [đã có endpoint]
 → Public Transparency (Ledger Explorer)                     [cải tiến UI mục 2]
```

Cải tiến cụ thể:

1. **Evidence Hash**: khi org upload evidence, backend tính SHA-256 file, lưu `evidence_files.file_hash`; khi admin duyệt Impact Report, đưa danh sách file_hash vào `public_payload` của entry `FUND_USAGE_VERIFIED` → file bị thay đổi hậu kiểm sẽ phát hiện được.
2. **Anchor định kỳ**: ngoài nút thủ công, thêm scheduler (APScheduler) tự tạo anchor khi ≥50 entry chưa neo hoặc mỗi 24h; đã có advisory lock chống trùng.
3. **Chain Verification công khai**: `/transparency/verify` trả kết quả theo đoạn (position hỏng đầu tiên nếu có); cache kết quả 5 phút.
4. **Receipt Proof export** (đã có `/proofs/{pos}/export`): chuẩn hóa gói JSON tự kiểm chứng {payload, prev_hash, entry_hash, proof[], root, tx_hash, hướng dẫn verify offline bằng script Python 20 dòng} — phù hợp trình bày đồ án.
5. **Không** dùng token/NFT/wallet người dùng/smart contract phức tạp — anchor chỉ là 1 giao dịch self-send chứa root trong data (như hiện tại).

## 6. Security Improvements

- **JWT**: access token 15 phút (RS256 hoặc giữ HS256 với secret bắt buộc từ env — bỏ default `local-charityconnect-secret`).
- **Refresh Token**: opaque 256-bit, lưu SHA-256 hash trong `refresh_tokens`, rotation mỗi lần dùng, phát hiện reuse → revoke cả chuỗi; cookie httpOnly + Secure + SameSite=Strict, path `/api/v1/auth/refresh`.
- **Password**: bcrypt cost 12 (đang dùng bcryptjs — giữ); policy ≥8 ký tự có chữ hoa/số; `password_history` chặn dùng lại 5 mật khẩu gần nhất; đổi mật khẩu → revoke mọi session/refresh token khác.
- **Rate limit**: Nginx `limit_req` per-IP toàn cục + Redis counter per-user cho login (5 lần sai → khóa 15 phút, dùng `failed_login_count/locked_until`).
- **CSRF**: vì refresh token nằm trong cookie → double-submit token cho `/auth/refresh`; các API còn lại dùng Bearer header nên miễn nhiễm CSRF.
- **CORS**: whitelist origin cụ thể (bỏ `cors()` mặc định allow-all).
- **Helmet**: thêm helmet (Express) và middleware headers (FastAPI): CSP, X-Content-Type-Options, X-Frame-Options DENY, HSTS.
- **XSS**: React escape mặc định; cấm `dangerouslySetInnerHTML`; sanitize description khi render; CSP chặn inline script.
- **SQL Injection**: đã dùng parameterized query (pg, asyncpg) — duy trì, cấm string concat SQL (rule ESLint/SonarQube).
- **Upload**: kiểm MIME thật (magic bytes), giới hạn 50MB, đổi tên file bằng UUID, phục vụ qua endpoint có kiểm quyền (đã có `/impact-evidence/:id`).
- **RBAC**: ma trận quyền viết thành bảng trong tài liệu + test; internal API yêu cầu `X-Internal-Token`.

## 7. API bổ sung

Identity:

- `POST /auth/refresh`, `POST /auth/logout` (revoke), `POST /auth/change-password`
- `POST /auth/forgot-password`, `POST /auth/reset-password` (bảng token đã có sẵn)
- `GET /sessions`, `DELETE /sessions/:id` (bảng account_sessions đã có, nginx đã route — bổ sung handler nếu thiếu)
- `GET /admin/users?search=&role=&status=&page=`, `PATCH /admin/users/:id/status` (khóa/mở + reason)

Campaign:

- `POST /organization/campaigns/:id/update-requests`, `GET /organization/campaigns/:id/update-requests`
- `GET /admin/update-requests?status=PENDING`, `PATCH /admin/update-requests/:id/status`
- `POST /organization/impact-reports/:id/evidence` (trả về file_hash), `DELETE .../evidence/:fileId` (chỉ khi DRAFT)
- `GET /organization/impact-reports/:id` (chi tiết kèm evidence)

Donation/Transparency:

- `POST /donations` thêm header `Idempotency-Key`
- `GET /transparency/anchors/:id/entries` (liệt kê entry trong anchor)
- `GET /transparency/stats` (tổng entry, entry chưa neo, anchor gần nhất — phục vụ Blockchain Monitor)

Chuẩn chung: pagination `?page=&limit=` trả `{items, total, page, limit}`; filter/search documented trong OpenAPI (mỗi service đã có `openapi.json`).

## 8. Database Schema (ERD logic)

```
IDENTITY DB
users 1─1 organization_profiles
users 1─n refresh_tokens, password_history, account_sessions,
          password_reset_tokens, notifications
audit_logs (actor_id → users, không FK cứng)

CAMPAIGN DB
campaigns 1─n impact_reports 1─n evidence_files
campaigns 1─n campaign_update_requests
campaigns 1─n processed_donation_events
campaigns 1─1 financial_plans (có sẵn)
audit_logs

DONATION DB
donations 1─1 receipts
donations ─→ ledger_entries (qua event_id)
ledger_entries n─1 ledger_anchors (qua anchor_entries: proof, leaf_index)
outbox_events
audit_logs

LIÊN SERVICE (tham chiếu mềm bằng UUID, không FK):
users.id → campaigns.organization_id, donations.donor_id
campaigns.id → donations.campaign_id, ledger_entries.campaign_id
```

## 9. Use Case cập nhật

- **Guest**: xem danh sách/chi tiết campaign, xem Ledger Explorer, verify receipt, đăng ký, đăng nhập.
- **Donor**: quyên góp (idempotent), nhận receipt QR, xem lịch sử + annual statement, verify receipt, theo dõi impact report, quản lý hồ sơ/mật khẩu/phiên, thông báo.
- **Organization**: nộp hồ sơ xác minh; CRUD campaign (DRAFT) → submit; sửa khi REJECTED; **Request Update khi APPROVED**; CRUD impact report + evidence (kèm hash) → submit; đóng campaign; xem donation vào campaign của mình.
- **Admin**: duyệt organization/campaign/impact report/update request (đều kèm reason); quản lý user (khóa/mở); tạo & giám sát anchor; xem audit log; dashboard hệ thống.
- **Hệ thống**: outbox publisher, donation consumer (idempotent), auto-anchor scheduler, gửi email từ outbox.

## 10. Sequence Diagram (mô tả)

**Quyên góp minh bạch:**

```
Donor → Gateway → Donation: POST /donations (JWT, Idempotency-Key)
Donation → Campaign (internal): GET donation-eligibility → APPROVED?
Donation (1 transaction): INSERT donation → receipt → outbox_event
                          → append ledger_entry (prev_hash → entry_hash)
Donation → Donor: 201 {receipt_number, qr, ledger_position}
Outbox publisher → Redis Stream donation.completed
Campaign consumer: XREADGROUP → INSERT processed_donation_events
                  → UPDATE raised_amount (idempotent) → ACK
Identity ← sự kiện → tạo notification + email DONATION_THANK_YOU
```

**Anchor & verify:**

```
Admin → POST /admin/transparency/anchors
Donation: advisory lock → lấy ≤100 entry chưa neo → merkle_root
        → INSERT ledger_anchors + anchor_entries(proof)
        → nếu có RPC: gửi tx Sepolia, chờ receipt → CONFIRMED
Guest → GET /transparency/receipts/{number}
Donation: entry → recompute hash → proof → root → so tx on-chain
        → trả 4 bước kết quả ✓/✗
```

## 11. Activity Diagram (mô tả)

**Vòng đời Campaign:** Org tạo (DRAFT) → sửa tự do → Submit (PENDING_REVIEW) → Admin duyệt ⇒ APPROVED (khóa sửa trực tiếp) / REJECTED (kèm lý do, quay lại sửa) → khi APPROVED: nhận donation; muốn sửa ⇒ tạo Update Request → Admin duyệt ⇒ áp payload + audit + ghi version; hết hạn/đạt mục tiêu/Org đóng ⇒ CLOSED.

**Vòng đời Impact Report:** tạo DRAFT → upload evidence (hash ngay) → Submit → Admin đối chiếu evidence → APPROVED ⇒ ghi entry `FUND_USAGE_VERIFIED` (kèm evidence hashes) vào ledger / REJECTED ⇒ sửa lại.

## 12. Class Diagram (mô tả, theo Clean Architecture — ví dụ Donation Service)

- **Domain**: `Donation`, `Receipt`, `LedgerEntry` (method `computeHash(prev)`), `MerkleTree` (`root()`, `proof(i)`, `verify()`), `Anchor`; value objects `Money`, `ReceiptNumber`.
- **Application**: `CreateDonationUseCase`, `CreateAnchorUseCase`, `VerifyReceiptUseCase`, `VerifyChainUseCase`; ports `DonationRepository`, `LedgerRepository`, `AnchorGateway` (impl: `SepoliaGateway`, `SimulatedGateway`), `EventPublisher`.
- **Infrastructure**: `PgDonationRepository`, `PgLedgerRepository`, `RedisEventPublisher`, `OutboxPublisher`.
- **API**: routers FastAPI + Pydantic schemas, phụ thuộc một chiều vào Application.

Tương tự Campaign Service có `CampaignStateMachine` (bảng transition hợp lệ) và `UpdateRequestService`; Identity có `TokenService` (issue/rotate/revoke), `PasswordPolicy`.

## 13. ERD

Xem mục 8; bổ sung thuộc tính khóa cho từng bảng ở mục 4. Điểm nhấn khi vẽ ERD nộp đồ án: 3 cụm DB tách biệt, quan hệ liên-service vẽ nét đứt (soft reference bằng UUID), các bảng bất biến (donations, receipts, ledger_entries, ledger_anchors) tô màu riêng kèm chú thích "append-only".

## 14. Deployment Diagram

```
Browser (React SPA build tĩnh, phục vụ bởi web container / Vite dev)
   │ HTTPS
Nginx Gateway :80 ── rate limit, headers, route /api/v1/*
   ├── identity-service :3001 ── identity-db (Postgres 16)
   ├── campaign-service :3002 ── campaign-db (Postgres 16) ── volume uploads
   ├── donation-service :8000 ── donation-db (Postgres 16)
   └── assistant-service :8001
Redis 7.4 (streams + cache + rate-limit)
Prometheus + Grafana (metrics /metrics mỗi service)
SonarQube (chất lượng code)
Ngoài hệ thống: Sepolia RPC (tùy chọn), Gmail API (email)
```

Docker Compose như hiện tại; mỗi service healthcheck `/health`; `.env` cho secret, không commit.

## 15. Roadmap triển khai (8 tuần, phạm vi đồ án)

1. **Tuần 1–2 — Security nền tảng**: refresh token rotation, password history, helmet/CORS whitelist, rate limit Nginx+Redis, lockout đăng nhập, bỏ JWT secret mặc định.
2. **Tuần 3 — Audit & kiểm soát dữ liệu**: mở rộng audit_logs (role, reason, IP, UA), trigger bất biến cho donations/receipts/ledger, admin user management.
3. **Tuần 4 — Controlled CRUD**: campaign_update_requests + màn duyệt diff của Admin; evidence hash khi upload.
4. **Tuần 5 — Blockchain**: đưa evidence hash vào entry FUND_USAGE_VERIFIED, auto-anchor scheduler, gói proof export tự kiểm chứng, hoàn thiện `/transparency/stats`.
5. **Tuần 6 — Performance**: Redis cache-aside + invalidation, chuẩn hóa pagination/search/filter, rà soát index (EXPLAIN các query danh sách).
6. **Tuần 7 — Frontend**: layout Sidebar/Header mới, 3 dashboard theo role, Blockchain Explorer + Receipt Verification 4 bước.
7. **Tuần 8 — Kiểm thử & tài liệu**: test integration cho luồng donation→ledger→anchor→verify, load test (đã có thư mục load-tests), cập nhật OpenAPI, tài liệu đồ án.

## 16. Ưu điểm và nhược điểm

**Ưu điểm:**

- Minh bạch kiểm chứng được end-to-end (hash chain → Merkle → anchor công khai) mà không cần tiền điện tử, ví hay smart contract — chi phí gần bằng 0, demo offline được (LOCAL_SIMULATION).
- Dữ liệu tài chính bất biến ở tầng DB (trigger) lẫn tầng nghiệp vụ (chỉ Request Update) — đúng chuẩn kiểm toán.
- Kiến trúc sẵn có (outbox, streams, idempotency, database-per-service) đã đúng mẫu ngành, chỉ cần củng cố — rủi ro refactor thấp.
- Phạm vi vừa sức đồ án: mọi hạng mục là mở rộng tăng dần, không viết lại.

**Nhược điểm / trade-off:**

- Anchor theo batch ⇒ có độ trễ giữa lúc quyên góp và lúc "được neo" (chấp nhận được, hiển thị trạng thái PENDING).
- Tin cậy vẫn phụ thuộc server tính hash đúng lúc ghi (không phải trustless hoàn toàn như blockchain công khai đầy đủ) — cần nêu rõ giới hạn trong đồ án.
- 3 database tách biệt ⇒ báo cáo tổng hợp phải gọi nhiều service, dữ liệu denormalized (organization_name, campaign_title) có thể lệch khi đổi tên — xử lý bằng sự kiện cập nhật hoặc chấp nhận snapshot-at-time.
- Refresh token trong cookie đòi hỏi cấu hình CSRF/SameSite đúng; tăng độ phức tạp so với JWT đơn.
- Redis là điểm phụ thuộc chung (stream + cache + rate limit) — cần fallback degrade (cache miss → DB) như code hiện tại đã làm với stream.
