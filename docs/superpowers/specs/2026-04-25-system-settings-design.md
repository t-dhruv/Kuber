# System Settings Page — Design Spec

**Date:** 2026-04-25  
**Status:** Approved

---

## Overview

Add a `/settings/system/*` route group that surfaces all background jobs, automation features, integrations, and AI features currently hidden from the UI. Each sub-route provides full control: view status, configure settings, and trigger actions manually.

---

## Routes

```
/settings/system                → redirect → /settings/system/jobs
/settings/system/jobs           → Cron Jobs
/settings/system/automation     → Rule Engine, Bill Matcher, Auto-Categorize
/settings/system/integrations   → IMAP Email Watcher, Digest Email, Webhooks
/settings/system/ai             → Proactive AI, Investment Intel, Wealth Analysis
```

Existing Settings page gains a "System" nav link pointing to `/settings/system`.

---

## Architecture

### Frontend

- **`SystemLayout`** — shared layout wrapping all sub-pages; sidebar nav with 4 links and active state indicator
- Each sub-route is a lazy-loaded page component under `client/src/pages/settings/system/`
- Shared components live in `client/src/pages/settings/system/components/`

**Shared components:**
| Component | Purpose |
|-----------|---------|
| `StatusBadge` | Pill: `ok \| error \| running \| disabled` |
| `SectionCard` | Card with title, description, status badge, action slot |
| `TriggerButton` | POST trigger, spinner during execution, toast on result |

### Backend

New route group `GET/PUT /api/v1/system/*` for config read/write. Manual trigger endpoints follow existing cron pattern (`POST .../trigger`).

Config persisted in existing `UserPreference` table (key-value store).

---

## Pages

### `/settings/system/jobs` — Cron Jobs

**Display:**
- Table: job name | last run timestamp | last result (`ok/error`) | last error message | manual trigger button
- Jobs are code-defined; no schedule config UI needed (schedules set in `index.ts`)

**Backend:** Uses existing `GET /api/v1/cron/jobs` and `POST /api/v1/cron/jobs/:name/trigger`

**Registered jobs:**
- `rule-execution`
- `auto-budget`
- `net-worth-snapshot`
- `account-balance-snapshot`
- `recurring-autocreate`

---

### `/settings/system/automation` — Automation

**Rule Engine:**
- Enable/disable toggle
- "Run Now" trigger button
- Last run status + error display

**Bill Matcher:**
- Enable/disable toggle
- Confidence threshold slider (0–100%)

**Auto-Categorize:**
- Enable/disable toggle
- "Run Now" trigger button

**Backend:** `GET/PUT /api/v1/system/automation`

---

### `/settings/system/integrations` — Integrations

**IMAP Email Watcher:**
- Fields: host, port, username, password (masked)
- Enable/disable toggle
- "Test Connection" button → inline success/fail feedback

**Digest Email:**
- Enable/disable toggle
- Schedule picker: Daily / Weekly
- "Send Now" trigger button

**Webhooks:**
- URL list (add/remove)
- Event type checkboxes
- "Test Fire" button per webhook

**Backend:** `GET/PUT /api/v1/system/integrations`

---

### `/settings/system/ai` — AI Features

**Proactive AI:**
- Enable/disable toggle
- Frequency config (daily / weekly / on login)

**Investment Intel:**
- Enable/disable toggle
- "Refresh Now" trigger button

**Wealth Analysis:**
- Enable/disable toggle
- "Recalculate" trigger button

**Backend:** `GET/PUT /api/v1/system/ai`

---

## Data Flow

1. Page mounts → React Query fetches config/status (30s cache)
2. User edits form → optimistic update → PUT to backend
3. Save failure → toast error, form resets to last saved state
4. Trigger button → POST to action endpoint → invalidate React Query cache
5. IMAP test → POST to test endpoint → inline result (not toast)

---

## Error Handling

| Scenario | Behavior |
|----------|---------|
| Config save failure | Toast error; form reverts to last saved values |
| Job trigger failure | Toast with `lastError` message from backend |
| IMAP connection test fail | Inline error message under fields |
| Unknown job name | Backend returns 404; toast "Job not found" |
| All forms | Zod validation on backend (existing pattern) |

---

## Testing

- Unit tests for all new backend route handlers (config GET/PUT, trigger endpoints)
- Existing `cronRegistry.test.ts` covers job registry — no changes needed
- Smoke test addition: `/settings/system/jobs` page loads without error

---

## Access Control

Any authenticated user can access all system pages (app is self-hosted, single-household — the logged-in user is always the owner). Standard `requireAuth` middleware applies; no additional role gate.

---

## Files to Create

**Frontend:**
```
client/src/pages/settings/system/
├── SystemSettingsLayout.tsx
├── components/
│   ├── StatusBadge.tsx
│   ├── SectionCard.tsx
│   └── TriggerButton.tsx
├── JobsPage.tsx
├── AutomationPage.tsx
├── IntegrationsPage.tsx
└── AiPage.tsx
```

**Backend:**
```
server/src/routes/system.ts          # New: automation + integrations + ai config routes
```

**Modified:**
```
client/src/App.tsx                   # Add /settings/system/* routes
client/src/pages/settings/          # Add "System" nav link
server/src/index.ts                  # Mount /api/v1/system router
```
