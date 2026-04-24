# Kuber — Claude Code Working Guide

> Personal finance app. Self-hostable. Open source. Production-grade.
> Stack: React 18 + TypeScript + Vite | Express + Prisma + PostgreSQL | Docker + Nginx

---

## graphify

This project has a graphify knowledge graph at graphify-out/.

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md
- For cross-module questions, prefer `graphify query "<question>"` over grep
- Use `graphify path "<A>" "<B>"` for dependency tracing
- After modifying files, `graphify update .` runs automatically via hook

---

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Suggest running /cost when a session is running long to monitor cache ratio.
- Recommend starting a new session when switching to an unrelated task.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

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

| Layer      | Tech                                                             |
| ---------- | ---------------------------------------------------------------- |
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS v4                      |
| State      | Zustand (auth), TanStack React Query v5 (server state)           |
| Router     | React Router v6, lazy-loaded pages                               |
| Backend    | Node.js, Express 4, TypeScript, tsx                              |
| ORM        | Prisma 5 + PostgreSQL 16                                         |
| Auth       | JWT (15min) + httpOnly refresh cookie (7d) + TOTP 2FA            |
| AI Advisor | Multi-provider: Claude, OpenAI, Gemini, Ollama, OpenRouter, None |
| Email      | SMTP (user-configurable: Gmail, etc.) via Nodemailer             |
| Testing    | Vitest (unit), Playwright (E2E)                                  |
| Infra      | Docker Compose + Nginx reverse proxy                             |

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
  where: { householdId: req.householdId }, // from requireAuth middleware
});
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

| Agent                 | When to Use                   | Invocation                                |
| --------------------- | ----------------------------- | ----------------------------------------- |
| **Planner**           | Before any multi-file feature | `/plan <feature>`                         |
| **Developer**         | Implementing planned work     | Default Claude                            |
| **Security Reviewer** | After any auth/input/API work | `/everything-claude-code:security-review` |
| **Code Reviewer**     | After implementing a feature  | `/everything-claude-code:code-reviewer`   |
| **E2E Tester**        | After completing a feature    | `/everything-claude-code:e2e`             |
| **Auditor**           | After each sprint             | Update `AUDITOR.md` manually              |
| **Doc Updater**       | After major changes           | `/everything-claude-code:doc-updater`     |

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
["accounts"][("accounts", accountId)][("transactions", { page, filter })][ // list // single // filtered list
  ("dashboard", "summary")
]; // namespaced
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

| Service    | Internal | Exposed (dev) |
| ---------- | -------- | ------------- |
| Postgres   | 5432     | 5433          |
| Server     | 9002     | 9002          |
| Client     | 80       | 9001          |
| Nginx      | 80       | 80            |
| Grafana    | 3000     | 9003          |
| Prometheus | 9090     | 9004          |
| Loki       | 3100     | 9005          |
| n8n        | 5678     | 9006          |

---

## Open Source Standards

- License: MIT
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)
- Branch strategy: `master` (stable) ← `feat/*` / `fix/*` / `chore/*` / `test/*`
- **Never commit directly to `master` or `main`** — always branch, then open a PR
- Branch naming: `feat/short-description`, `fix/short-description`, `test/short-description`, `chore/short-description`
- Every PR / feature must update `AUDITOR.md`

### Git Workflow

```bash
# 1. Always branch from latest master
git checkout master && git pull
git checkout -b feat/my-feature

# 2. Make atomic commits (one logical change per commit)
git add <specific files>
git commit -m "feat: description of what and why"

# 3. Push and open PR — never push directly to master
git push -u origin feat/my-feature
gh pr create
```

- Commits should be atomic: one logical change per commit
- Commit message body explains _why_, not just _what_
- Squash noise commits before PR (fixup, wip) — keep history clean

---

## Known Architecture Decisions

| Decision               | Rationale                                                |
| ---------------------- | -------------------------------------------------------- |
| Custom JWT (no Auth0)  | Self-hostable, no external dependency                    |
| Turborepo monorepo     | Shared types, unified builds                             |
| Prisma (not raw SQL)   | Type safety, migrations, readable queries                |
| Tailwind v4            | No config file, CSS-first, zero purge setup              |
| React Query over Redux | Server state separate from UI state                      |
| No Plaid yet           | Manual entry first; Plaid/MX in later phase              |
| SMTP over email SaaS   | Self-hostable, user configures their own provider        |
| Multi-provider AI      | User chooses Claude/OpenAI/Gemini/Ollama/OpenRouter/None |

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

<!-- rtk-instructions v2 -->

# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:

```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)

```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)

```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)

```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)

```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands

```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category         | Commands                       | Typical Savings |
| ---------------- | ------------------------------ | --------------- |
| Tests            | vitest, playwright, cargo test | 90-99%          |
| Build            | next, tsc, lint, prettier      | 70-87%          |
| Git              | status, log, diff, add, commit | 59-80%          |
| GitHub           | gh pr, gh run, gh issue        | 26-87%          |
| Package Managers | pnpm, npm, npx                 | 70-90%          |
| Files            | ls, read, grep, find           | 60-75%          |
| Infrastructure   | docker, kubectl                | 85%             |
| Network          | curl, wget                     | 65-70%          |

Overall average: **60-90% token reduction** on common development operations.

<!-- /rtk-instructions -->
