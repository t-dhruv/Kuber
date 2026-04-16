# Auto-Categorization Review Queue — Design Spec

**Date:** 2026-04-16  
**Status:** Approved

---

## Overview

Upgrade the AI auto-categorization system from silent background application to a user-confirmed review workflow. Users see all AI suggestions on a dedicated review screen, can approve/correct/skip each one, trigger new-category creation inline, and receive proactive rule suggestions when the AI detects repetitive patterns. Corrections are stored as learning examples that improve future AI suggestions.

---

## Goals

- Never silently apply an AI-suggested category — always require user confirmation
- Let users correct AI mistakes and optionally create rules from corrections
- AI learns from corrections via few-shot examples in the prompt
- If AI can't match an existing category, offer to create a new one inline
- Proactively suggest rules when 3+ transactions share a description pattern

---

## Data Model Changes

### Transaction model (two new fields)

```prisma
aiSuggestedCategoryId    String?   // category AI picked (null = no match found)
aiSuggestedCategoryName  String?   // raw name AI returned when no existing category matched
aiSuggestionConfidence   Float?    // 0.0–1.0
// needsReview already exists — batch now sets true instead of silently applying
```

### New model: CategoryLearningExample

```prisma
model CategoryLearningExample {
  id                String   @id @default(cuid())
  householdId       String
  descriptionPattern String  // the transaction description that was corrected
  correctCategoryId String
  createdAt         DateTime @default(now())

  @@index([householdId])
  @@map("category_learning_examples")
}
```

Stores user corrections. The last 50 records per household are injected into the AI prompt as few-shot examples.

---

## API Changes

### Modified: `POST /api/v1/auto-categorize/batch`

**Before:** silently applied suggestions with confidence ≥ 0.6.  
**After:**
- Fetches last 50 `CategoryLearningExample` records for the household and prepends them to the AI prompt as few-shot examples
- Sets `needsReview: true`, `aiSuggestedCategoryId`, `aiSuggestionConfidence` on each transaction
- If AI returns a category name that doesn't match any existing category: sets `aiSuggestedCategoryName` (non-null), `aiSuggestedCategoryId: null`
- Does NOT update `categoryId` — user confirmation is required

### New: `GET /api/v1/auto-categorize/review-queue`

Returns paginated review queue.

Response:
```json
{
  "transactions": [...],   // needsReview: true, with ai fields
  "total": 42,
  "ruleSuggestions": [
    {
      "pattern": "amazon*",
      "field": "description",
      "operator": "startsWith",
      "value": "amazon",
      "suggestedCategoryId": "...",
      "suggestedCategoryName": "Online Shopping",
      "matchCount": 5
    }
  ]
}
```

Rule suggestions are computed server-side by grouping `needsReview` transactions by description prefix (first word/token), returning groups of 3+.

### New: `POST /api/v1/auto-categorize/confirm`

Single-transaction confirmation.

```json
{
  "transactionId": "...",
  "action": "approve" | "reject",
  "categoryId": "...",          // required for approve; override for reject
  "createCategory": {            // optional: create new category then apply
    "name": "...",
    "type": "expense" | "income",
    "emoji": "..."
  }
}
```

Behavior:
- `approve`: sets `categoryId = aiSuggestedCategoryId`, clears `needsReview`, clears ai fields
- `reject` + `categoryId`: sets `categoryId` to user's choice, saves a `CategoryLearningExample`, clears `needsReview`
- `createCategory`: creates the category, then applies as above

### New: `POST /api/v1/auto-categorize/confirm-bulk`

Approves all AI suggestions in the queue at once (for users who trust the batch).

```json
{ "transactionIds": ["...", "..."] }  // optional; omit to approve all
```

---

## UI — Review Screen

**Route:** `/transactions/review`

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Review AI Suggestions        [42 remaining]   [Approve All] │
├─────────────────────────────────────────────────────────────┤
│  ⚡ Rule suggestion banner (dismissable)                      │
│  "5 transactions match 'amazon*' → Online Shopping           │
│   [Create Rule]  [Dismiss]"                                  │
├─────────────────────────────────────────────────────────────┤
│  SUGGESTED CATEGORIES                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Amazon* B79L617K2    -$34.99   Jan 5   [●●●●○ 82%]  │   │
│  │ Suggested: Online Shopping    [✓ Approve] [✗ Reject] │   │
│  │   └── (on reject) Pick category ▼  [Create rule?]   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  NO CATEGORY MATCH                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Spotify Premium      -$9.99    Jan 5                 │   │
│  │ AI suggested: "Subscriptions" (not in your list)     │   │
│  │ [+ Create "Subscriptions"]  [Pick existing ▼] [Skip] │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Interaction Details

- **Confidence pill:** green ≥ 80%, yellow 60–79%, grey < 60%
- **Approve:** applies suggestion immediately, row fades out
- **Reject:** opens inline category dropdown. After selection, shows subtle "Create a rule for this pattern?" prompt beneath the row
- **Create Rule (inline):** pre-fills rule form using the transaction's description pattern, opens rule creation modal
- **+ Create Category:** opens a compact inline form (name, type, emoji). On save, creates category and applies it to the transaction
- **Approve All:** confirms all transactions with `aiSuggestedCategoryId` set (excludes no-match transactions)
- **Rule suggestion banner:** one banner per detected pattern, shown at top of queue. Clicking "Create Rule" opens the existing rule creation modal pre-filled

### Navigation

- Sidebar nav "Transactions" shows badge: `N needs review` linking to `/transactions/review`
- Empty state: "All caught up ✓" with link back to Transactions

---

## AI Prompt Changes

### Few-shot learning injection

Before categorizing, fetch last 50 `CategoryLearningExample` records for the household and prepend:

```
Past corrections (learn from these):
- "amazon prime video" → Entertainment
- "wholefds mkt" → Groceries
- "lyft *ride" → Transport
```

### No-match handling

If AI returns a category name not in the list, instead of returning `null`, return:
```json
{ "category": "Subscriptions", "confidence": 0.75, "noMatch": true }
```
Store `aiSuggestedCategoryName = "Subscriptions"`, `aiSuggestedCategoryId = null`.

---

## Rule Suggestion Logic

Server groups `needsReview` transactions by the first token of `description` (lowercased, stripped of special chars). Groups of 3+ transactions with the same first token, all pointing to the same suggested category, are returned as rule suggestions.

Example: `["amazon b79l", "amazon prime", "amazon mktp"]` → suggest rule: `description startsWith "amazon" → Online Shopping`

---

## Out of Scope

- Automatic rule creation (user must explicitly trigger)
- ML model training (few-shot prompt injection only)
- Real-time categorization as transactions are imported (batch only)
