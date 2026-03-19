# Kuber — Claude Code Working Guide

> Personal finance app. Self-hostable. Open source. Production-grade.
> Stack: React 18 + TypeScript + Vite | Express + Prisma + PostgreSQL | Docker + Nginx

---

## Project Layout

```
Kuber/
├── client/          # React frontend (port 3000)
├── server/          # Express API (port 4000)
├── shared/          # Shared TypeScript types/enums
├── nginx/           # Nginx config
├── .claude/         # Agent skills, memory, docs
├── CLAUDE.md        # This file
├── AUDITOR.md       # Tech debt + progress tracker (update after every sprint)
├── docker-compose.yml
├── docker-compose.prod.yml
└── Makefile
```

---

## Tech Stack Quick Reference

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| State | Zustand (auth), TanStack React Query v5 (server state) |
| Router | React Router v6, lazy-loaded pages |
| Backend | Node.js, Express 4, TypeScript, tsx |
| ORM | Prisma 5 + PostgreSQL 16 |
| Auth | JWT (15min) + httpOnly refresh cookie (7d) + TOTP 2FA |
| AI Advisor | Multi-provider: Claude, OpenAI, Gemini, Ollama, OpenRouter, None |
| Email | SMTP (user-configurable: Gmail, etc.) via Nodemailer |
| Testing | Vitest (unit), Playwright (E2E) |
| Infra | Docker Compose + Nginx reverse proxy |

---

## Development Commands

```bash
# Start everything (DB + server + client)
make dev          # or: npm run dev

# Database
make db-migrate   # Run Prisma migrations
make db-seed      # Seed realistic test data
make db-reset     # Drop + migrate + seed (full reset)
make db-studio    # Open Prisma Studio on :5555

# Docker
make up           # docker-compose up -d
make down         # docker-compose down
make logs         # Follow all container logs

# Testing
npm run test           # All unit tests
npm run test:e2e       # Playwright E2E
npm run test:smoke     # Smoke tests only
npm run test:coverage  # Coverage report

# Build
npm run build     # Build all packages
npm run lint      # ESLint across workspaces
npm run typecheck # tsc --noEmit across workspaces
```

---

## API Conventions

### Response Shape (ALWAYS follow this)

```typescript
// Success — return data directly, no wrapper
res.json(data)                          // GET single or collection
res.status(201).json(data)             // POST created
res.json({ message: 'Deleted' })       // DELETE

// Error — always use this shape
res.status(4xx|5xx).json({ error: 'Human-readable message' })
```

**NO `{ data: ... }` wrappers from the server.** The Axios instance in the client handles `.data` extraction from the HTTP response envelope automatically.

### Auth Flow

1. `POST /api/v1/auth/login` → returns `{ accessToken, user }` + sets httpOnly `refreshToken` cookie
2. All protected routes require `Authorization: Bearer <accessToken>`
3. Axios interceptor auto-refreshes on 401 via `POST /api/v1/auth/refresh`
4. JWT payload: `{ userId, householdId, email }`

### Route Naming

```
GET    /api/v1/resource           # list
POST   /api/v1/resource           # create
GET    /api/v1/resource/:id       # get one
PUT    /api/v1/resource/:id       # update
DELETE /api/v1/resource/:id       # delete
POST   /api/v1/resource/:id/action # sub-action
```

---

## Database Conventions

- All models have `id` (cuid), `createdAt`, `updatedAt`
- Household-scoped: every query MUST filter by `householdId` from JWT
- Soft deletes: use `isDeleted: Boolean @default(false)` — never hard delete financial records
- Migration naming: `YYYYMMDDHHMMSS_descriptive_name`
- Always run `npx prisma format` after schema changes

### Multi-tenancy Rule

```typescript
// ALWAYS scope queries to the authenticated household
const data = await prisma.account.findMany({
  where: { householdId: req.householdId }  // from requireAuth middleware
})
```

---

## Security Requirements

1. **Input validation**: Every route with a body MUST use a Zod schema
2. **Auth**: All non-public routes use `requireAuth` middleware
3. **Rate limiting**: Auth endpoints: 10 req/15min. API: 100 req/min
4. **Secrets**: Never log JWT secrets, passwords, tokens. Use `DEBUG=kuber:*` for dev logs
5. **CORS**: Only allow `CLIENT_URL` origin in production
6. **2FA**: TOTP-based (authenticator app). Enforced as optional, never mandatory
7. **Passwords**: bcrypt, 12 rounds minimum
8. **Refresh tokens**: Stored hashed in DB, invalidated on password change

---

## Agent Team Roles

| Agent | When to Use | Invocation |
|-------|-------------|------------|
| **Planner** | Before any multi-file feature | `/plan <feature>` |
| **Developer** | Implementing planned work | Default Claude |
| **Security Reviewer** | After any auth/input/API work | `/everything-claude-code:security-review` |
| **Code Reviewer** | After implementing a feature | `/everything-claude-code:code-reviewer` |
| **E2E Tester** | After completing a feature | `/everything-claude-code:e2e` |
| **Auditor** | After each sprint | Update `AUDITOR.md` manually |
| **Doc Updater** | After major changes | `/everything-claude-code:doc-updater` |

### Sprint Workflow

```
/plan → implement → /security-review → /code-review → /e2e → update AUDITOR.md
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://kuber:kuber_dev@localhost:5433/kuber_db

# Auth
JWT_SECRET=<min 64 chars random>
JWT_REFRESH_SECRET=<min 64 chars random>
TOTP_APP_NAME=Kuber

# Server
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Kuber <noreply@yourdomain.com>"

# AI Advisor (all optional — user configures in Settings)
# Provider stored in UserPreference table, API key stored encrypted
```

---

## Frontend Conventions

### File Structure

```
client/src/
├── components/     # Shared UI components (no page-specific logic)
├── pages/          # One folder per route
│   └── feature/
│       ├── FeaturePage.tsx      # Page component
│       ├── components/          # Feature-specific components
│       └── hooks/               # Feature-specific hooks
├── hooks/          # Shared hooks
├── lib/            # axios instance, utilities
├── stores/         # Zustand stores
└── types/          # Frontend-only types (extend shared types here)
```

### Query Keys Convention

```typescript
// Always use arrays, most specific last
['accounts']                     // list
['accounts', accountId]          // single
['transactions', { page, filter }] // filtered list
['dashboard', 'summary']         // namespaced
```

### Error Handling

```typescript
// Every mutation should handle errors
const mutation = useMutation({
  mutationFn: ...,
  onError: (err: AxiosError) => {
    toast.error(err.response?.data?.error ?? 'Something went wrong')
  }
})
```

---

## Testing Standards

### Unit Tests (Vitest)
- File: `*.test.ts` next to the file being tested
- Coverage target: 80% for utilities and hooks
- Mock Prisma with `vitest-mock-extended`

### E2E Tests (Playwright)
- File: `tests/e2e/*.spec.ts`
- Test real DB (test database, seeded before run)
- Every new page/feature needs at minimum a smoke test

### Smoke Test Checklist (run before any release)
- [ ] Login + logout works
- [ ] Dashboard loads without errors
- [ ] Can create an account
- [ ] Can create a transaction
- [ ] Can create a budget
- [ ] Can create a goal
- [ ] Settings page loads

---

## Docker Setup

```yaml
# Services
postgres     # PostgreSQL 16, port 5433
server       # Express API, port 4000
client       # Vite dev / built static, port 3000
nginx        # Reverse proxy, port 80/443
```

### Port Map

| Service | Internal | Exposed (dev) |
|---------|----------|---------------|
| Postgres | 5432 | 5433 |
| Server | 4000 | 4000 |
| Client | 3000 | 3000 |
| Nginx | 80 | 80 |

---

## Open Source Standards

- License: MIT
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- Branch strategy: `main` (stable) ← `feat/*` / `fix/*` (solo = direct to main ok during dev)
- Every PR / feature must update `AUDITOR.md`

---

## Known Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Custom JWT (no Auth0) | Self-hostable, no external dependency |
| Turborepo monorepo | Shared types, unified builds |
| Prisma (not raw SQL) | Type safety, migrations, readable queries |
| Tailwind v4 | No config file, CSS-first, zero purge setup |
| React Query over Redux | Server state separate from UI state |
| No Plaid yet | Manual entry first; Plaid/MX in later phase |
| SMTP over email SaaS | Self-hostable, user configures their own provider |
| Multi-provider AI | User chooses Claude/OpenAI/Gemini/Ollama/OpenRouter/None |

---

## DO NOT

- ❌ Return `{ data: ... }` wrappers from server routes
- ❌ Hard-delete financial records (use soft delete)
- ❌ Query without `householdId` scope
- ❌ Store plain-text passwords or secrets
- ❌ Skip Zod validation on any route with a request body
- ❌ Use `any` in TypeScript without a `// TODO:` comment
- ❌ Add new npm packages without checking bundle impact
- ❌ Commit `.env` files
- ❌ Leave TODO comments without filing in `AUDITOR.md`
