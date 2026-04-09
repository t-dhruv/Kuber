# Kuber Sprint Backlog
> Gap audit → sprint tasks | Release target: 2026-04-20 | Generated: 2026-04-07
>
> Source: `AUDIT-GAP-REPORT.md` | Spec: `.omc/specs/deep-interview-kuber-gap-audit.md`

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P1** | Release-blocking — must fix before 2026-04-20 open source release |
| **P2** | Release-enhancing — improves quality; ship if time allows |
| **P3** | Post-release — good-to-have, Phase 2, or infra-dependent |

---

## P1 — Release-Blocking (Fix Before 2026-04-20)

These are code correctness issues, convention violations, and UX gaps that would embarrass the project on open-source release day.

---

### P1-1: Fix API Response Wrapper Violation in users.ts

**Category:** Code inconsistency
**File:** `server/src/routes/users.ts:55`
**Issue:** Returns `{ data: { user: ... } }` — violates CLAUDE.md "no wrapper" convention. Client axios intercepts `.data` automatically, so this causes double-wrapping.

**Fix:**
```typescript
// Before (line 55)
return res.json({ data: { user: toUserDto(updated, req.householdId!) } });

// After
return res.json(toUserDto(updated, req.householdId!));
```

**Acceptance criteria:**
- [ ] `PUT /api/v1/users/me` returns `UserDto` directly, no wrapper
- [ ] Client profile update still works after the change
- [ ] Check if any other route in `users.ts` has the same pattern

---

### P1-2: Add Zod Validation to budgets.ts

**Category:** Missing input validation
**File:** `server/src/routes/budgets.ts`
**Routes:** `POST /` and `PUT /:id`

**Acceptance criteria:**
- [ ] `POST /api/v1/budgets` validates: `categoryId` (string, required), `amount` (positive number, required), `period` (enum: monthly/quarterly/annual), `rollover` (boolean, optional)
- [ ] `PUT /api/v1/budgets/:id` validates same fields as optional
- [ ] Invalid input returns `400 { error: "..." }` with the Zod message
- [ ] Valid input still creates/updates budget correctly

---

### P1-3: Add Zod Validation to goals.ts

**Category:** Missing input validation
**File:** `server/src/routes/goals.ts`
**Routes:** `POST /`, `PUT /:id`, `POST /:id/contribute`

**Acceptance criteria:**
- [ ] `POST /api/v1/goals` validates: `name` (string), `type` (enum: save_up/pay_down), `targetAmount` (positive), `targetDate` (date string, optional), `monthlyContribution` (positive, optional)
- [ ] `PUT /api/v1/goals/:id` validates same fields as optional
- [ ] `POST /api/v1/goals/:id/contribute` validates: `amount` (positive number, required)
- [ ] Invalid input returns `400 { error: "..." }`

---

### P1-4: Add Zod Validation to recurring.ts

**Category:** Missing input validation
**File:** `server/src/routes/recurring.ts`
**Routes:** `POST /`, `PUT /:id`

**Acceptance criteria:**
- [ ] `POST /api/v1/recurring` validates: `name` (string), `amount` (number), `frequency` (enum), `nextDate` (date), `categoryId` (string, optional), `accountId` (string, optional), `isAutopay` (boolean, optional)
- [ ] `PUT /api/v1/recurring/:id` validates same fields as optional
- [ ] Invalid input returns `400 { error: "..." }`

---

### P1-5: Add try/catch to apiTokens.ts POST Route

**Category:** Missing error handling
**File:** `server/src/routes/apiTokens.ts` lines 15–31

**Issue:** `crypto.randomBytes` and `prisma.apiToken.create` run without try/catch. A Prisma constraint violation (e.g., name collision) returns an unhandled 500 with no `{ error: ... }` body.

**Acceptance criteria:**
- [ ] POST handler wrapped in try/catch
- [ ] Unique constraint violation returns `409 { error: "An API token with this name already exists" }`
- [ ] Other errors return `500 { error: "Failed to create API token" }`

---

### P1-6: Add Zod Validation to categories.ts

**Category:** Missing input validation
**File:** `server/src/routes/categories.ts`
**Route:** `POST /`

**Acceptance criteria:**
- [ ] `POST /api/v1/settings/categories` validates: `name` (string, min 1), `type` (enum: income/expense), `emoji` (string, optional), `groupId` (string, optional)
- [ ] Invalid input returns `400 { error: "..." }`

---

### P1-7: Tag Untyped `any` Casts with TODO Comments

**Category:** Code convention
**Files:**
- `server/src/routes/recurring.ts` ~line 31: `where: where as any`
- `server/src/routes/receipts.ts` ~line 63: `as unknown as string`

**Per CLAUDE.md:** `any` without a `// TODO:` comment is not allowed.

**Acceptance criteria:**
- [ ] Each cast has `// TODO: replace with proper type` or a descriptive comment explaining why
- [ ] OR the cast is replaced with a proper type

---

### P1-8: Update Shared Types for ManualLiability Region Field

**Category:** Type consistency
**Context:** Migration `20260408011932_add_region_to_manual_liabilities` added a `region` field to `ManualLiability` in Prisma, but `shared/src/index.ts` has no corresponding DTO update.

**Acceptance criteria:**
- [ ] If a `ManualLiabilityDto` or similar type exists in `shared/src/index.ts`, add `region?: string` field
- [ ] If no DTO exists, check that `server/src/routes/liabilities.ts` responses include `region` in the returned object
- [ ] Client-side `liabilities` page correctly uses/displays the region where applicable

---

### P1-9: Add Self-Service Account Deletion

**Category:** UX gap / open-source trust
**File:** `client/src/pages/settings/` + new API route needed
**Why P1:** Open-source users expect the ability to delete their own account and data (GDPR expectation, also just basic trust for a self-hosted app).

**Acceptance criteria:**
- [ ] Settings page has "Delete Account" section (destructive, under a confirmation dialog)
- [ ] `DELETE /api/v1/settings/account` endpoint: deletes all user data, household (if owner + sole member), invalidates all tokens
- [ ] If user is household owner with other members, returns `400 { error: "Transfer ownership or remove members first" }`
- [ ] After deletion, session is invalidated and user is redirected to `/login`
- [ ] Zod validation on request body: `{ confirmPassword: string }`

---

### P1-10: Add Full Data Export (ZIP)

**Category:** UX gap / open-source trust / data portability
**File:** `client/src/pages/settings/` + new API route
**Why P1:** Self-hosted app users need confidence they can get their data out. Individual CSV exports exist but no single "export everything" option.

**Acceptance criteria:**
- [ ] `GET /api/v1/settings/export` streams a ZIP containing:
  - `accounts.csv`
  - `transactions.csv`
  - `budgets.csv`
  - `goals.csv`
  - `recurring.csv`
  - `investments.csv`
  - `assets.csv`
  - `liabilities.csv`
- [ ] Settings page has "Export all data" button that triggers the download
- [ ] Export is scoped to the authenticated household

---

## P2 — Release-Enhancing (Ship If Time Allows)

These improve the quality bar and user experience without being release-blockers.

---

### P2-1: Add Zod Validation to Remaining Routes

**Files:** `advice.ts`, `checkpoints.ts`, `networth.ts`, `notifications.ts`
**Routes:** PUT /topics/:topicId/tasks/:taskId, POST /:id/rollback, POST /snapshot, PUT /:id/read, PUT /read-all, DELETE /clear, POST /run-checks

**Note:** Most of these routes have no request body (just params/IDs), so validation is minimal — primarily confirming no unexpected body fields are processed.

---

### P2-2: Improve Onboarding Flow

**File:** `client/src/pages/` — new `OnboardingPage.tsx` or modal flow
**Context:** New users land on an empty dashboard. Monarch guides users through: add first account → set up categories → create first budget → set a goal.

**Scope for P2:**
- [ ] After first login, show a dismissible "Getting Started" checklist card on the dashboard
- [ ] Checklist items: Add an account, Import transactions, Create a budget, Set a goal
- [ ] Each item links to the relevant page
- [ ] Checklist disappears once all 4 are completed or dismissed

---

### P2-3: Financial Health Score Widget

**File:** `client/src/pages/dashboard/` + `server/src/routes/dashboard.ts`
**Context:** Kuber has all the data to compute a health score (savings rate, budget adherence, goal progress, debt-to-income). Monarch calls theirs "Monarch Score".

**Scope for P2:**
- [ ] `GET /api/v1/dashboard/health-score` computes a 0–100 score from: savings rate (30%), budget adherence (25%), goal progress (25%), emergency fund coverage (20%)
- [ ] Dashboard widget shows the score with a color indicator (red/yellow/green) and a one-line summary
- [ ] Score is cached; recalculated daily

---

### P2-4: Subscription Auto-Detection

**File:** `server/src/routes/recurring.ts` + new background job
**Context:** Monarch detects subscriptions from recurring transaction patterns. Kuber has transaction rules and recurring items but no detection logic.

**Scope for P2:**
- [ ] `POST /api/v1/recurring/detect` analyzes last 90 days of transactions for repeating merchant+amount patterns
- [ ] Returns suggested recurring items not already tracked
- [ ] Frontend shows "Detected subscriptions" banner with "Add to recurring" quick-action
- [ ] Uses same Zod validation as existing recurring create endpoint

---

### P2-5: Remove Unused `ApiResponse<T>` Type or Document It

**File:** `shared/src/index.ts`
**Context:** `ApiResponse<T>` is defined but unused in server routes (correctly, per convention). It's confusing for contributors.

- [ ] Either remove `ApiResponse<T>` from shared types, OR
- [ ] Add a JSDoc comment: `/** Client-side only — server returns data directly, no wrapper */`

---

### P2-6: Financial Calendar View for Recurring Items

**File:** `client/src/pages/recurring/` — add calendar tab
**Context:** Monarch shows a monthly calendar with bills/subscriptions by due date. Kuber shows a list.

- [ ] Add a "Calendar" tab to the Recurring page alongside the existing list view
- [ ] Month grid shows recurring items on their next due date
- [ ] Color-coded: paid (green), upcoming (blue), overdue (red)
- [ ] Uses existing `GET /api/v1/recurring` data — no new API needed

---

### P2-7: Empty State Improvements

**Files:** `client/src/pages/` — multiple pages
**Context:** Empty lists (no accounts, no transactions, no goals) show blank space with no calls-to-action.

- [ ] Each major page (accounts, transactions, budgets, goals, investments, recurring) has an empty state with:
  - A short descriptive message
  - A primary CTA button (e.g., "Add your first account")
- [ ] Dashboard empty state shows the Getting Started checklist (P2-2)

---

### P2-8: Low Balance Alert Configuration

**File:** `server/src/routes/notifications.ts` + `client/src/pages/settings/`
**Context:** Notification preferences exist but low-balance thresholds are not configurable.

- [ ] Add `lowBalanceThreshold` field to notification preferences (nullable number)
- [ ] Proactive check job compares account balance against threshold and fires notification
- [ ] Settings UI shows "Low balance alert" toggle with threshold input

---

## P3 — Post-Release (Phase 2 / Infra-Dependent)

These are good-to-have features, competitive opportunities, or features requiring external infrastructure. Schedule after 2026-04-20.

---

### P3-1: Live Bank Sync (Plaid / MX)
**Effort:** High | **Dependency:** Plaid or MX API key, webhook infrastructure
- Add `POST /api/v1/integrations/plaid/link` flow
- Store encrypted Plaid access tokens per account
- Webhook handler for real-time transaction updates
- UI for connecting and disconnecting bank accounts

### P3-2: Native Mobile App (iOS / Android)
**Effort:** Very High | **Dependency:** App store accounts, React Native or Flutter
- Current PWA is the baseline; native app is Phase 2
- Consider Capacitor wrapping the existing React app as a fast path

### P3-3: Web Push Notifications
**Effort:** Medium | **Dependency:** Service worker, VAPID keys
- `vite-plugin-pwa` is already installed
- Wire Web Push API to existing notification system
- Add push subscription management to settings
- Push on: budget exceeded, bill due, anomaly detected

### P3-4: Real-Time Household Sync
**Effort:** High | **Dependency:** WebSocket server or SSE infrastructure
- Add Socket.io or SSE endpoint for live data sync across household members
- Invalidate React Query cache on remote updates

### P3-5: Spending Benchmarks
**Effort:** Medium | **Dependency:** Anonymized aggregate data or public dataset
- Compare user spending by category vs. national averages
- Could use publicly available BLS Consumer Expenditure Survey data (no external API needed)

### P3-6: Import from Monarch / YNAB / Mint
**Effort:** Medium | **Dependency:** None (file-based)
- Parse Monarch CSV export format
- Parse YNAB4 and nYNAB export formats
- Parse Mint transaction export
- Map to Kuber categories on import

### P3-7: Webhook Outbound API
**Effort:** Medium
- Allow users to configure outbound webhook URLs
- Fire on: new transaction, budget exceeded, goal completed, net worth milestone
- Enables integration with Zapier, n8n, Home Assistant

### P3-8: Credit Score Integration
**Effort:** Medium | **Dependency:** Credit bureau API (Experian, Equifax, TransUnion)
- US users: integrate with a free credit score API
- Canadian users: Borrowell or Credit Karma API

### P3-9: Debt Payoff Recommendation Engine
**Effort:** Medium
- Extend amortization calculator
- Compare avalanche vs. snowball strategies
- Show total interest saved per strategy
- AI-powered personalized recommendation using existing advisor

### P3-10: Custom SQL Report Builder
**Effort:** High
- Power-user feature: write SQL against your own Postgres
- Sandboxed read-only queries on household-scoped views
- This is impossible for SaaS — a genuine self-hosting moat

### P3-11: Brokerage Sync
**Effort:** High | **Dependency:** Plaid Investments, Alpaca, or CSV import from Fidelity/Vanguard
- Auto-import holdings and transaction history from brokerages

---

## Sprint Plan (2 Weeks to 2026-04-20)

| Week | Focus | Tasks |
|------|-------|-------|
| **Week 1 (Apr 7–13)** | Code correctness | P1-1 through P1-8 (all code fixes, type gaps) |
| **Week 2 (Apr 14–20)** | UX trust + polish | P1-9, P1-10, P2-1, P2-5, P2-7 (account deletion, data export, empty states) |
| **Post-release** | Features | P2-2 through P2-8, then P3 items by priority |

---

## Task Count Summary

| Priority | Count | Estimated Effort |
|----------|-------|-----------------|
| P1 | 10 | ~5–7 days |
| P2 | 8 | ~5–7 days |
| P3 | 11 | Post-release |
| **Total** | **29** | |

---

*Generated by Kuber Gap Audit — 2026-04-07*
*Source: `AUDIT-GAP-REPORT.md` | Spec: `.omc/specs/deep-interview-kuber-gap-audit.md`*
