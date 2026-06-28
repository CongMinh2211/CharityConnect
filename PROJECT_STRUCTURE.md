# CharityConnect project structure

```text
charityconnect/
  web/                         React + TypeScript + Vite frontend
    src/app/                   AppShell, layout providers
    src/auth/                  AuthGuard, AuthContext
    src/features/account/      Profile, password, sessions, reset password
    src/features/admin/        Admin-facing feature modules
    src/features/campaigns/    Campaign UI feature modules
    src/features/engagement/   Saved/followed campaigns
    src/features/notifications Web notifications
    src/features/organization/ Financial plan and milestone UI
    src/lib/                   API client and mock localStorage API
    src/pages/                 Route-level pages
    src/types.ts               Shared frontend DTOs

  services/
    identity/                  Auth, users, roles, sessions, Gmail outbox
      src/account.ts           Profile, password, sessions, admin user control
      src/auth.ts              JWT and session validation middleware
      sql/004_account_security.sql
    campaign/                  Campaigns, moderation, budget, risk, audit
      sql/005_controlled_crud.sql
    donation/                  Donations, receipts, PDF, ledger, TrustChain
    assistant/                 Internal-first AI assistant

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

## Mutability policy

- Editable/soft-deletable: draft or rejected campaign content, draft or rejected impact reports, organization application content before approval.
- Immutable: donation amount, receipt number, ledger entries, Merkle proofs, anchors, verified evidence hash, and audit logs.
- Approved campaign content is locked from direct edit. A later revision workflow can be added without changing existing immutable records.

## Deployment split

- Vercel: deploys `web` as a static Vite app. For a demo-only deployment set `VITE_USE_MOCK_API=true`.
- Render/Railway/VPS: deploys Docker services (`gateway`, `identity`, `campaign`, `donation`, `assistant`) plus managed PostgreSQL and Redis.
- Secrets such as OpenAI, Gmail OAuth2, Sepolia RPC/private key, JWT secret and database URLs must be set in cloud dashboards, never committed.

