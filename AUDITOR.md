# Kuber — Auditor Log

> Living document. Updated after every sprint. Tracks progress, tech debt, and open issues.
> Last updated: 2026-03-19

---

## Project Status

| Area | Status | Notes |
|------|--------|-------|
| Core auth | ⚠️ Needs audit | JWT works, refresh needs token family tracking, 2FA not implemented |
| Dashboard | 🔴 Broken | API response shape mismatch (partially fixed) |
| Accounts | 🔴 Likely broken | API shape audit pending |
| Transactions | 🔴 Likely broken | API shape audit pending |
| Budget | 🔴 Likely broken | API shape audit pending |
| Cash Flow | 🔴 Likely broken | API shape audit pending |
| Reports | 🔴 Likely broken | API shape audit pending |
| Recurring | 🔴 Likely broken | API shape audit pending |
| Goals | 🔴 Likely broken | API shape audit pending |
| Investments | 🔴 Likely broken | API shape audit pending |
| Settings | 🔴 Likely broken | API shape audit pending |
| Notifications | 🔴 Likely broken | API shape audit pending |
| AI Advisor | 🔴 Mock only | Multi-provider not implemented |
| E2E Tests | 🔴 None | No tests exist |
| Unit Tests | 🔴 None | No tests exist |
| Docker prod | ⚠️ Partial | No Nginx, no prod compose |
| 2FA | 🔴 Not built | Planned |
| SMTP Email | 🔴 Not built | Schema exists, no sender |
| Open Source docs | 🔴 Not done | LICENSE, CONTRIBUTING missing |

**Legend:** 🟢 Done | ⚠️ Partial / Needs work | 🔴 Not done / Broken

---

## Sprint Log

### Sprint 0 — Foundation & Governance (2026-03-19)
**Goal:** Set up working standards, audit the codebase, establish agent workflow.

**Completed:**
- [x] Created `CLAUDE.md` with full working standards
- [x] Created `AUDITOR.md` (this file)
- [x] Full bug audit initiated (API shape mismatch analysis)

**In Progress:**
- [ ] Full API shape mismatch fix (all 14 route modules)
- [ ] TypeScript strict mode audit

**Deferred to Sprint 1:**
- ESLint strict config + Husky pre-commit
- GitHub Actions CI

---

## Tech Debt Register

| ID | Item | Priority | Sprint | Notes |
|----|------|----------|--------|-------|
| TD-001 | API response shape mismatch — all pages broken | P0 | Sprint 1 | Server removed `{data:...}` wrapper but client not updated everywhere |
| TD-002 | No tests at all (unit or E2E) | P0 | Sprint 3 | Risk: regressions invisible |
| TD-003 | Refresh token family tracking not implemented | P1 | Sprint 2 | Security risk: stolen refresh tokens not detectable |
| TD-004 | 2FA (TOTP) not implemented | P1 | Sprint 2 | Planned feature |
| TD-005 | No SMTP email sender | P1 | Sprint 2 | Password reset emails don't actually send |
| TD-006 | AI Advisor is mock-only | P2 | Sprint 5 | Multi-provider (Claude/OpenAI/Gemini/Ollama/OpenRouter) needed |
| TD-007 | No Nginx reverse proxy in Docker | P1 | Sprint 4 | Required for production self-hosting |
| TD-008 | No production Docker Compose | P1 | Sprint 4 | docker-compose.prod.yml missing |
| TD-009 | Seed data not realistic enough | P2 | Sprint 4 | Needs multi-year data, multiple personas |
| TD-010 | No LICENSE file | P1 | Sprint 6 | Required for open source |
| TD-011 | No CONTRIBUTING.md | P2 | Sprint 6 | Open source requirement |
| TD-012 | Rules engine has no UI | P3 | Sprint 7 | Backend exists, frontend missing |
| TD-013 | Plaid/MX bank sync not built | P3 | Sprint 7+ | Manual entry only for now |
| TD-014 | No audit log table for financial changes | P1 | Sprint 2 | Security/compliance requirement |
| TD-015 | No cursor-based pagination on transactions | P2 | Sprint 5 | May load all records |
| TD-016 | TypeScript strict mode not enforced | P2 | Sprint 1 | `any` types exist |
| TD-017 | No CSP headers configured in Helmet | P1 | Sprint 2 | XSS mitigation |
| TD-018 | Account lockout after failed logins missing | P1 | Sprint 2 | Brute force protection |
| TD-019 | OpenAPI/Swagger docs missing | P3 | Sprint 6 | Developer experience |
| TD-020 | No multi-stage Docker builds | P2 | Sprint 4 | Dev image ships devDependencies to prod |

---

## Open Issues

| ID | Issue | Status | Sprint |
|----|-------|--------|--------|
| BUG-001 | DashboardPage API shape mismatch | 🔴 Open | Sprint 1 |
| BUG-002 | All other pages likely have same mismatch | 🔴 Open | Sprint 1 |
| BUG-003 | Email password reset sends nothing | 🔴 Open | Sprint 2 |

---

## Feature Backlog

| ID | Feature | Priority | Phase |
|----|---------|----------|-------|
| FEAT-001 | TOTP 2FA | P1 | Phase 2 |
| FEAT-002 | SMTP email (Nodemailer) | P1 | Phase 2 |
| FEAT-003 | AI Advisor multi-provider | P2 | Phase 5 |
| FEAT-004 | AI Advisor: Claude, OpenAI, Gemini, Ollama, OpenRouter | P2 | Phase 5 |
| FEAT-005 | Nginx + prod Docker Compose | P1 | Phase 4 |
| FEAT-006 | Multi-stage Docker builds | P2 | Phase 4 |
| FEAT-007 | Plaid bank sync | P3 | Phase 7+ |
| FEAT-008 | MX bank sync | P3 | Phase 7+ |
| FEAT-009 | Rules engine UI | P3 | Phase 7 |
| FEAT-010 | Audit log (financial change history) | P1 | Phase 2 |
| FEAT-011 | Account lockout / brute force protection | P1 | Phase 2 |
| FEAT-012 | Refresh token family (theft detection) | P1 | Phase 2 |
| FEAT-013 | Cursor-based pagination for transactions | P2 | Phase 5 |
| FEAT-014 | OpenAPI/Swagger documentation | P3 | Phase 6 |
| FEAT-015 | GitHub Actions CI pipeline | P1 | Phase 1 |

---

## Security Audit Checklist

- [ ] All routes with body have Zod validation
- [ ] All protected routes use `requireAuth`
- [ ] All DB queries scoped to `householdId`
- [ ] JWT secrets are long (64+ chars) and randomized
- [ ] Refresh tokens stored hashed
- [ ] Refresh token invalidated on password change
- [ ] Rate limiting on auth endpoints (10 req/15min)
- [ ] CORS allows only CLIENT_URL in production
- [ ] Helmet CSP configured
- [ ] bcrypt rounds ≥ 12
- [ ] No sensitive data in logs
- [ ] Account lockout after N failed attempts
- [ ] TOTP 2FA implemented
- [ ] Audit log for financial record changes

---

## Definition of Done (per feature)

- [ ] Feature works as intended
- [ ] TypeScript: no `any` without comment
- [ ] Zod validation on all new routes
- [ ] Unit tests written (if applicable)
- [ ] E2E/smoke test covers the feature
- [ ] `AUDITOR.md` updated
- [ ] No new ESLint errors

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | Custom JWT, not Auth0 | Self-hostable, no external dependency |
| 2026-03-19 | Turborepo monorepo | Shared types, unified builds |
| 2026-03-19 | SMTP over email SaaS | User configures their own provider |
| 2026-03-19 | Manual bank entry first | Plaid/MX integration in later phase |
| 2026-03-19 | Multi-provider AI advisor | User configures preferred AI model |
| 2026-03-19 | MIT License | Open source, permissive |
