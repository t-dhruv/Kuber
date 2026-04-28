# How-to: Track Recurring Bills

## Goal
Track monthly subscriptions + bills. See what's coming up + what's paid.

---

## Add Recurring Item

1. Click **Recurring** in sidebar
2. Click **Add Recurring**
3. Fill:
   - **Description:** "Netflix"
   - **Amount:** `15.99` (always positive)
   - **Frequency:** Monthly (or Weekly, Yearly)
   - **Account:** "Main Credit Card"
   - **Category:** "Entertainment" (optional)
   - **Next Date:** next payment date
4. Click **Save**

Item appears in list w/ next due date.

---

## Mark as Paid

When bill is paid:

1. Find item in **Recurring** list
2. Click **Mark Paid**
3. Kuber creates txn + advances next date

---

## View Upcoming Bills

Go to **Dashboard** → **Upcoming Bills** widget:
- Bills due in next 30 days
- Overdue items highlighted red
- Total monthly commitment

---

## Edit / Delete

- **Edit:** Click item → change amount/frequency → Save
- **Delete:** Click trash icon → confirm

---

## Bulk Add from Transactions

If you have existing txns:

1. Go to **Transactions**
2. Find recurring payment (e.g., Netflix)
3. Open txn → toggle **Is Recurring**
4. Save → Kuber suggests adding to Recurring list

---

## Confirmation

- Recurring item shows correct amount + frequency
- Next due date advances after "Mark Paid"
- Dashboard shows upcoming bills summary

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **"Mark Paid" not working** | Check that "Next Date" is in the past or today. |
| **Txn not created** | Verify account is selected. Check **Transactions** page for new entry. |
| **Frequency wrong** | Edit item → change frequency. Affects how next date advances. |
| **Missing from dashboard** | Dashboard widget shows only next 30 days. Adjust date range if needed. |
