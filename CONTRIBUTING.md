# Contributing to Kuber

Thank you for your interest in contributing. Kuber is a self-hostable personal finance app built with React, Express, Prisma, and PostgreSQL.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Development Commands](#development-commands)
- [Branch Strategy](#branch-strategy)
- [Commit Style](#commit-style)
- [Pull Request Checklist](#pull-request-checklist)
- [Code Conventions](#code-conventions)
- [Reporting Bugs](#reporting-bugs)
- [Security Vulnerabilities](#security-vulnerabilities)

---

## Development Setup

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Docker + Docker Compose** — [docker.com](https://www.docker.com)
- **npm** (bundled with Node)

### Steps

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/kuber.git
cd kuber

# 2. Install all workspace dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Open .env and fill in the required values (see comments in the file)

# 4. Start everything (database + server + client)
make dev
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Health: http://localhost:4000/health

Demo credentials (after seeding): `demo@kuber.app` / `password123`

---

## Development Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start all services (DB + server + client) |
| `make db-migrate` | Run pending Prisma migrations |
| `make db-seed` | Seed the database with realistic test data |
| `make db-reset` | Drop, re-migrate, and re-seed (full reset) |
| `make db-studio` | Open Prisma Studio at http://localhost:5555 |
| `make up` | Start Docker containers in the background |
| `make down` | Stop all Docker containers |
| `make logs` | Follow all container logs |
| `npm run lint` | Run ESLint across all workspaces |
| `npm run typecheck` | Run `tsc --noEmit` across all workspaces |
| `npm run test` | Run all unit tests (Vitest) |
| `npm run test:e2e` | Run Playwright end-to-end tests |

---

## Branch Strategy

1. **Fork** the repository to your GitHub account.
2. Create a branch from `main` using the naming convention:
   - `feat/short-description` — new features
   - `fix/short-description` — bug fixes
   - `chore/short-description` — maintenance, dependency updates
   - `docs/short-description` — documentation only
3. Open a **Pull Request** targeting the `main` branch of the upstream repo.

Keep branches focused on a single concern. Large, sprawling PRs are hard to review.

---

## Commit Style

Kuber follows [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>: <short summary in present tense>

# Examples:
feat: add recurring transaction rules engine
fix: correct budget progress calculation for split categories
chore: upgrade Prisma to 5.12
docs: add self-hosting guide to README
test: add E2E smoke tests for goals page
refactor: extract account form into shared component
```

- Use lowercase for the summary.
- Keep the summary under 72 characters.
- Reference GitHub issues where relevant: `fix: correct login redirect (#42)`

---

## Pull Request Checklist

Before submitting a PR, confirm the following:

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run lint` passes with no errors
- [ ] No new `any` types introduced without a `// TODO:` comment explaining why
- [ ] All new server routes have Zod validation on the request body
- [ ] New features include at minimum a smoke test
- [ ] `AUDITOR.md` updated if the PR introduces meaningful new work or resolves known debt
- [ ] The PR description clearly explains what changed and why

---

## Code Conventions

These rules are enforced during review. Deviating from them will require changes before merge.

### Server (Express / Prisma)

**Response shape — no wrappers:**
```typescript
// Correct
res.json(accounts)
res.status(201).json(newAccount)
res.json({ message: 'Deleted' })

// Wrong — never do this
res.json({ data: accounts })
```

**Always scope queries to the authenticated household:**
```typescript
const accounts = await prisma.account.findMany({
  where: { householdId: req.householdId }  // from requireAuth middleware
})
```

**Zod validation on every route with a request body:**
```typescript
const schema = z.object({ name: z.string().min(1), ... })
const body = schema.parse(req.body)
```

**Soft deletes only — never hard-delete financial records:**
```typescript
await prisma.transaction.update({
  where: { id },
  data: { isDeleted: true }
})
```

### Client (React / TypeScript)

- Use TanStack Query for all server state; Zustand only for UI/auth state.
- Query keys must be arrays: `['accounts']`, `['transactions', { page, filter }]`.
- Every mutation should handle errors with a toast:
  ```typescript
  onError: (err: AxiosError) => {
    toast.error(err.response?.data?.error ?? 'Something went wrong')
  }
  ```
- Page components live in `client/src/pages/<feature>/`. Shared UI in `client/src/components/`.

---

## Reporting Bugs

Please open a [GitHub Issue](https://github.com/yourusername/kuber/issues) with:

1. A clear, descriptive title.
2. Steps to reproduce the problem.
3. Expected behavior vs. actual behavior.
4. Your environment (OS, Node version, Docker version, browser if relevant).
5. Any relevant logs or screenshots.

Check existing issues before opening a new one — your bug may already be tracked.

---

## Security Vulnerabilities

**Do not report security vulnerabilities in public GitHub Issues.**

If you discover a security issue, please email the maintainers directly. You will find the contact address pinned in the repository's Security tab (or the `SECURITY.md` file when it exists). We will acknowledge your report within 48 hours and aim to release a fix within 14 days for confirmed critical issues.

We appreciate responsible disclosure and will credit reporters in the release notes (unless you prefer to remain anonymous).
