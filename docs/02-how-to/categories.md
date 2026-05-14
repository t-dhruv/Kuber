# How-to: Categorize Transactions

## Goal
Organize transactions so you know where money goes. Use categories + auto-rules.

---

## One-by-One

1. Click **Transactions** → click a transaction
2. In drawer → select **Category** from dropdown
3. Click **Save**

---

## Create Category Inline

When typing + category missing:

1. Click **Category** dropdown
2. Type new name (e.g., "Pet Care")
3. Select type: **Expense** or **Income**
4. Pick icon (optional)
5. Click **Create**
6. Category saved + selected

> **Code ref:** `client/src/pages/transactions/review/components/CreateCategoryInline.tsx` — inline form w/ name, type, icon picker, modal.

---

## Auto-Categorize with Rules

1. Click **Rules** in sidebar
2. Click **Add Rule**
3. Set condition: "Merchant contains 'Starbucks'"
4. Set action: "Categorize as 'Food & Dining'"
5. Click **Save**
6. Click **Apply All Rules** — runs on existing txns

Future txns matching rule → auto-categorized.

---

## Bulk Recategorize

1. Check boxes next to multiple txns
2. **Bulk Actions** bar appears
3. Click **Recategorize** → pick category → confirm

---

## Merchants

Kuber tracks merchant names from txn descriptions:

- Auto-groups similar names
- Edit merchant on txn → updates all future matching
- View merchant breakdown in **Cash Flow → Merchants** tab

---

## Tags (Flexible Labels)

Add tags for cross-cutting concerns:

1. Open txn drawer
2. Type tag name (e.g., "business", "vacation")
3. Press Enter
4. Save

Filter by tag → click tag badge on txn.

---

## Confirmation

- Txn shows correct category + color
- Category spending appears in **Budgets** + **Reports**
- Rules engine runs → new txns auto-categorized

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Category not saving** | Check network — mutation may have failed. Try again. |
| **Rule not matching** | Check spelling in condition. Use "contains" not exact match for merchant names. |
| **Can't create category** | Name must be unique. Trimming spaces may help. |
| **Bulk action not showing** | Select at least 2 txns. Bar appears at top of list. |
