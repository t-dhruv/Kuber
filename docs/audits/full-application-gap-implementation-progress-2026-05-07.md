# Full Application Gap Implementation Progress - 2026-05-07

Source audit: [full-application-gap-audit-2026-05-07.md](./full-application-gap-audit-2026-05-07.md)

## Current Slice

Status: Requested U1-U6, C3, S2, and F1-F7 remediation slice complete

Focus: Accessibility and UI/UX remediation, custom outbound endpoint governance, retention-model alignment, audit-log visibility, feature/docs truth-in-advertising, and regression coverage for the completed audit gaps.

## Progress

- [x] S1/F1/P0: Add reusable owner/admin household authorization middleware.
- [x] S1/P0: Gate API token management.
- [x] S1/S2/P0: Gate webhook management and test delivery.
- [x] S1/P0: Gate household-wide AI, email, and system settings.
- [x] S1/P0: Add focused regression tests proving members cannot mutate household-wide controls.
- [x] S1/P0: Run targeted server tests and static checks.
- [x] S2/P1: Add safe outbound URL guard that rejects non-HTTP(S), embedded credentials, unresolvable hosts, and private/reserved IP targets.
- [x] S2/P1: Apply URL guard to webhook create/update/test delivery and background webhook firing.
- [x] S2/P1: Apply URL guard to custom/non-Ollama AI base URLs.
- [x] S2/P1: Add SSRF regression tests for direct metadata/loopback IPs and DNS names resolving to private addresses.
- [x] C1/P2: Add `PRIVACY.md` with data classes, integration processor table, retention caveat, and self-host operator responsibilities.
- [x] C2/P2: Add `SECURITY.md` with supported-version, private reporting, safe-harbor, and operator-responsibility guidance.
- [x] S3/P1: Stop persisting bearer access tokens in the Zustand `kuber-auth` localStorage record.
- [x] S3/P1: Drop legacy persisted access tokens during auth-store hydration.
- [x] S3/P1: Replace advice/budget SSE localStorage token reads with in-memory token lookup plus refresh-cookie access-token refresh.
- [x] S4/P1: Encrypt newly saved IMAP connector passwords at rest and decrypt for manual/scheduled sync.
- [x] S4/P1: Preserve compatibility with legacy plaintext IMAP connector records during sync.
- [x] S5/P1: Store password-reset preference keys using a SHA-256 hash of the raw emailed reset token.
- [x] S5/P1: Look up reset submissions by hashed reset-token key and delete the stored key on use/expiry as before.
- [x] S5/P1: Encrypt newly saved webhook signing secrets, mask them from webhook API responses, and decrypt them before signing test/background deliveries.
- [x] S5/P1: Update Settings webhook edit flow so blank secret on edit preserves the existing masked secret instead of resubmitting it.
- [x] S6/F4: Remove hardcoded production compose credential fallbacks for Postgres, Grafana, and n8n.
- [x] S6/F4: Correct production compose self-contained claim to document required mounted config directories.
- [x] S6/F4: Add missing self-hosting and development setup guides linked from README.
- [x] S6/F4: Require `AI_ENCRYPTION_KEY` at server startup so encrypted AI, IMAP, and webhook secrets do not fail later at runtime.
- [x] S6/F4: Update README, Makefile help, and `.env.example` to match actual ports and required production secrets.
- [x] S2/P1: Reject `localhost` and `*.localhost` custom/webhook outbound targets before DNS lookup.
- [x] S2/P1: Normalize bracketed IPv6 literals and reject loopback, IPv4-mapped loopback, ULA, and link-local IPv6 targets.
- [x] S2/P1: Add custom AI endpoint disclosure in Settings and AI advisor docs.
- [x] C3/P2: Resolve retention posture as hard-delete/data minimization for user-requested deletes, with explicit backup/log/audit caveats.
- [x] C3/P2: Align README, privacy policy, explanation docs, accounts docs, and transaction docs with the implemented retention model.
- [x] U1/P2: Add mobile drawer modal semantics, focus trap, Escape close, scroll lock, inert background, and focus restoration.
- [x] U2/P2: Add keyboard-operable import upload surface and explicit labels for import account and column-mapping selects.
- [x] U3/P2: Add accessible chat input/send labels and convert conversation rows to real selectable buttons with touch/focus-visible delete affordance.
- [x] U4/P2: Add keyboard semantics to segment controls, filter menus, and sortable data-table headers.
- [x] U5/P2: Add horizontal overflow handling for import preview tables on narrow screens.
- [x] U6/P2: Add browser color-scheme hints and remove the animated ellipsis from conversation loading copy.
- [x] F1/P2: Update household docs and roadmap so invite records are documented separately from future emailed invite redemption.
- [x] F2/P2: Add owner/admin Settings audit-log view backed by the existing audit endpoint.
- [x] F2/P2: Add audit route tests for household scoping, filter normalization, limit capping, and UI response mapping.
- [x] F3/P2: Align 2FA docs with current password-confirm disable flow and no-admin-recovery limitation.
- [x] F4/P2: Fix stale README contributor docs link and how-to index reference link.
- [x] F5/P2: Split README roadmap into shipped/partial and planned work.
- [x] F6/P2: Fix stale reference paths for Sidebar and global CSS.
- [x] F7/P2: Expand safe outbound URL tests and add audit-log route regression tests.
- [x] F1/P0 follow-up: Implement redeemable household invite links for new-user signup.
- [x] F1/P0 follow-up: Send invite email via configured mail provider and expose a copyable invite link to the inviter.
- [x] F3/P1 follow-up: Add owner-only 2FA reset for non-owner household members.
- [x] PWA follow-up: Route the offline page, add an offline status banner, and align offline copy with cached-read/no-write-queue behavior.

## Verification

- 2026-05-07: `npm --workspace server test -- auth.test.ts system.test.ts adminAuthorization.test.ts` passed, 3 files / 15 tests.
- 2026-05-07: `npm --workspace server run build` passed.
- 2026-05-07: `npm --workspace server run lint` passed with warnings only.
- 2026-05-07: `npm --workspace server test` passed, 38 files / 257 tests.
- 2026-05-07: `npm --workspace server test -- safeOutboundUrl.test.ts adminAuthorization.test.ts system.test.ts auth.test.ts` passed, 4 files / 20 tests.
- 2026-05-07: `npm --workspace server run build` passed after URL guard work.
- 2026-05-07: `npm --workspace server test` passed after URL guard work, 39 files / 262 tests.
- 2026-05-07: `npm --workspace server run lint` passed after URL guard work with warnings only.
- 2026-05-07: `git diff --check -- SECURITY.md PRIVACY.md docs/audits/full-application-gap-implementation-progress-2026-05-07.md` passed.
- 2026-05-07: S3 red test confirmed old behavior failed: `authStore.test.ts` wrote `accessToken` to persisted state and hydrated `old-token`.
- 2026-05-07: `npm --workspace server exec -- vitest run --config vitest.config.ts --dir ..\client ..\client\src\stores\authStore.test.ts` passed, 1 file / 2 tests.
- 2026-05-07: `npm --workspace client run build` passed.
- 2026-05-07: `npm --workspace client run lint` passed with warnings only.
- 2026-05-07: static search found no production `localStorage.getItem('kuber-auth')`, `localStorage.setItem('kuber-auth')`, or persisted `accessToken: s.accessToken` references.
- 2026-05-07: S4 red test confirmed IMAP connector save stored `mailbox-secret` in plaintext before fix.
- 2026-05-07: `npm --workspace server test -- emailConnector.test.ts` passed, 1 file / 1 test.
- 2026-05-07: S5 red tests confirmed reset-token preference keys used raw tokens before fix.
- 2026-05-07: `npm --workspace server test -- authResetToken.test.ts` passed, 1 file / 2 tests.
- 2026-05-07: `npm --workspace server run build` passed after IMAP/reset-token work.
- 2026-05-07: `npm --workspace server test` passed after IMAP/reset-token work, 41 files / 265 tests.
- 2026-05-07: `npm --workspace server run lint` passed after IMAP/reset-token work with warnings only.
- 2026-05-07: S5 red webhook tests confirmed plaintext webhook secret storage, raw secret responses, and signing with encrypted text before fix.
- 2026-05-07: `npm --workspace server test -- webhooks.test.ts` passed, 1 file / 3 tests.
- 2026-05-07: `npm --workspace server run build` passed after webhook secret work.
- 2026-05-07: `npm --workspace client run build` passed after webhook UI contract work.
- 2026-05-07: `npm --workspace server test` passed after webhook secret work, 42 files / 268 tests.
- 2026-05-07: `npm --workspace server run lint` passed after webhook secret work with warnings only.
- 2026-05-07: `npm --workspace client run lint` passed after webhook UI contract work with warnings only.
- 2026-05-07: GitNexus impact for `REQUIRED_ENV` in `server/src/index.ts` returned LOW risk, 0 direct callers/processes/modules.
- 2026-05-07: `npm --workspace server run build` passed after production env validation hardening.
- 2026-05-07: `docker compose -f docker-compose.prod.yml config` rendered successfully with explicit test values for required compose variables.
- 2026-05-07: `docker compose --env-file .env.example -f docker-compose.prod.yml --profile observability --profile automation config` rendered successfully with explicit test values for profile credentials.
- 2026-05-07: `npm --workspace server test` passed after production env validation hardening, 42 files / 268 tests.
- 2026-05-07: `git diff --check -- docker-compose.prod.yml .env.example server/src/index.ts Makefile README.md docs/SELF_HOSTING.md DEV.md docs/audits/full-application-gap-implementation-progress-2026-05-07.md` passed with line-ending warnings only.
- 2026-05-07: GitNexus impact checks before UI edits returned LOW risk for `AppShell`, `Sidebar`, `DropZone`, `MappingConfirmStep`, `ChatInput`, `ConversationSidebar`, `FilterBar`, `DataTable`, `CustomProvider`, `AiAdvisorCard`, `SettingsPage`, and `RowTable`.
- 2026-05-07: GitNexus impact for shared `SegmentControl` returned HIGH risk because it is reused across reports, settings, and rules; the edit was kept behavior-preserving and covered by client build/lint.
- 2026-05-07: S2 red test confirmed bracketed IPv6 loopback custom endpoints were not rejected before the IPv6 normalization fix.
- 2026-05-07: `npm --workspace server test -- safeOutboundUrl.test.ts` passed after IPv6/localhost hardening, 1 file / 6 tests.
- 2026-05-07: `npm --workspace server test -- safeOutboundUrl.test.ts audit.test.ts` passed, 2 files / 8 tests.
- 2026-05-07: `npm --workspace client run build` passed after U1-U6 and F2 UI work with Vite chunk-size warnings only.
- 2026-05-07: `npm --workspace client run lint` passed after U1-U6 and F2 UI work with warnings only.
- 2026-05-07: `npm --workspace server run lint` passed after S2/F7 work with warnings only.
- 2026-05-07: `npm --workspace server test` passed after S2/F7 work, 43 files / 272 tests.
- 2026-05-07: `npm --workspace server run build` passed after final progress/comment cleanup.
- 2026-05-07: `npm --workspace client run build` passed after final progress/comment cleanup with Vite chunk-size warnings only.
- 2026-05-07: `git diff --check` on the U1-U6, C3, S2, and F1-F7 touched files passed with line-ending warnings only.
- 2026-05-08: GitNexus impact for `settings.ts`, `email.ts`, `signAccessToken`, `useSignup`, and `SignupPage` returned LOW risk before invite/recovery edits.
- 2026-05-08: `npm --workspace server test -- householdInvites.test.ts` passed after household invite and owner-assisted 2FA recovery work, 1 file / 4 tests.
- 2026-05-08: `npm --workspace server run build` passed after household invite and owner-assisted 2FA recovery work.
- 2026-05-08: `npm --workspace client run build` passed after household invite and owner-assisted 2FA recovery work with Vite chunk-size warnings only.
- 2026-05-08: GitNexus impact for `App` and `vite.config.ts` returned LOW risk before PWA offline routing/status edits.
- 2026-05-08: `npm --workspace server test` passed after follow-up work, 45 files / 280 tests.
- 2026-05-08: `npm --workspace server run build` passed after follow-up work.
- 2026-05-08: `npm --workspace client run build` passed after follow-up work with Vite chunk-size warnings only.
- 2026-05-08: `npm --workspace client run lint` passed after follow-up work with warnings only.
- 2026-05-08: `npm --workspace server run lint` passed after follow-up work with warnings only.
- 2026-05-08: `git diff --check` on the follow-up touched files passed with line-ending warnings only.

## Backlog Status

- [x] S2: Finish custom AI governance docs/UX and direct outbound target hardening for localhost, DNS failures, and IPv6 private/reserved targets.
- [x] S3: Replace browser `localStorage` access-token persistence.
- [x] S4/S5: Encrypt IMAP credentials, encrypt/mask webhook secrets, and hash reset tokens.
- [x] C3: Resolve retention model and align implementation/docs.
- [x] S6/F4: Harden production compose and self-hosting docs.
- [x] C1/C2: Add privacy and security policies.
- [x] U1-U6: Accessibility and UI/UX remediation.
- [x] F1-F7: Feature/docs/test gaps beyond owner/admin enforcement.

## Notes

- Existing source modifications were present before this implementation pass. Keep edits scoped and do not revert unrelated work.
- `rg.exe` was unavailable in this environment during audit because Windows denied execution from the packaged app path; use PowerShell search or GitNexus if it remains unavailable.
- Bank sync and offline write queues remain planned/future work rather than shipped features; docs and roadmap state that explicitly.
