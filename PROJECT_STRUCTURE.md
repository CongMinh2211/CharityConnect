# CharityConnect project structure

```text
charityconnect/
  frontend/                    React + TypeScript + Vite frontend (FE)
    src/app/                   AppShell, layout providers
    src/auth/                  AuthGuard, AuthContext
    src/features/account/      Profile, password, sessions, reset password
    src/features/admin/        Admin-facing feature modules
    src/features/campaigns/    Campaign UI feature modules
    src/features/engagement/   Saved/followed campaigns
    src/features/notifications Web notifications
    src/features/organization/ Financial plan and milestone UI
    src/features/transparency/  Ledger, receipt verification and TrustChain UI
    src/features/donations/     Donation flow, receipts, history and PDF
    src/features/analytics/     Public/role-based statistics pages
    src/shared/components/      Shared cards, feature hub, state and route helpers
    src/shared/lib/             Shared UI data catalogs such as role function map
    src/lib/                   API client and mock localStorage API
    src/pages/                 Route-level pages
    src/types.ts               Shared frontend DTOs

  backend/                     Microservices (BE)
    identity/                  Auth, users, roles, sessions, Gmail outbox
      src/account.ts           Profile, password, sessions, admin user control
      src/auth.ts              JWT and session validation middleware
      src/tokens.ts            Refresh token rotation + reuse detection
      src/passwords.ts         Password history + login lockout
      sql/005_security_hardening.sql
    campaign/                  Campaigns, moderation, budget, risk, audit
      sql/005_controlled_crud.sql
    donation/                  Donations, receipts, PDF, ledger, TrustChain
      app/diagnostics.py       Trust diagnostics DTO shaping for ledger/receipt checks
    assistant/                 Internal-first AI assistant
      app/guides.py            Role-guide API data for allowed/locked features

  nginx/                       API gateway for `/api/v1`
  observability/               Prometheus and Grafana
  load-tests/                  k6 load checks
  docker-compose.yml           Full local stack
  vercel.json                  Frontend static deploy config
```

## Role-based ownership

- Public users can view campaigns, statistics, ledger transparency, and receipt verification.
- Donors can manage account security, saved/followed campaigns, notifications, donations, receipts, and annual PDF statements.
- Organizations can manage their account, create/edit/delete draft or rejected campaigns, manage financial plans, milestones, and impact reports.
- Admins can manage their account, enable/disable users, review organizations/campaigns/reports, inspect risk score/audit logs, and create TrustChain anchors.

## Role-aware UI logic

- `roleFunctionGroups` is the single frontend catalog for public, donor, organization and admin functions.
- `AppShell`, `FunctionMenu`, mobile drawer and the home `FeatureHub` read from that catalog so role permissions stay consistent.
- Feature route wrappers live under `frontend/src/features/*`; legacy `frontend/src/pages/*` files remain as route-compatible containers during refactor.
- Assistant exposes `GET /assistant/role-guide` with the same role map for Python/API demos.

## Mutability policy

- Editable/soft-deletable: draft or rejected campaign content, draft or rejected impact reports, organization application content before approval.
- Immutable: donation amount, receipt number, ledger entries, Merkle proofs, anchors, verified evidence hash, and audit logs.
- Approved campaign content is locked from direct edit. A later revision workflow can be added without changing existing immutable records.

## Deployment split

- Vercel: deploys `frontend` as a static Vite app. For a demo-only deployment set `VITE_USE_MOCK_API=true`.
- Render/Railway/VPS: deploys Docker services (`gateway`, `identity`, `campaign`, `donation`, `assistant`) plus managed PostgreSQL and Redis.
- Secrets such as OpenAI, Gmail OAuth2, Sepolia RPC/private key, JWT secret and database URLs must be set in cloud dashboards, never committed.
