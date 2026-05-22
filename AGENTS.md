# Kuber — Agent Instructions

Personal finance app. Self-hostable, open source, production-grade.

Stack:

- Frontend: React 18, TypeScript, Vite, Tailwind CSS v4
- Backend: Node.js, Express 4, TypeScript
- Database: PostgreSQL 16 + Prisma 5
- Auth: JWT access token + httpOnly refresh cookie + optional TOTP 2FA
- Email: SMTP via Nodemailer
- Testing: Vitest + Playwright
- Infra: Docker Compose + Nginx

---

## Working Agreement

- Be concise.
- Think before editing.
- Read relevant code before changing it.
- Prefer small targeted edits over large rewrites.
- Do not re-read files unless they changed.
- Do not paste large logs or command output.
- Use filtered commands with `head`, `tail`, `grep`, or `rtk`.
- Test changes before saying the task is complete.
- Ask before adding new production dependencies.
- User instructions override this file.

---

## Token-Safe Command Rules

Always prefer `rtk` when available.

Use:

```bash
rtk npm run build
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk git status
rtk git diff
rtk grep "search-term"
```

Avoid unfiltered commands:

```bash
cat large-file
tree
ls -R
npm test
docker logs
git diff
```

When large output is needed, filter it:

```bash
command | head -100
command | tail -100
command | grep "error"
```

---

## Project Layout

```txt
Kuber/
├── client/          # React frontend
├── server/          # Express API
├── shared/          # Shared TypeScript types/enums
├── nginx/           # Nginx config
├── .claude/         # Claude skills, memory, docs
├── CLAUDE.md        # Claude Code instructions
├── AGENTS.md        # Codex/agent instructions
├── AUDITOR.md       # Tech debt + progress tracker
├── docker-compose.yml
├── docker-compose.prod.yml
└── Makefile
```

---

## Modularity and Code Architecture Rules

The full project should stay modular, maintainable, and production-grade. Prefer clear feature boundaries over large catch-all files.

General principles:

- Follow SOLID, DRY, KISS, YAGNI, separation of concerns, dependency inversion, and explicit domain boundaries.
- Prefer composition over inheritance.
- Keep modules cohesive: one module should have one primary reason to change.
- Keep coupling low: do not make unrelated features depend on each other's internals.
- Do not add abstractions just to look "enterprise"; add them only when they reduce real duplication, isolate volatility, or clarify domain behavior.
- Prefer typed domain models, DTOs, schemas, and service interfaces over loose objects and `any`.
- Make invalid states hard to represent with TypeScript types and Zod validation.
- Keep public APIs stable and narrow. Export only what other modules actually need.

File and module size:

- Treat files over 400 lines as candidates for extraction.
- Treat files over 700 lines as technical debt unless there is a clear reason.
- Page files should be thin route/view shells. Move page-specific components to `pages/<feature>/components`, hooks to `pages/<feature>/hooks`, and domain helpers to feature-local `lib` or shared modules.
- Server route files should be thin HTTP adapters. Move business logic into `server/src/services` or focused `server/src/lib` modules.
- Avoid "god" components, "god" services, and large utility grab bags.

Dependency direction:

- UI components may depend on hooks/services, but services must not depend on UI.
- Route handlers may depend on services/lib, but services should not depend on Express request/response objects.
- Shared package code must stay framework-neutral and must not import client or server internals.
- Feature modules should communicate through stable DTOs/services, not deep relative imports into another feature's internals.

Backend patterns:

- Validate request input at the route boundary with Zod.
- Keep authorization, validation, orchestration, and persistence separate where practical.
- Put Prisma queries behind service functions for non-trivial workflows.
- Centralize repeated query scopes such as `householdId`, soft-delete filters, hidden/excluded filters, and role checks.
- Use transactions for multi-write financial workflows.
- Return domain-specific errors that routes translate into `{ error: "..." }` responses.

Frontend patterns:

- Keep React components focused on rendering and interaction.
- Move data fetching/mutations into hooks that use TanStack Query.
- Move pure formatting, filtering, grouping, and calculations into tested helper modules.
- Use shared UI primitives for repeated controls; do not duplicate one-off button/input/table patterns.
- Prefer accessible native controls before custom ARIA widgets.
- Avoid global state unless state is truly cross-page or session-level.

Testing and maintainability:

- Add tests when extracting business logic, fixing regressions, or touching financial calculations.
- Prefer small unit tests for pure helpers and route/service tests for API behavior.
- Add smoke/E2E coverage for new user-visible workflows.
- When fixing debt, leave the code more modular than you found it, but keep edits scoped to the task.
- Track meaningful remaining debt in `AUDITOR.md`; do not leave untracked TODO comments.

---

## Code Quality and Technical Debt Tracking

Always treat code quality, technical debt, and product gaps as first-class project state.

- Keep `AUDITOR.md` as the source of truth for completed hardening work, known debt, gaps, risks, and verification history.
- After any meaningful feature, fix, refactor, security change, or architecture change, update `AUDITOR.md` in the same work slice.
- When finding a gap but not fixing it immediately, record it under a dated audit section with clear scope, impact, and a concrete follow-up.
- When fixing an item from an older audit, update the current audit section and, when practical, reconcile stale audit docs so they do not continue reporting fixed issues as open.
- Track quality debt by category: security, data integrity, exports/imports, auth/access control, modularity, type safety, tests, accessibility, performance, deployment, and documentation.
- Include the verification commands that were actually run. If verification was skipped or blocked, record why.
- Prefer small, dated entries over large rewrites of the audit tracker.
- Do not use hidden or informal TODOs as the tracking system. Code TODOs are allowed only when mirrored in `AUDITOR.md`.

Quality review checklist for every slice:

- Did this change preserve household scoping, soft delete rules, and auth boundaries?
- Did this change reduce or at least avoid increasing oversized files, `any`, duplicate logic, and cross-feature coupling?
- Did this change add or preserve tests for financial calculations, exports/imports, auth, and API contracts?
- Did this change leave any user-visible gap, reliability risk, or operational risk that should be tracked?

---

## Common Commands

```bash
rtk make dev
rtk make up
rtk make down
rtk make logs

rtk make db-migrate
rtk make db-seed
rtk make db-reset
rtk make db-studio

rtk npm run build
rtk npm run lint
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk npm run test:smoke
```

If `rtk` is unavailable, run the normal command but keep output filtered.

---

## API Conventions

Success responses return data directly:

```ts
res.json(data);
res.status(201).json(data);
res.json({ message: "Deleted" });
```

Error responses always use:

```ts
res.status(400).json({ error: "Human-readable message" });
```

Do not return server responses wrapped as:

```ts
res.json({ data });
```

The client Axios instance already extracts `.data` from the HTTP response envelope.

---

## Route Naming

Use REST-style API routes:

```txt
GET    /api/v1/resource
POST   /api/v1/resource
GET    /api/v1/resource/:id
PUT    /api/v1/resource/:id
DELETE /api/v1/resource/:id
POST   /api/v1/resource/:id/action
```

---

## Auth Rules

- Login returns `{ accessToken, user }`.
- Refresh token is stored in an httpOnly cookie.
- Protected routes require `Authorization: Bearer <accessToken>`.
- JWT payload includes `{ userId, householdId, email }`.
- Refresh tokens are stored hashed in the database.
- Refresh tokens must be invalidated on password change.
- 2FA is TOTP-based and optional, not mandatory.

---

## Database Rules

- Every model should have `id`, `createdAt`, and `updatedAt`.
- Financial records must use soft delete.
- Never hard-delete financial records.
- Household-scoped data must always filter by `householdId`.
- `householdId` must come from the authenticated request context.
- Run Prisma format after schema changes.

Example:

```ts
const accounts = await prisma.account.findMany({
  where: {
    householdId: req.householdId,
    isDeleted: false,
  },
});
```

Migration naming format:

```txt
YYYYMMDDHHMMSS_descriptive_name
```

After Prisma schema changes:

```bash
rtk npx prisma format
```

---

## Security Requirements

- Validate every route body with Zod.
- Use `requireAuth` on all non-public routes.
- Rate-limit auth endpoints.
- Rate-limit general API endpoints.
- Never log JWT secrets, passwords, refresh tokens, API keys, or TOTP secrets.
- Production CORS must only allow `CLIENT_URL`.
- Passwords must use bcrypt with at least 12 rounds.
- Refresh tokens must be hashed before storage.
- Do not commit `.env` files.

---

## Frontend Rules

- Shared components go in `client/src/components`.
- Page-specific components stay inside the page folder.
- Server state uses TanStack Query.
- Auth and lightweight UI state use Zustand.
- Avoid unnecessary global state.
- Keep components small and focused.

Frontend structure:

```txt
client/src/
├── components/
├── pages/
│   └── feature/
│       ├── FeaturePage.tsx
│       ├── components/
│       └── hooks/
├── hooks/
├── lib/
├── stores/
└── types/
```

---

## React Query Rules

Query keys must be arrays.

Examples:

```ts
["accounts"];
["accounts", accountId];
["transactions", { page, filter }];
["dashboard", "summary"];
```

Mutation errors should show the server error message when available:

```ts
const mutation = useMutation({
  mutationFn: createAccount,
  onError: (err: AxiosError<{ error?: string }>) => {
    toast.error(err.response?.data?.error ?? "Something went wrong");
  },
});
```

---

## Testing Rules

Unit tests:

- Use Vitest.
- Test files should be next to the file being tested.
- Use `*.test.ts` or `*.test.tsx`.
- Mock Prisma with `vitest-mock-extended` when needed.

E2E tests:

- Use Playwright.
- E2E files go in `tests/e2e/*.spec.ts`.
- Use a test database.
- Seed data before E2E tests.
- Every new page or feature should have at least one smoke test.

Before release, verify:

- Login works.
- Logout works.
- Dashboard loads.
- Account creation works.
- Transaction creation works.
- Budget creation works.
- Goal creation works.
- Settings page loads.

---

## Docker Rules

Services:

- postgres
- server
- client
- nginx

Use:

```bash
rtk make up
rtk make down
rtk make logs
```

Do not paste full Docker logs.

Filter logs:

```bash
rtk docker logs server
rtk docker logs postgres
docker logs server 2>&1 | tail -100
docker logs server 2>&1 | grep "error"
```

---

## Git Rules

- License: MIT.
- Use Conventional Commits.
- Branch from `master`.
- Do not commit directly to `master` or `main`.
- Use feature branches.
- Keep commits atomic.
- Update `AUDITOR.md` after meaningful feature work.

Branch naming:

```txt
feat/short-description
fix/short-description
test/short-description
chore/short-description
docs/short-description
```

Commit examples:

```txt
feat: add household account creation
fix: scope transaction queries by household
test: add dashboard smoke test
docs: update setup guide
chore: update dependencies
```

Workflow:

```bash
rtk git checkout master
rtk git pull
rtk git checkout -b feat/short-description

rtk git status
rtk git diff

rtk git add <specific-files>
rtk git commit -m "feat: short description"
rtk git push -u origin feat/short-description
```

---

## Architecture Decisions

| Decision           | Reason                                            |
| ------------------ | ------------------------------------------------- |
| Custom JWT auth    | Self-hostable, no external auth dependency        |
| Prisma             | Type safety, migrations, readable queries         |
| PostgreSQL         | Reliable relational database                      |
| React Query        | Server state management                           |
| Zustand            | Simple client state                               |
| SMTP               | Self-hostable email setup                         |
| Manual entry first | Keeps finance app simple before bank integrations |
| Multi-provider AI  | User can choose provider or disable AI            |

---

## AI Advisor Rules

- AI provider is optional.
- Supported providers may include Claude, OpenAI, Gemini, Ollama, OpenRouter, or None.
- User selects provider in Settings.
- API keys must be encrypted before storage.
- Never log AI provider API keys.
- App must work when AI provider is set to None.

---

## AUDITOR.md Rules

Update `AUDITOR.md` after meaningful feature work, bug fixes, refactors, security hardening, and any investigation that finds technical debt or product gaps.

Track:

- Completed work
- Known tech debt
- Security concerns
- Test gaps
- Deferred TODOs
- Follow-up items
- Verification commands and results
- Current high-priority gap list when relevant
- Stale audit findings that were fixed or superseded

Do not leave TODO comments in code unless the item is also tracked in `AUDITOR.md`.

---

## Package Rules

Before adding a new npm package:

- Check whether existing dependencies already solve the problem.
- Consider bundle impact.
- Prefer stable, well-maintained packages.
- Avoid adding packages for small utilities.
- Explain why the package is needed.

---

## DO NOT

- Do not return `{ data: ... }` wrappers from API routes.
- Do not hard-delete financial records.
- Do not query household data without `householdId`.
- Do not store plain-text passwords.
- Do not store plain-text refresh tokens.
- Do not log secrets.
- Do not skip Zod validation.
- Do not use `any` without a clear reason.
- Do not add npm packages casually.
- Do not commit `.env` files.
- Do not paste large logs.
- Do not run broad commands without filtering.
- Do not leave untracked TODO comments.
- Do not commit directly to `master` or `main`.

---

## When Unsure

Prefer the safest simple option:

1. Read the relevant code.
2. Make a small targeted change.
3. Run the smallest useful test.
4. Summarize what changed.
5. Mention any remaining risk or follow-up.

---

## GitNexus Usage

Use GitNexus for non-trivial code exploration, refactoring, and impact analysis.

Before editing important functions, classes, methods, API routes, database logic, or shared types:

- Run GitNexus impact analysis.
- Check direct callers, affected flows, and risk level.
- Warn the user before proceeding if risk is HIGH or CRITICAL.

Before committing:

- Run GitNexus change detection.
- Confirm changes only affect expected files, symbols, and execution flows.

Use GitNexus query/context tools when exploring unfamiliar code instead of broad grep/search.

Do not paste full GitNexus manuals or large GitNexus outputs into the conversation.
Summarize the result and only include the important risks or affected areas.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Kuber** (9002 symbols, 14205 relationships, 207 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Kuber/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Kuber/clusters` | All functional areas |
| `gitnexus://repo/Kuber/processes` | All execution flows |
| `gitnexus://repo/Kuber/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
