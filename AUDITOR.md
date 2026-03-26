# Kuber — Auditor Log

> Living document. Updated after every sprint. Tracks progress, tech debt, and open issues.
> Last updated: 2026-03-26 (6 new gaps logged; roadmap updated Sprints 14.1–18)

---

## Project Status

| Area | Status | Notes |
|------|--------|-------|
| Core auth | 🟢 Working | JWT + refresh token family tracking + TOTP 2FA + account lockout |
| Dashboard | 🟢 Working | API shape fixed |
| Accounts | 🟢 Enhanced | Net Worth chart (1M/3M/6M/1Y/ALL), assets/liabilities panel |
| Net Worth History | 🟢 Done | Daily snapshots, history API, performance chart in AccountsPage |
| Transactions | 🟢 Working | API shape fixed, bulk actions fixed, PATCH→PUT |
| Budget | 🟢 Enhanced | v2: Fixed/Flexible/Non-Monthly sections, unbudgeted alert, budgetType selector, Left-to-Budget banner |
| Cash Flow | 🟢 Working | NaN crash fixed, income/expenses as objects; Sankey chart implemented |
| Reports | 🟢 Enhanced | Reports v2: Filters panel (categories/accounts/tags/amount), Totals/Change toggle with period comparison, Monthly/Quarterly grouping, Cash Flow grouped bar+line chart, polished transaction rows + full summary sidebar |
| Recurring | 🟢 Working | Runtime crash fixed, MonthlySummary corrected |
| Goals | 🟢 Working | currentAmount/targetAmount fixed in display + forms |
| Investments | 🟢 Enhanced | Live benchmarks via Yahoo Finance (SPY/BND/VTI) with 15-min cache + fallback |
| Settings | 🟢 Working | Notifications fixed; 2FA setup/disable UI; SMTP test; Integrations section |
| Notifications | 🟢 Working | Read/write envelope corrected |
| AI Advisor | 🟢 Done | Real multi-provider (Claude/OpenAI/Gemini/OpenRouter); conversation persistence |
| Advice Library | 🟢 Done | 6 topics × 6 tasks, task checklist UI, per-household completion tracking |
| Tags Management | 🟢 Done | Settings > Tags CRUD with color swatches and transaction counts |
| Transaction Stats | 🟢 Done | Summary panel: count, spending, largest, average, date range |
| Data Downloads | 🟢 Done | Transactions + account balances CSV wired to real endpoints |
| Debt Goals | 🟢 Done | Pay Down tab: debt cards, live balance, payoff summary, Add modal |
| Cash Flow Merchants | 🟢 Done | Merchant breakdown tab with ranked list + percentage bars |
| Recurring Calendar | 🟢 Done | Calendar view toggle: monthly grid with color-coded bill chips |
| Weekly Recap | 🟢 Done | Dashboard widget: spending Δ, net worth Δ, top category, upcoming bills |
| Saved Report Views | 🟢 Done | Save/load/delete named filter combos in Reports page |
| Delete Transactions | 🟢 Done | Settings > Data Management: delete before date (soft-delete, wired) |
| Dashboard Customization | 🟢 Done | Widget reorder/hide with HTML5 drag-and-drop + persisted layout |
| Spending Cumulative Chart | 🟢 Done | Dashboard SpendingWidget: this month vs last month day-by-day |
| Wealth Strategy | 🟢 Done | 50/30/20 dashboard: salary input, bucket cards, alerts, Where to Cut, Investment Ladder, AI coach |
| Merchants Settings | 🟢 Done | Settings > Merchants: search, sort, inline edit, delete |
| E2E Tests | 🟢 Done | Playwright setup + smoke tests (10) + auth tests; `npm run test:e2e` — 10/10 green |
| 3-Tier Sankey | 🟢 Done | Income sources → Needs/Wants/Savings buckets → categories; pure SVG, hover tooltips |
| Transaction Overhaul | 🟢 Done | Date range filter, type pills (Income/Expense), pending badge/toggle, split UI + backend |
| PDF/Excel Export | 🟢 Done | Reports export via pdfkit + exceljs; spending/cashflow/tax report types |
| Tax Categories | 🟢 Done | isTaxDeductible flag on categories, tax summary tab in Reports, Settings toggle |
| Cash Flow Forecast | 🟢 Done | 30/60/90-day projection from recurring + historical; Recharts chart in Reports |
| Duplicate Detection | 🟢 Done | Self-join query, high/medium confidence, DuplicateReviewModal, merge/dismiss |
| Budget Variance | 🟢 Done | Actual vs budget bar chart per category, variance % table in Reports |
| Digest Email | 🟢 Done | Weekly/monthly HTML digest; net worth, top spend, budget status, upcoming bills |
| Report Scheduling | 🟢 Done | ReportSchedule model, Settings UI, hourly scheduler job |
| AI SSE Streaming | 🟢 Done | POST /advisor/chat/stream SSE endpoint; AdvicePage streams tokens with blinking cursor |
| Per-Account History | 🟢 Done | AccountBalanceSnapshot model + daily job + GET /accounts/:id/history + chart |
| Resend Email | 🟢 Done | Resend SDK support in email.ts; takes priority over SMTP if RESEND_API_KEY set |
| Unit Tests | 🟢 Done | 69 tests: csvExport (100%), netWorthJob (100%), priceCache (97%), wealthAnalysis (100%) |
| CSV Import | 🟢 Done | 3-step modal: upload → column mapping → preview & import; server parses CSV, auto-matches categories/merchants |
| Mobile Responsive | 🟢 Done | Sidebar drawer, Dashboard stacking, Transactions column hiding, Budget grid, Wealth overflow fixes |
| Docker prod | 🟢 Done | Multi-stage Dockerfiles, docker-compose.prod.yml, nginx/prod.conf |
| GitHub Actions CI | 🟢 Done | .github/workflows/ci.yml — lint + build on push/PR |
| CSV Export | 🟢 Done | Transactions, Accounts, Reports — GET /export/csv endpoints |
| 2FA | 🟢 Done | TOTP setup/enable/disable, QR code, backup codes, 2-step login |
| SMTP Email | 🟢 Done | Nodemailer transport, password reset sends, test-email endpoint |
| Audit Log | 🟢 Done | AuditLog table, fire-and-forget logAudit() on all mutations |
| Rules Engine | 🟢 Done | Full CRUD UI + rule builder + apply/apply-all endpoints |
| Cursor Pagination | 🟢 Done | Transactions: base64url cursor, stable sort, backwards compat |
| CSP Headers | 🟢 Done | Helmet CSP with self + unsafe-inline for Tailwind |
| Account Lockout | 🟢 Done | 5/8/10 attempts → 15m/1h/24h, unlock via email |
| Open Source docs | 🟢 Done | LICENSE (MIT), CONTRIBUTING.md, README.md (full rewrite) |
| CHANGELOG | 🟢 Done | Keep a Changelog format, full v1.0.0-beta entry |
| Container Registry | 🟢 Done | .github/workflows/release.yml — GHCR publish on v* tag, auto GitHub Release |
| Self-Hosting Guide | 🟢 Done | docs/SELF_HOSTING.md — full ops guide: quickstart, env vars, HTTPS, backup, troubleshooting |
| v1.0.0-beta | 🟢 Tagged | All packages at 1.0.0-beta |

| Drop Zone Import | 🟢 Done | /import page — drag-drop CSV/PDF, bank auto-detect, dedup, preview, confirm |
| AI Ingest Pipeline | 🟢 Done | bankFormats (10 banks), pdfParser, importDedup SHA256, ImportHistory model |
| AI Streaming Fix | 🟢 Done | Sprint 14.1 — nginx SSE block, useAiStream hook, Budget Coach, X-Accel-Buffering |
| Investment Import | 🟢 Done | Sprint 14.1 — Questrade/Wealthsimple/IBKR/TD Direct formats, HoldingLot upsert, BUY/SELL badges |
| n8n Automation Flows | 🟢 Done | Sprint 15 — Docker service (automation profile), 3 workflow templates, README setup guide |
| Bulk Operation Checkpoints | 🟢 Done | Sprint 15 — OperationCheckpoint model, checkpoint.ts lib, rollback API, Settings UI |
| PDF Statement Parser | ⚠️ Partial | Sprint 15 — pdf-parse + AI extraction done; tesseract fallback deferred |
| Email/IMAP Watcher | 🔴 Planned | Sprint 15 — optional email connector, Amazon/PayPal parsers |
| Asset & Debt Tracker | 🟢 Done | Sprint 15.1 — ManualAsset/Liability/Snapshot models, CRUD API, net-worth-breakdown endpoint |
| TFSA / RRSP Tracker | 🟢 Done | Sprint 15.1 — TaxAccount model, CRA rules engine, /tax-accounts API, Settings UI tab |
| Proactive AI Engine | 🟢 Done | Sprint 16 — anomaly detection, subscription auto-detect, missed payments, daily scheduler |
| Notification Center | 🟢 Done | Sprint 16 — household-scoped model, /notifications API, bell+drawer UI with severity badges |
| Auto-Categorization | 🟢 Done | Sprint 16.1 — AI batch categorizer, /auto-categorize API, notConfigured nudge, toolbar button |
| Receipt OCR | 🟢 Done | Sprint 16.1 — /receipts/ocr vision endpoint, ReceiptOcrModal, tesseract PDF fallback |
| Investment Intelligence | 🟢 Done | Sprint 17 — Yahoo Finance RSS per holding, Monte Carlo P10/P50/P90 projections table |
| Multi-Currency | 🟢 Done | Sprint 17 — Transaction.currency field, fxRates.ts, /fx API, live rates widget in Settings |
| PWA / Mobile | 🟢 Done | Sprint 18 — manifest, service worker, install prompt, onboarding wizard (4-step) |

**Legend:** 🟢 Done | ⚠️ Partial / Needs work | 🔴 Not done / Broken

---

## AI-First Roadmap (Sprints 14–18)

> Kuber is evolving from a manual finance tracker into an AI-first financial co-pilot.
> The user manages bank imports themselves (no Plaid, no credential sharing) via a Drop Zone UI.
> AI runs locally (ultra-lightweight models) or via the user's configured cloud provider.

### Architecture Principles
- **No Plaid, no bank credentials** — user downloads CSV/PDF from their bank and drops it into Kuber
- **AI-optional** — every AI feature gracefully degrades if no provider configured
- **Local-first AI** — ultra-lightweight Ollama models run on the user's machine (qwen2.5:0.5b 400MB, phi3.5-mini 2.2GB, moondream2 1.8GB, all-minilm 45MB)
- **Privacy by default** — no transaction data leaves the user's infrastructure unless they choose a cloud AI provider
- **n8n-optional** — advanced automation via n8n Docker service (not required for core features)

---

### Sprint 14.1 — Bug Fixes + Investment Import ✅ COMPLETE
**Goal:** Fix AI streaming on Budget/Advice pages (and audit full app), add investment account support to Drop Zone import.

#### Bug: AI Streaming broken on Budget and Advice pages
**Symptom:** After adding a valid API key and verifying the connection in Settings, SSE streaming does not render on the Budget page or Advice page. Connection test succeeds but no tokens appear.

**Investigation checklist:**
- [ ] Check which pages call SSE endpoints — `POST /api/v1/advisor/chat/stream` is the known endpoint
- [ ] Audit all pages that render AI responses: Budget, Advice, Wealth, Dashboard
- [ ] Check if streaming works in the AI Advisor chat (AdvicePage) vs page-embedded AI panels
- [ ] Verify EventSource / fetch-SSE plumbing: does the client read `data:` chunks correctly?
- [ ] Check for buffering/gzip middleware stripping chunked transfer encoding on Nginx
- [ ] Check if the issue is provider-specific (Claude vs OpenAI vs Gemini)

**Likely root causes:**
1. Missing `Content-Type: text/event-stream` + `Cache-Control: no-cache` headers on some AI routes
2. Nginx proxy buffering (`proxy_buffering off` required for SSE)
3. Client reading `res.body` as a stream but missing `getReader()` loop for non-Advisor pages
4. AI panel components using `useMutation` (fires once) instead of streaming reader pattern

**Fix plan:**
- [ ] Audit all `fetch` / `api.post` calls that expect streaming — convert to proper SSE reader
- [ ] Create shared `useAiStream(endpoint, payload)` hook to standardize all streaming UI
- [ ] Add `proxy_buffering off` + `X-Accel-Buffering: no` to nginx config for `/api/v1/*/stream` routes
- [ ] Test all AI-rendered panels after fix: Budget coach, Advice topics, Wealth analysis, Dashboard insight

#### Feature: Investment Account Import
**Goal:** Allow Drop Zone to import transaction CSV/PDF into investment accounts, mapping buy/sell/dividend entries to `InvestmentHolding` and `HoldingLot` models.

**New work:**
- [ ] Extend `POST /api/v1/import/parse` — if target account type is `investment`, parse as investment format
- [ ] New bank formats: Questrade, Wealthsimple, IBKR, TD Direct Investing CSV formats
- [ ] Investment row types: `buy`, `sell`, `dividend`, `transfer`, `fee` — auto-detected from description
- [ ] On `/confirm`: investment rows create/update `InvestmentHolding` + append `HoldingLot` entries
- [ ] ImportPreview: investment-mode column showing Type badge (BUY/SELL/DIV)
- [ ] E2E test: upload Questrade-format CSV → verify holdings updated

#### Planned deliverables
- [ ] `useAiStream.ts` shared hook
- [ ] All AI panel components migrated to shared hook
- [ ] Nginx SSE config fix
- [ ] Investment bank formats (Questrade, Wealthsimple, IBKR, TD Direct)
- [ ] Investment import parsing logic in `/import/confirm`
- [ ] ImportPreview investment mode

---

### Sprint 14 — Drop Zone + AI Ingest Pipeline (NEXT UP)
**Goal:** Let users drop CSV or PDF bank statements into Kuber. Auto-detect bank format, parse, dedup, preview, and confirm import. No manual column mapping for known banks.

#### New Components
| File | Purpose |
|------|---------|
| `client/src/pages/import/ImportPage.tsx` | New `/import` route — DropZone, ImportPreview, ImportHistory |
| `client/src/pages/import/components/DropZone.tsx` | Drag-drop or click-to-upload for CSV/PDF |
| `client/src/pages/import/components/ImportPreview.tsx` | Table showing new/duplicate/flagged rows with color coding |
| `client/src/pages/import/components/ImportHistory.tsx` | Log of past imports (file name, date, row count, status) |
| `server/src/lib/bankFormats.ts` | Bank format registry — column mappings per bank, auto-detected from CSV headers |
| `server/src/lib/pdfParser.ts` | pdf-parse primary + AI extraction + tesseract.js fallback for scanned PDFs |
| `server/src/lib/importDedup.ts` | SHA256 dedup hash: `date + normalizedDescription + amount` |
| `server/src/routes/import.ts` | New route file — parse, confirm, history, webhook endpoints |

#### API Routes
```
POST /api/v1/import/parse      — upload file, returns detected bank + parsed rows + dedup flags
POST /api/v1/import/confirm    — bulk-create accepted rows, returns created count
GET  /api/v1/import/history    — paginated log of past imports for household
POST /api/v1/import/webhook    — n8n webhook receiver (same contract as /parse)
```

#### Standard Ingest Schema (internal)
```json
{
  "source": "td-canada",
  "account": "TD Chequing ••4821",
  "transactions": [
    { "date": "2026-03-25", "description": "TIM HORTONS", "amount": -4.75, "type": "debit", "reference": "sha256hash" }
  ]
}
```

#### Bank Format Registry (planned)
| Bank | Country | Format |
|------|---------|--------|
| TD Canada Trust | CA | CSV: Date, Description, Debit, Credit, Balance |
| RBC Royal Bank | CA | CSV: Account Type, Account Number, Transaction Date, Cheque Number, Description 1, Description 2, CAD$, USD$ |
| CIBC | CA | CSV: Date, Description, Debit, Credit |
| BMO | CA | CSV: Date, Description, Withdrawals, Deposits, Balance |
| Scotiabank | CA | CSV: Date, Description, Amount |
| Chase | US | CSV: Transaction Date, Post Date, Description, Category, Type, Amount, Memo |
| Bank of America | US | CSV: Posted Date, Reference Number, Payee, Address, Amount |
| Wells Fargo | US | CSV: Date, Amount, *, *, Description |
| Capital One | US | CSV: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit |
| American Express | US | CSV: Date, Description, Amount |

#### Dedup Logic
```
hash = SHA256(date + normalizeDescription(description) + Math.abs(amount).toFixed(2))
```
- `normalizeDescription`: lowercase, remove extra whitespace, strip trailing reference codes
- Import preview shows each row as: `NEW` (green) | `DUPLICATE` (gray, hidden by default) | `REVIEW` (yellow, amount/date mismatch)

#### Prisma Schema Addition
```prisma
model ImportHistory {
  id            String   @id @default(cuid())
  householdId   String
  filename      String
  bankSource    String?
  rowsTotal     Int
  rowsImported  Int
  rowsDuplicate Int
  rowsSkipped   Int
  status        String   // completed | partial | failed
  createdAt     DateTime @default(now())

  household     Household @relation(fields: [householdId], references: [id])
  @@map("import_history")
}
```

#### Sidebar Addition
- Add "Import" nav item (Upload icon) between Transactions and Reports

#### Dependencies to add
```
server: pdf-parse, @types/pdf-parse, tesseract.js (optional, lazy-loaded)
```

---

### Sprint 15 — Bank Templates + n8n Flows + Bulk Checkpoints + Email Connector ✅ COMPLETE
**Goal:** Harden the import pipeline with rollback safety, ship n8n automation templates, complete bank templates, and add email connector for Amazon/PayPal.

#### n8n Automation Flows
n8n runs as an optional Docker service (`docker-compose --profile automation up`). Workflow templates ship in `n8n-workflows/` and can be imported via the n8n UI.

**Planned workflows:**
| Workflow | Trigger | Action |
|---------|---------|--------|
| `bank-email-to-kuber.json` | IMAP: new email from bank address | Parse attachment → POST `/api/v1/import/webhook` |
| `amazon-receipts.json` | IMAP: email from amazon.com | Parse order total/items → POST `/api/v1/import/webhook` |
| `paypal-receipts.json` | IMAP: email from paypal.com | Parse payment amount → POST `/api/v1/import/webhook` |
| `folder-watch-csv.json` | File system watch on `/bank-drop/` | Read new CSV → POST `/api/v1/import/webhook` |
| `weekly-import-reminder.json` | Cron: Monday 8am | Send email/push reminding user to export bank CSV |

**New files:**
- [ ] `n8n-workflows/bank-email-to-kuber.json`
- [ ] `n8n-workflows/amazon-receipts.json`
- [ ] `n8n-workflows/paypal-receipts.json`
- [ ] `n8n-workflows/folder-watch-csv.json`
- [ ] `n8n-workflows/README.md` — setup guide
- [ ] `docker-compose.yml` — add `n8n` service under `automation` profile

#### Bulk Operation Checkpoints + Rollback
**Problem:** If a bulk import or rule-run introduces wrong data (wrong category, duplicate, or misparse), there is currently no way to undo it without deleting records individually.

**Design:**
- `OperationCheckpoint` Prisma model: captures a snapshot of affected transaction IDs + their previous state as JSON before any bulk operation
- Checkpoint types: `bulk-import`, `rule-apply-all`, `bulk-categorize`, `bulk-delete`
- Retention: checkpoints auto-expire after 7 days
- UI: Settings > Data Management > "Recent Operations" list with "Rollback" button per entry
- Rollback: restores previous field values (category, amount, description, isHidden) from JSON snapshot

**New files:**
- [ ] `server/prisma/schema.prisma` — `OperationCheckpoint` model
- [ ] `server/src/lib/checkpoint.ts` — `createCheckpoint(type, txnIds)` + `rollbackCheckpoint(id)`
- [ ] Updated `POST /api/v1/import/confirm` — call `createCheckpoint('bulk-import', createdIds)` after insert
- [ ] Updated `POST /api/v1/rules/:id/apply-all` — call `createCheckpoint('rule-apply-all', affectedIds)`
- [ ] `GET /api/v1/checkpoints` — list recent checkpoints
- [ ] `POST /api/v1/checkpoints/:id/rollback` — restore snapshot
- [ ] `client/src/pages/settings/components/DataManagementSection.tsx` — "Recent Operations" UI

#### Bank Template Expansion + Email Connector
- [ ] Complete all 10 bank CSV templates with integration tests using real sample files
- [ ] PDF parser: table extraction for TD/RBC/CIBC/Chase PDF statements
- [ ] `server/src/lib/emailConnector.ts` — optional IMAP connection (user credentials stored encrypted)
- [ ] Amazon order parser: extract items, amounts, dates from order confirmation emails
- [ ] PayPal parser: parse PayPal receipt emails into transactions
- [ ] Import page: email connector setup UI in Settings > Integrations

---

### Sprint 15.1 — Asset & Debt Tracker + TFSA/RRSP Tracker (PLANNED)
**Goal:** Track all assets (home, car, crypto, collectibles) and liabilities beyond bank accounts. Track TFSA and RRSP contribution room per household member in real-time from transaction data.

#### Asset & Debt Tracker
**Problem:** Kuber tracks bank/investment accounts but has no way to record illiquid assets (home equity, car value, jewelry, crypto wallets) or liabilities (mortgage principal, car loan, student debt) that don't have bank feeds.

**Design:**
- `ManualAsset` model: name, type (real_estate | vehicle | crypto | other), currentValue, purchaseValue, purchaseDate, notes, householdId
- `ManualLiability` model: name, type (mortgage | auto_loan | student_loan | other), originalAmount, currentBalance, interestRate, monthlyPayment, maturityDate, householdId
- Manual assets/liabilities included in Net Worth calculation alongside bank accounts
- Value history: `ManualAssetSnapshot` model (daily/on-edit) for net worth chart accuracy
- UI: new tab in Accounts page — "Assets & Liabilities" alongside existing account list
- CRUD: add/edit/delete modals, quick-value-update inline

**New files:**
- [ ] Prisma: `ManualAsset`, `ManualLiability`, `ManualAssetSnapshot` models + migration
- [ ] `GET/POST/PUT/DELETE /api/v1/assets` — manual asset CRUD
- [ ] `GET/POST/PUT/DELETE /api/v1/liabilities` — manual liability CRUD
- [ ] `GET /api/v1/assets/net-worth-breakdown` — breakdown: bank accounts + investments + manual assets - bank liabilities - manual liabilities
- [ ] `client/src/pages/accounts/components/AssetsLiabilitiesTab.tsx`
- [ ] Net worth calculation updated to include manual assets/liabilities
- [ ] Net worth chart updated (already includes snapshots — extend to include ManualAssetSnapshot)

#### TFSA & RRSP Tracker
**Problem:** Users in Canada need to track TFSA and RRSP contribution room for themselves and household members. This room changes with each contribution (transaction) and is reset annually by CRA rules.

**Design:**
- `TaxAccount` model: userId, householdMemberId, type (TFSA | RRSP | FHSA | RESP), linkedAccountId (FK to Account), annualRoomCad, cumulativeRoomUsed, birthYear
- TFSA room: cumulative from 2009 (age 18+), $6,500/yr (2023), $7,000/yr (2024+), minus contributions, plus withdrawals (restored next Jan 1)
- RRSP room: 18% of prior year earned income, max $31,560 (2024), minus contributions
- Real-time balance: when a transaction posts to the linked account with type `contribution` or `withdrawal`, room is updated automatically via trigger or background check
- Transaction tagging: transactions into TFSA/RRSP accounts are auto-tagged `rrsp-contribution` / `tfsa-contribution` if amount > 0
- `GET /api/v1/tax-accounts` — list all TFSA/RRSP/FHSA accounts for household
- `POST /api/v1/tax-accounts` — add tax account for a member
- `GET /api/v1/tax-accounts/:id/room` — current room, used, remaining, projected year-end
- UI: Settings > Tax Accounts — per-member cards showing TFSA room remaining (green/yellow/red), RRSP room, over-contribution alert

**Household member support:**
- Each `HouseholdMember` can have multiple `TaxAccount` entries
- Dashboard widget: household TFSA/RRSP summary (total room available across all members)
- Alert if any member is within 10% of contribution limit

**New files:**
- [ ] Prisma: `TaxAccount` model + migration
- [ ] `server/src/lib/taxRoomCalculator.ts` — TFSA/RRSP room rules engine (CRA annual limits, age-gating, withdrawal recovery)
- [ ] `GET/POST/PUT/DELETE /api/v1/tax-accounts`
- [ ] `GET /api/v1/tax-accounts/household-summary`
- [ ] Background job: on each new transaction to a linked tax account, recalculate room
- [ ] `client/src/pages/settings/components/TaxAccountsSection.tsx`
- [ ] Dashboard widget: `TaxRoomWidget` — compact card per member

---

### Sprint 16 — Proactive AI Engine (PLANNED)
**Goal:** Kuber proactively surfaces insights, catches anomalies, auto-categorizes, and detects suspicious activity — without the user asking.

#### AI Features
| Feature | Model | Trigger |
|---------|-------|---------|
| Auto-categorization | qwen2.5:0.5b (local) or cloud provider | On import + uncategorized txns |
| Anomaly detection | phi3.5-mini (local) or cloud | Daily background job |
| Fraud / unusual spending alert | phi3.5-mini (local) or cloud | On each import |
| Subscription auto-detection | Rule engine + AI validation | Weekly scan |
| Missed payment warning | Recurring + Accounts query | Daily job |
| Receipt OCR | moondream2 (local vision model) | On photo upload |
| AI confidence scoring | Embedding similarity (all-minilm) | During categorization |

#### Notification Center
- New `Notification` model: type, title, body, severity (info/warning/alert), read, linkedEntityId
- Bell icon in Header with unread badge
- Notification drawer with filter by type
- `GET /api/v1/notifications` + `PUT /api/v1/notifications/:id/read` + `DELETE /api/v1/notifications/clear`

#### Local AI Model Setup (Ollama)
```yaml
# docker-compose.yml addition (optional service)
ollama:
  image: ollama/ollama
  ports: ["11434:11434"]
  volumes: ["ollama_data:/root/.ollama"]
  profiles: ["ai"]  # opt-in: docker-compose --profile ai up
```
User pulls models: `ollama pull qwen2.5:0.5b && ollama pull moondream`

---

### Sprint 17 — Investment Intelligence + Multi-Currency (PLANNED)
**Goal:** Kuber becomes a wealth co-pilot — tracks investments with AI-powered context, handles CAD/USD seamlessly.

#### Investment Intelligence
- YouTube transcript pipeline (via n8n): subscribe to channels (e.g. Ben Felix, Rational Reminder), pull transcripts weekly, extract ticker mentions + sentiment
- Google News feed per holding: `GET /api/v1/investments/news?ticker=AAPL`
- Wealth trajectory projections: Monte Carlo simulation on current portfolio + savings rate
- RRSP / TFSA / 401k / IRA optimization hints based on income bracket + current contributions
- Tax-loss harvesting alerts (CA + US rules)

#### Multi-Currency
- `Transaction.currency` field (default: household base currency)
- `UserPreference.baseCurrency` (CAD or USD)
- Live FX rates via Open Exchange Rates (free tier) or ECB feed
- Currency toggle in Accounts and Reports
- Historical FX for accurate net worth charting

---

### Sprint 18 — PWA + Mobile UX + Onboarding (PLANNED)
**Goal:** Kuber works as a first-class mobile app (PWA), with a smooth onboarding flow for new users.

#### PWA
- `vite-plugin-pwa` — manifest, service worker, offline shell
- Push notifications via Web Push API (notify on anomaly/alert even when tab closed)
- Camera receipt capture — tap to photograph, moondream2 extracts merchant + amount + date
- Voice input — Web Speech API → transcript → AI parse to transaction

#### Onboarding Wizard
- First-login flow: set base currency → add accounts → set income → configure AI provider → import first statement
- Progress indicator, skip-able steps, re-accessible from Settings > Get Started

---

## Sprint Log

### Sprint 14 — Drop Zone + AI Ingest Pipeline (2026-03-26)
**Goal:** Replace manual CSV column mapping with a smart Drop Zone that auto-detects bank format, deduplicates, and previews before import. Foundation for all AI ingestion features.

**Completed:**
- [x] `client/src/pages/import/ImportPage.tsx` — `/import` route, upload/history tab toggle
- [x] `client/src/pages/import/components/DropZone.tsx` — drag-drop + click upload, account selector, parse CTA
- [x] `client/src/pages/import/components/ImportPreview.tsx` — NEW/DUPLICATE/INVALID row table, per-row checkboxes, confirm mutation, bank detection summary bar
- [x] `client/src/pages/import/components/ImportHistory.tsx` — paginated import log with status icons
- [x] `server/src/lib/bankFormats.ts` — format registry for 10 banks (TD, RBC, CIBC, BMO, Scotiabank, Chase, BofA, Wells Fargo, Capital One, Amex) with scoring auto-detection
- [x] `server/src/lib/pdfParser.ts` — pdf-parse primary + regex line extraction + AI prompt builder fallback
- [x] `server/src/lib/importDedup.ts` — SHA256 dedup (date + normalizedDescription + amount), batch comparison
- [x] `server/src/lib/dateUtils.ts` — shared parser for 7 bank date formats
- [x] `server/src/routes/import.ts` — parse / confirm / history / webhook endpoints
- [x] `ImportHistory` Prisma model + migration `20260326163823_add_import_history`
- [x] Sidebar nav: Import item (Upload icon) between Transactions and Cash Flow
- [x] TypeScript: zero errors client + server

---

### Sprint 13 — Release Prep: CHANGELOG, Container Registry, Self-Hosting Guide (2026-03-24)
**Goal:** Ship v1.0.0-beta as a polished open source release.

**Completed:**
- [x] `CHANGELOG.md` — Keep a Changelog format; full v1.0.0-beta entry covering all 18+ feature areas
- [x] `.github/workflows/release.yml` — on `v*.*.*` tag: builds + pushes server + client Docker images to GHCR; creates GitHub Release with changelog extract; prerelease flag auto-set for `-beta`/`-alpha`/`-rc`
- [x] `docs/SELF_HOSTING.md` — comprehensive ops guide: 5-step quickstart, env vars reference table, update workflow, pre-built image snippet, AI Advisor setup, HTTPS/Let's Encrypt, reverse proxy, DB backup/restore, troubleshooting table, security checklist
- [x] `README.md` — Self-Hosting section updated to link to full guide
- [x] `package.json` (root + server + client) — version bumped to `1.0.0-beta`
- [x] Git tag `v1.0.0-beta` created

---

### Sprint 12 — CSV Import, Mobile Polish, Unit Tests (2026-03-24)
**Goal:** Pre-release quality — transaction import, mobile responsiveness, test coverage.

**Completed:**
- [x] `POST /api/v1/transactions/import/preview` — parses first 5 rows, returns headers + preview + errors
- [x] `POST /api/v1/transactions/import` — full import with Prisma transaction, >10% error rate → 422 rollback, finds/creates merchants, case-insensitive category matching, marks imported txns `needsReview: true`
- [x] `client/src/pages/transactions/components/ImportModal.tsx` — 3-step modal: Upload (drag-drop + account + date format) → Map Columns (auto-heuristic mapping + 3-row preview) → Preview & Import (10-row table + import mutation)
- [x] "Import CSV" button added to TransactionsPage toolbar
- [x] Mobile sidebar drawer: hamburger toggle, overlay backdrop, slide-in animation, close on nav click
- [x] Dashboard: single-column stacking on mobile, WeeklyRecap horizontal scroll
- [x] Transactions: collapsible filters, column hiding (Category hidden on xs, Account hidden on sm), bulk action wrapping
- [x] Budget: responsive grid (stacks on mobile), Actual/Remaining columns hidden on xs
- [x] Wealth: WhereToCut overflow-x-auto, header stacking
- [x] `server/vitest.config.ts` + test scripts in package.json
- [x] `server/src/lib/csvExport.test.ts` — 16 tests, 100% coverage
- [x] `server/src/lib/netWorthJob.test.ts` — 7 tests, 100% coverage
- [x] `server/src/lib/priceCache.test.ts` — 20 tests, 97% coverage
- [x] `server/src/lib/wealthAnalysis.ts` — extracted pure helpers from wealth route
- [x] `server/src/routes/wealth.test.ts` — 29 tests, 100% coverage
- [x] 69/69 tests pass, ~450ms

---

### Sprint 11 — Wealth Strategy: 50/30/20 Dashboard + AI Coach (2026-03-24)
**Goal:** Smart wealth-building feature: 50/30/20 rule analysis, personalized insights, investment ladder, AI coaching.

**Completed:**
- [x] `Category.bucketType` field added (needs | wants | savings | uncategorized), default 'uncategorized'
- [x] `WealthAiCache` model — per-household 24h AI analysis cache
- [x] Migration `20260324100000_add_wealth_strategy` — ALTER categories + CREATE wealth_ai_cache
- [x] `seedCategoryBuckets()` — keyword-matched defaults seeded for all existing categories
- [x] `GET/PUT /api/v1/wealth/income` — read/write monthly net take-home income (via UserPreference)
- [x] `GET /api/v1/wealth/analysis?month=YYYY-MM` — full 50/30/20 analysis: targets, actuals, per-bucket category breakdown, delta, alerts, savingsCapacity, investmentLadder (5 steps, status from Goals)
- [x] `GET/PUT /api/v1/wealth/category-buckets` — read/override per-category bucket assignment
- [x] `POST /api/v1/wealth/category-buckets/reset` — reset to keyword defaults
- [x] `POST /api/v1/wealth/ai-analysis` — 24h cached AI wealth coaching: prompt with income + bucket data, calls configured provider, returns analysis text
- [x] `client/src/pages/wealth/WealthPage.tsx` — new page at `/wealth`:
  - Income setup card (inline input if not set, edit row if set)
  - 3 bucket cards (Needs/Wants/Savings) with color-coded progress bars, category breakdowns, delta lines
  - Alerts section (danger/warning per bucket)
  - "Where to Cut" — top 5 over-budget categories ranked by overage
  - Investment Ladder — 5 steps with status icons + months-to-fund projection
  - AI Analysis Panel — auto-fetches, 24h cache, refresh button, not-configured fallback
- [x] Sidebar: "Wealth" nav item (Layers icon) between Reports and Budget
- [x] `App.tsx` — lazy route `/wealth` added
- [x] `SettingsPage.tsx` — Categories section: bucket badge + inline dropdown per category, Reset defaults button
- [x] TypeScript: zero errors client + server

---

### Sprint 10 — Reports v2: Filters, Change View, Monthly Grouping, Cash Flow Bar Chart (2026-03-24)
**Goal:** Close the Monarch reports gap — filters panel, period comparison, monthly/quarterly grouping, polished transaction list.

**Completed:**
- [x] `server/src/routes/reports.ts` — filter params (`categoryIds`, `accountIds`, `tagIds`, `minAmount`, `maxAmount`) wired into `/spending`, `/income`, `/cashflow` queries
- [x] `GET /reports/spending/compare` + `GET /reports/income/compare` — prior period computed, returns `{items[{current,prior,delta,deltaPercent}], currentTotal, priorTotal, totalDelta}`
- [x] `GET /reports/spending/monthly` + `GET /reports/income/monthly` — category × month matrix, returns `{months[], series[{id,name,icon,data[]}]}`
- [x] `ReportsPage.tsx` — `FiltersPanel` dropdown: Categories/Accounts/Tags/Amount tabs, active badge, clear all, click-outside close
- [x] `extraParams` wired through `CashFlowTab` and `CategoryTab` so filters apply to all fetches
- [x] Totals/Change toggle in Spending/Income tabs; Change view = grouped bar (current=blue, prior=gray) with delta tooltip
- [x] Monthly/Quarterly grouping dropdown (quarterly computed client-side by summing 3 months)
- [x] Cash Flow tab: default view changed to grouped bar (Income green + Expenses red + Net dashed line); Sankey toggle preserved
- [x] Transaction rows: merchant avatar circle, category emoji+name subtitle, account pill chip, amount+date stacked column
- [x] Summary sidebar: Total spending/income, Largest transaction, Average, First/Last transaction dates — all fields complete
- [x] TypeScript: zero errors client + server

---

### Sprint 9 — Live Investment Benchmarks, Saved Reports, Dashboard Customization (2026-03-24)
**Goal:** Polish and close remaining Monarch feature gaps — live market data, saved views, customizable dashboard.

**Completed:**
- [x] `getLiveBenchmarks()` in `priceCache.ts` — fetches SPY/BND/VTI historical data via Yahoo Finance, computes period returns (1M/3M/6M/1Y/ALL/YTD), 15-min cache, falls back to hardcoded values on error
- [x] `investments.ts` — replaced hardcoded benchmark object with `await getLiveBenchmarks()`
- [x] `SavedReport` model + migration `20260323210000_add_saved_reports` — already existed from prior work
- [x] `GET/POST/DELETE /api/v1/reports/saved` — already existed; `SavedViewsDropdown` + `SaveViewModal` in ReportsPage already built
- [x] `DELETE /api/v1/transactions/before?date=` — already existed (soft-delete, returns count)
- [x] `SettingsPage.tsx` DataSection — wired `handleDeleteHistory` to real mutation (was stub); shows count in success toast
- [x] `DashboardPage.tsx` — connected existing `CustomizeModal` + `WIDGET_META` skeleton to page render; layout fetched from `GET /api/v1/settings/dashboard-layout`, saved via `PUT`; ordered/filtered columns applied
- [x] `SpendingWidget` cumulative chart — already fully wired (this month vs last month lines)
- [x] TypeScript: zero errors client + server

---

### Sprint 8 — Debt Goals, Merchant Breakdown, Calendar, Weekly Recap, Merchants UI (2026-03-23)
**Goal:** Post-release backlog — fill remaining Monarch feature gaps.

**Completed:**
- [x] `GET /goals/accounts-for-debt` — CREDIT_CARD/LOAN accounts for goal linking
- [x] Debt goals: live `currentAmount` from linked account balance, `linkedAccount` in response
- [x] `DebtGoalCard`: paid off / remaining / progress bar / account chip
- [x] `AddDebtGoalModal`: name, total debt, monthly payment, account dropdown, payoff date
- [x] `PayDownSummary`: total debt remaining / total monthly / estimated debt-free date
- [x] `ContributeModal` updated to be debt-aware
- [x] Cash Flow `/month`: `byMerchant` on income + expenses (displayName fallback chain)
- [x] `CashFlowPage`: Merchants tab with ranked list, percentage bars, tx count, Show more
- [x] `RecurringPage`: Calendar view — monthly grid, color chips (green/red/blue), legend
- [x] `GET /dashboard/weekly-recap`: spending Δ, net worth Δ, top category, upcoming bills
- [x] `WeeklyRecapWidget`: 3 stat tiles + upcoming bills strip + empty state
- [x] `GET/PUT/DELETE /settings/merchants` with tx counts + null-safe delete
- [x] `MerchantsSection`: search, sort toggle, inline edit, show more, delete confirm
- [x] TypeScript: zero errors client + server

---

### Sprint 7 — Structured Advice Library + Tags + Transaction Stats (2026-03-23)
**Goal:** Release polish — structured advice, tags management, transaction stats, wired data downloads.

**Completed:**
- [x] `AdviceTopic` / `AdviceTask` / `UserAdviceProgress` schema models + migration `20260323200000`
- [x] Seeded 6 advice topics × 6 tasks each: Emergency Fund, Budget, Pay Off Debt, Start Investing, Buy a Home, Protect Yourself
- [x] `GET /api/v1/advice/topics` — returns topics + tasks + per-household completion state
- [x] `PUT /api/v1/advice/topics/:topicId/tasks/:taskId` — toggle task completion
- [x] `AdvicePage` restructured: AI Chat tab (preserved) + Advice Library tab (category pills, topic cards, progress bars, slide-in checklist panel with optimistic toggles)
- [x] `GET/POST/PUT/DELETE /api/v1/settings/tags` with transaction counts
- [x] Settings > Tags section: color swatch picker, CRUD modals, delete confirmation
- [x] Transaction summary stats panel (count, total spending, largest, average, date range) — computed client-side
- [x] Data section downloads wired: transactions CSV + account balances CSV via authenticated blob download
- [x] TypeScript: zero errors client + server

**Already done (discovered during gap analysis, not new work):**
- Categories management UI — was already fully implemented in SettingsPage
- Dark mode (Light/Dark/System) — already in DisplaySection
- Savings Rate in Reports — already computed
- Dashboard spending chart (this month vs last) — SpendingWidget already existed
- Dashboard onboarding checklist — GettingStartedChecklist already existed

---

### Sprint 6 — Net Worth History + Real AI Advisor (2026-03-23)
**Goal:** Net worth as a first-class feature + real multi-provider AI advisor replacing mock.

**Completed (net worth):**
- [x] `NetWorthSnapshot` model + migration `20260323100000_add_net_worth_snapshots`
- [x] `server/src/lib/netWorthJob.ts` — `takeNetWorthSnapshot()` upserts daily assets/liabilities/netWorth per household
- [x] Fire-and-forget startup snapshot in `index.ts`
- [x] `GET /api/v1/networth/history?range=1M|3M|6M|1Y|ALL` — returns current + history + change since oldest snapshot
- [x] `POST /api/v1/networth/snapshot` — manual trigger endpoint
- [x] `AccountsPage`: `NetWorthChart` component (Recharts LineChart, range tabs), assets/liabilities breakdown panel, `monthChange` prop on `AccountRow`

**Completed (AI advisor):**
- [x] `advisor.ts` rewritten — real AI via `getAiClientForHousehold` + `getChatContext` + `chatSystemPrompt`
- [x] Conversation persistence — saves user + assistant to `ConversationMessage` table
- [x] `GET /api/v1/advisor/conversations` — list with lastMessage preview
- [x] `GET /api/v1/advisor/conversations/:id/messages` — load history
- [x] `DELETE /api/v1/advisor/conversations/:id`
- [x] Graceful unconfigured-provider: returns friendly 200 with Settings CTA (not 500)
- [x] `AdvicePage`: conversation sidebar, load past conversations, delete, Settings deeplink button
- [x] TypeScript: zero errors on client and server

**Deferred:**
- Per-account 30-day balance delta (needs account balance history — future sprint)
- AI streaming responses (SSE) — future enhancement

---

### Sprint 5 — Budget v2 (2026-03-23)
**Goal:** Monarch-parity on budgeting — Fixed/Flexible/Non-Monthly split, income budgeting, unbudgeted detection.

**Completed (backend):**
- [x] Added `budgetType` field to `Budget` model (String, default `'FLEXIBLE'`, values: `FIXED | FLEXIBLE | NON_MONTHLY`)
- [x] Migration: `20260323000000_add_budget_type_to_budget` (run `make db-migrate` to apply)
- [x] `GET /api/v1/budgets` — new `expenses.byType.{fixed,flexible,nonMonthly}` breakdown; `unbudgeted[]` array; `budgetType` on every `CategoryRow`
- [x] `POST /api/v1/budgets` — accepts `budgetType` (validated, defaults to `FLEXIBLE`)
- [x] `PUT /api/v1/budgets/:id` — new endpoint for updating `budgetType` and/or `amount`

**Completed (frontend):**
- [x] `BudgetPage.tsx` rewritten — Fixed / Flexible / Non-Monthly collapsible sections with row counts and subtotals
- [x] "By Type | By Group" toggle — new type view + legacy group view both functional
- [x] Budget type selector on edit (badge when viewing, `<select>` when editing)
- [x] `UnbudgetedAlert` — dismissible banner listing categories with spend but no budget, each with "+ Add Budget" CTA
- [x] `LeftToBudgetBanner` — prominent income − expenses = leftToBudget with green/red coloring
- [x] Savings Rate badge with color thresholds (≥20% green, 10-19% yellow, <10% red)
- [x] TypeScript: zero errors on client and server

**Deferred:**
- Rollover budgets (carry unspent amounts to next month) — future sprint

---

### Sprint 4 — Foundation & Release Infrastructure (2026-03-23)
**Goal:** Production deployability, test coverage baseline, open source readiness, CSV export.

**Completed (infra):**
- [x] `server/Dockerfile` — multi-stage: builder (TS compile + Prisma generate) → runner (prod deps only); CMD runs `prisma migrate deploy` before start
- [x] `client/Dockerfile` — multi-stage: builder (Vite build) → nginx:alpine static server with SPA fallback
- [x] `docker-compose.prod.yml` — postgres (internal only) + server + client + nginx on `kuber_network`
- [x] `nginx/prod.conf` — reverse proxy: `/api/` → server:4000, `/` → client:80; gzip; security headers; 120s timeout for AI streaming
- [x] `.env.example` — full documentation of all env vars with generation instructions
- [x] `.github/workflows/ci.yml` — lint + build on every push/PR (E2E commented out pending DB service setup)

**Completed (testing):**
- [x] `@playwright/test` installed at root; `test:e2e` + `test:smoke` scripts added
- [x] `playwright.config.ts` — Chromium, sequential, baseURL localhost:3000
- [x] `tests/e2e/helpers/auth.ts` — reusable login helper; confirmed seed credentials: `demo@kuber.app` / `password123`
- [x] `tests/e2e/smoke.spec.ts` — 7 smoke tests: login/logout, dashboard, accounts, transactions, budget, goals, settings
- [x] `tests/e2e/auth.spec.ts` — 3 auth tests: unauthenticated redirect, invalid credentials error, valid login

**Completed (open source):**
- [x] `LICENSE` — MIT 2026, Kuber Contributors
- [x] `CONTRIBUTING.md` — setup guide, branch strategy, Conventional Commits, PR checklist, code conventions
- [x] `README.md` — full rewrite: badges, features, Docker quick-start, tech stack table, roadmap

**Completed (features):**
- [x] `server/src/lib/csvExport.ts` — `toCSV()` + `setCsvHeaders()` utility (RFC 4180 compliant)
- [x] `GET /api/v1/transactions/export/csv` — date/account filters, 10k row limit
- [x] `GET /api/v1/accounts/export/csv` — all accounts for household
- [x] `GET /api/v1/reports/export/csv` — type=spending|income|cashflow with date range

**Deferred:**
- Server lib unit tests (Vitest) — Sprint 5+
- E2E tests against real DB in CI (needs postgres service container) — post-release

---

### Sprint 3 — Security Hardening + Rules Engine + Cursor Pagination (2026-03-20)
**Goal:** TD-003/004/005/014/017/018 security hardening; TD-012 Rules UI; TD-015 cursor pagination.

**Completed (server):**
- [x] TD-003: Refresh token family tracking — `lib/token.ts`, token hashing (SHA-256), family invalidation on reuse
- [x] TD-004: TOTP 2FA — setup/enable/disable/validate/use-backup routes; QR code via `otplib` + `qrcode`; 8 bcrypt-hashed backup codes
- [x] TD-005: SMTP email — `lib/email.ts` with Nodemailer; `sendPasswordResetEmail`, `sendAccountLockoutEmail`, `sendTestEmail`
- [x] TD-014: Audit log — `AuditLog` Prisma model; `logAudit()` hooked into transactions, accounts, budgets, goals, rules
- [x] TD-017: CSP headers — Helmet ContentSecurityPolicy in `index.ts`
- [x] TD-018: Account lockout — 5/8/10+ failed attempts → 15m/1h/24h; lockout email sent
- [x] TD-012: Rules engine — `routes/rules.ts` with CRUD, `ruleMatches()`, `applyActionsToTransaction()`, apply/apply-all
- [x] TD-015: Cursor pagination on transactions — base64url `{ date, id }` cursor, composite WHERE, backwards compat offset mode
- [x] `GET /auth/2fa/status` endpoint; `POST /settings/email/test` endpoint

**Completed (client):**
- [x] `LoginPage.tsx` — 2-step login: PasswordStep → TotpStep (TOTP + backup code toggle)
- [x] `useAuth.ts` — added `useTotpStatus`, `useTotpSetup`, `useTotpEnable`, `useTotpDisable`, `useTotpValidate`, `useTotpBackup`
- [x] Settings → Security — `TwoFactorCard`: QR setup flow → confirm code → backup codes display; disable with password
- [x] Settings → Integrations — SMTP config display + "Send test email" button
- [x] `RulesPage.tsx` — rule list with reorder, rule builder modal (conditions + actions), apply/apply-all
- [x] App routing + sidebar: `/rules` route added, `Zap` icon in nav
- [x] TypeScript: zero errors on both client and server (post-sprint)

**Deferred:**
- E2E test infrastructure (Sprint 4)
- Open source docs: LICENSE, CONTRIBUTING (Sprint 4)
- Audit log viewer UI (future)

---

### Sprint 2 — UI Stability & Sankey Charts (2026-03-19)
**Goal:** Fix remaining UI bugs found during E2E: blank pages, broken filters, missing Sankey charts.

**Completed:**
- [x] Added `ErrorBoundary` to `App.tsx` — wraps all protected routes, prevents blank-page crashes
- [x] Fixed `TransactionsPage` filter categories — replaced hardcoded `DEFAULT_CATEGORIES` with real `/categories` API call
- [x] Updated `Category` interface to match server API shape (`emoji`, `groupName` instead of `icon`, `group`)
- [x] Implemented Sankey chart in `CashFlowPage` — income categories → Cash Flow node → expense groups + Savings
- [x] Implemented Sankey chart in `ReportsPage` — Income → top expense categories + Savings (Money Flow section)
- [x] TypeScript: zero errors on both client and server

**Deferred:**
- SMTP email, TOTP 2FA, refresh token families, account lockout (Sprint 3)
- E2E test infrastructure (Sprint 4)

---

### Sprint 1 — Full App Bug Fix (2026-03-19)
**Goal:** Fix all API shape mismatches that made the entire app broken after the server refactor.

**Completed:**
- [x] Full bug audit — identified 5 runtime crashes + 9 broken pages
- [x] Fixed all 10 pages (AccountsPage, TransactionsPage, BudgetPage, CashFlowPage, ReportsPage, RecurringPage, GoalsPage, InvestmentsPage, SettingsPage, DashboardPage)
- [x] Added `GET /api/v1/categories` server route (was missing, caused 404)
- [x] Added `DELETE /api/v1/settings/household/members/:id` server route (was missing)
- [x] Rewrote `POST /transactions/bulk` with action-based dispatch
- [x] TypeScript: zero errors on both client and server
- [x] Committed: `cf4cbbf`

**Deferred to Sprint 2:**
- ESLint strict config + Husky pre-commit
- GitHub Actions CI

---

### Sprint 0 — Foundation & Governance (2026-03-19)
**Goal:** Set up working standards, audit the codebase, establish agent workflow.

**Completed:**
- [x] Created `CLAUDE.md` with full working standards
- [x] Created `AUDITOR.md` (this file)
- [x] Full bug audit — API shape mismatch analysis across all 10 pages

---

## Tech Debt Register

| ID | Item | Priority | Sprint | Notes |
|----|------|----------|--------|-------|
| TD-001 | ~~API response shape mismatch — all pages broken~~ | ✅ Done | Sprint 1 | Fixed in commit cf4cbbf |
| TD-002 | ~~No tests at all (unit or E2E)~~ | ✅ Partial | Sprint 4 | E2E smoke + auth tests added; unit tests still missing |
| TD-003 | Refresh token family tracking not implemented | P1 | Sprint 2 | Security risk: stolen refresh tokens not detectable |
| TD-004 | 2FA (TOTP) not implemented | P1 | Sprint 2 | Planned feature |
| TD-005 | No SMTP email sender | P1 | Sprint 2 | Password reset emails don't actually send |
| TD-006 | AI Advisor is mock-only | P2 | Sprint 5 | Multi-provider (Claude/OpenAI/Gemini/Ollama/OpenRouter) needed |
| TD-007 | ~~No Nginx reverse proxy in Docker~~ | ✅ Done | Sprint 4 | nginx/prod.conf + docker-compose.prod.yml |
| TD-008 | ~~No production Docker Compose~~ | ✅ Done | Sprint 4 | docker-compose.prod.yml created |
| TD-009 | Seed data not realistic enough | P2 | Sprint 4 | Needs multi-year data, multiple personas |
| TD-010 | ~~No LICENSE file~~ | ✅ Done | Sprint 4 | MIT License added |
| TD-011 | ~~No CONTRIBUTING.md~~ | ✅ Done | Sprint 4 | CONTRIBUTING.md added |
| TD-012 | Rules engine has no UI | P3 | Sprint 7 | Backend exists, frontend missing |
| TD-013 | Plaid/MX bank sync not built | P3 | Sprint 7+ | Manual entry only for now |
| TD-014 | No audit log table for financial changes | P1 | Sprint 2 | Security/compliance requirement |
| TD-015 | No cursor-based pagination on transactions | P2 | Sprint 5 | May load all records |
| TD-016 | TypeScript strict mode not enforced | P2 | Sprint 1 | `any` types exist |
| TD-017 | No CSP headers configured in Helmet | P1 | Sprint 2 | XSS mitigation |
| TD-018 | Account lockout after failed logins missing | P1 | Sprint 2 | Brute force protection |
| TD-019 | OpenAPI/Swagger docs missing | P3 | Sprint 6 | Developer experience |
| TD-020 | ~~No multi-stage Docker builds~~ | ✅ Done | Sprint 4 | server/Dockerfile + client/Dockerfile both multi-stage |

---

## Open Issues

| ID | Issue | Status | Sprint |
|----|-------|--------|--------|
| BUG-001 | ~~DashboardPage API shape mismatch~~ | ✅ Fixed | cf4cbbf |
| BUG-002 | ~~All pages had API shape mismatches~~ | ✅ Fixed | cf4cbbf |
| BUG-003 | Email password reset sends nothing | 🔴 Open | Sprint 3 |
| BUG-004 | ~~Pages go blank on crash — no error boundary~~ | ✅ Fixed | Sprint 2 |
| BUG-005 | ~~Transaction filter uses hardcoded category IDs~~ | ✅ Fixed | Sprint 2 |
| BUG-006 | ~~Sankey chart placeholders in CashFlow + Reports~~ | ✅ Fixed | Sprint 2 |

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
