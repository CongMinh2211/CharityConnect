# CharityConnect project structure

```text
charityconnect/
  frontend/                    Frontend React + TypeScript + Vite
    src/app/                   AppShell, layout and route shell
    src/auth/                  Auth context and route guards
    src/features/account/      Login, register, profile, password, sessions
    src/features/admin/        Admin queues, users, risk, audit, TrustChain
    src/features/analytics/    Public and role-based statistics
    src/features/campaigns/    Campaign list/detail and campaign UI wrappers
    src/features/content/      Verify content hub, articles, alerts, KPIs
    src/features/donations/    Donation flow, receipts, history, PDF statement
    src/features/engagement/   Saved and followed campaigns
    src/features/navigation/   Role-aware function menu and drawer
    src/features/notifications Web notifications
    src/features/organization/ Organization dashboard, budget, milestones
    src/features/transparency/ Ledger, receipt verification, TrustChain
    src/shared/components/     Shared route/state/function hub components
    src/shared/lib/            Role function catalog and UI helpers
    src/lib/                   API client and local data adapter
    src/pages/                 Route-compatible page containers
    src/types.ts               Shared frontend DTOs

  backend/                     Backend microservices
    identity/                  Auth, users, roles, sessions, Gmail outbox
      src/account.ts           Profile, password, sessions, admin user control
      src/auth.ts              JWT and session middleware
      src/tokens.ts            Refresh token rotation and reuse detection
      src/passwords.ts         Password history and login lockout
      sql/                     Identity migrations
    campaign/                  Campaigns, moderation, financial plan, risk
      sql/                     Campaign, budget, milestone and CRUD migrations
    donation/                  Donations, receipts, PDF, ledger, TrustChain
      app/diagnostics.py       Trust diagnostics DTOs for receipt/ledger checks
      migrations/              Donation, analytics and TrustChain migrations
    assistant/                 Internal-first AI assistant
      app/guides.py            Role guide API data
      app/knowledge.py         CharityConnect knowledge base
      app/content_verify.py    Verified content seed, scoring and ingest helpers

  nginx/                       API gateway configuration
  docker-compose.yml           Full local service stack
  vercel.json                  Root deploy helper for frontend static build
  .env.example                 Placeholder environment variables only
```

## Role-based UI ownership

- Public users can view verified content, campaigns, statistics, ledger transparency, receipt verification and chatbot.
- Donors can manage account security, saved/followed campaigns, notifications, donations, receipts and annual statements.
- Organizations can manage campaign drafts, rejected campaigns, financial plans, milestones and impact reports.
- Admins can manage user status, review organizations/campaigns/reports, inspect risk/audit logs and create TrustChain anchors.

## Role-aware implementation

- `roleFunctionGroups` is the single frontend catalog for public, donor, organization and admin functions.
- `AppShell`, desktop function menu, mobile drawer and home feature hub read the same catalog so permissions stay consistent.
- Feature route wrappers live under `frontend/src/features/*`; the current `frontend/src/pages/*` files remain as stable page containers to avoid breaking routes during incremental refactor.
- Assistant exposes `GET /assistant/role-guide` with the same functional map for API-driven guidance.

## Mutability policy

- Editable/soft-deletable: draft or rejected campaign content, draft or rejected impact reports, and organization application content before final approval.
- Immutable: donation amount, receipt number, ledger entries, Merkle proofs, anchors, verified evidence hashes and audit logs.
- Approved campaign content is locked from direct edit. A future revision workflow can be added without changing immutable records.

## Deployment split

- Vercel deploys `frontend` as a static Vite app.
- Render/Railway/VPS deploy Docker services for gateway, identity, campaign, donation and assistant.
- PostgreSQL databases remain separated by service; Redis is used for streams/cache.
- Secrets such as AI provider keys, Gmail OAuth2, Sepolia RPC/private key, JWT secret and database URLs must be configured outside Git.

## Repository hygiene

- Do not commit `.env`, `node_modules`, `dist`, coverage, logs, local uploads, local helper scripts or generated runtime folders.
- CapStone deliverables are generated under `../outputs/CharityConnect_CapStone_Final/` so the code repo stays clean unless final documents are intentionally added later.
