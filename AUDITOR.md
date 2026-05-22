# Kuber Audit Tracker

Keep this file small and focused on open quality debt, product gaps, and verification gaps. Do not add completed-work history here unless it explains an active risk.

## Tracking Rules

- Update this file after meaningful feature work, bug fixes, refactors, security hardening, or investigations that uncover gaps.
- Track only open debt, active risks, blocked verification, and next actions.
- Remove items once they are fixed and verified.
- Mirror any code TODO here, or remove the code TODO.
- Include verification gaps when tests, builds, lint, E2E, or smoke checks were skipped or blocked.

## Current Priority Debt

- **Modularity:** Continue breaking down oversized files, especially `client/src/pages/settings/tabs/SettingsSections.tsx` at about 1,345 lines, `client/src/pages/settings/components/CategoriesSection.tsx` at about 650 lines, `client/src/pages/transactions/TransactionsPage.tsx`, `client/src/pages/investments/InvestmentsSections.tsx`, `client/src/pages/accounts/AccountsPage.tsx`, and large server route/service modules.
- **Type safety:** Client lint is clean; backend lint still reports 438 broad `any`/CommonJS warnings across services, route modules, lib helpers, and tests. Prioritize production server modules before test mocks.
- **Exports/imports:** Add browser E2E coverage for authenticated report exports, Settings data exports, Settings Excel export, CSV import, and archive flows.
- **Audit accuracy:** Reconcile older audit docs when the current code has already fixed a listed gap.
- **Backend structure:** Keep public route entry points thin and continue moving non-trivial business logic into focused services/lib modules.
- **Security/data integrity:** Keep checking household scoping, role checks, soft-delete behavior, secret redaction, SSRF protections, and encrypted credential storage during every related change.
- **Security/auth roadmap:** Email verification, generalized MFA, email OTP MFA, admin MFA reset hardening, and the field-level encryption foundation are implemented. Remaining E2EE roadmap items: recovery-key setup/download/confirmation UX, household key unlock flow, migration UI for legacy plaintext account labels, encrypted transaction notes/content, and explicit AI opt-in before sending decrypted E2EE fields.
- **Dependency security:** `npm install` currently reports 5 npm audit findings, 4 moderate and 1 high. Triage separately from the email verification slice.

## Verification Gaps

- Settings Data export/archive actions need E2E coverage.
- Report PDF/CSV/Excel authenticated downloads need E2E coverage.
- Large frontend pages still need smoke or workflow coverage when they are split.
- Add E2E smoke coverage for email OTP MFA login and encryption status/settings display.

## Latest Verification

- 2026-05-21: Implemented Phase 1 email verification foundation: `User.emailVerifiedAt`, hashed `SecurityToken` storage for email verification/password reset, verification/resend auth endpoints, unverified-login block, invite signup pending-verification behavior, and client verification flow. Verification run: `npx prisma format --schema server/prisma/schema.prisma`, `npm run db:generate --workspace=server`, `npm run test --workspace=server -- tests/lib/securityTokens.test.ts tests/routes/authEmailVerification.test.ts tests/routes/authResetToken.test.ts tests/routes/auth2fa.test.ts`, `npm run build`, `npm run test`. Note: `rtk` was unavailable in this shell, so the underlying commands were run directly.
- 2026-05-21: Completed pending security foundation work from `docs/superpowers/specs/2026-05-21-security-foundation-e2ee-design.md`: generalized MFA responses, email OTP challenge/verify/enable/disable, MFA settings UI, owner member-MFA reset hardening with session invalidation and audit logging, household encryption metadata/API, WebCrypto helpers, encrypted account label storage/display fallback, and encryption settings status. Verification run: `npm run test --workspace=server -- tests/lib/securityTokens.test.ts tests/routes/authEmailVerification.test.ts tests/routes/authResetToken.test.ts tests/routes/auth2fa.test.ts tests/routes/authMfaEmail.test.ts tests/routes/settings.test.ts tests/lib/encryptedField.test.ts tests/routes/securityEncryption.test.ts tests/routes/accounts.test.ts`, `npm run test --workspace=client -- tests/pages/loginMfa.test.tsx tests/lib/security/webCrypto.test.ts tests/pages/accounts/accountEncryption.test.ts`, `npm run build`, and `npx gitnexus analyze`.
- 2026-05-21: Production backend helpers `transactionJournalService.ts`, `journalReportingCore.ts`, `priceCache.ts`, `reporting/rollups.ts`, `reporting/snapshots.ts`, `pdfParser.ts`, `ai/index.ts`, `softDeleteWhere.ts`, `audit.ts`, `default-categories.ts`, `webhookFire.ts`, `routes/audit.ts`, and `routes/logos.ts` are lint-clean. `rtk npm run build`, `rtk npm run test`, and `rtk npm run lint` pass; root lint still reports 438 server warnings.
- 2026-05-21: Security foundation and field-level E2EE design documented. No runtime tests run because this slice only added planning documentation.

## Quality Categories To Track

- Security and auth/access control
- Household scoping and data integrity
- Soft delete and retention behavior
- Exports, imports, and reports
- Modularity and oversized files
- Type safety and API contracts
- Tests, E2E, smoke checks, and coverage gaps
- Accessibility and UX reliability
- Performance and bundle size
- Deployment and documentation
