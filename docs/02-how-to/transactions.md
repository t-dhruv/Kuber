# How-to: Record Transactions

## Goal
Record income and expenses in Kuber, either manually or by importing a CSV file from your bank.

---

## Method 1: Manual Entry

### Record an Expense

1. Click **Transactions** in the sidebar
2. Click **Add Transaction** (`+` button)
3. Fill in the transaction drawer:
   - **Merchant:** "Starbucks" (where you spent)
   - **Amount:** `-5.50` (negative for expenses)
   - **Date:** When it happened
   - **Account:** Select the account you used
   - **Category:** Pick "Food & Dining" (or type a new category name)
   - **Notes:** Optional (e.g., "Morning coffee")
4. Click **Save**

The transaction appears in your list, grouped by date. Expenses are red.

### Record Income

1. Click **Transactions → Add Transaction**
2. Fill in:
   - **Merchant:** "Paycheck" or employer name
   - **Amount:** `3000.00` (positive for income, no minus sign)
   - **Date:** Payday
   - **Account:** Your checking account
   - **Category:** "Salary" or "Income"
3. Click **Save**

Income appears in green in your transaction list.

---

## Method 2: CSV Import

### Prepare Your CSV File

Your bank probably lets you export transactions as CSV. Kuber can import these.

**Expected columns** (column names don't need to match exactly — Kuber detects them):
- Date
- Description / Merchant
- Amount
- (Optional) Type (income/expense)

### Import

1. Click **Transactions → Import CSV**
2. Click **Upload** and select your CSV file
3. Select the **account** this file belongs to
4. Click **Analyze File**
5. Review the preview:
   - **New:** Transactions that don't exist yet
   - **Duplicates:** Transactions already in your database
   - **Total:** All rows in the file
6. Click **Import All** to confirm

The transactions are now in your Kuber account.

---

## Categorize Transactions

### One at a Time

1. Click on a transaction in the list
2. In the edit drawer, select a **Category** from the dropdown
3. Click **Save**

### Auto-Categorize with Rules

Set up rules so Kuber automatically categorizes future transactions:

1. Click **Rules** in the sidebar
2. Click **Add Rule**
3. Set condition: "Merchant contains 'Starbucks'"
4. Set action: "Categorize as 'Food & Dining'"
5. Click **Save**
6. Click **Apply All Rules** to run on existing transactions

### Inline Category Creation

When recording a transaction, if the category doesn't exist:

1. Click the **Category** dropdown
2. Type a new category name (e.g., "Pet Care")
3. Select the type (Expense or Income)
4. Pick an icon (optional)
5. Click **Create**
6. The new category is saved and selected

---

## Edit or Delete Transactions

- **Edit:** Click the transaction → update fields in the drawer → Save
- **Delete:** Click the transaction → click **Delete** → confirm

> **Note:** Deleted transactions are removed from active app data. Export or back up first if you may need recovery.

---

## Bulk Actions

When you have many transactions to update:

1. Check the boxes next to multiple transactions
2. A **Bulk Actions** bar appears at the top
3. Choose: **Recategorize**, **Mark Reviewed**, **Hide**, or **Delete**

## Confirmation

- Transaction appears in the list with correct merchant, amount, and category
- The account balance (if shown) reflects the new transaction
- Category spending shows up in **Budgets** and **Reports**

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **CSV import fails** | Check that your CSV has at least Date, Description, and Amount columns. Try opening it in Excel to verify formatting. |
| **Can't find category** | Type a new category name in the dropdown — Kuber will offer to create it. |
| **Transaction amount seems wrong** | Expenses are negative numbers. If you enter `5.50` it becomes income. Use `-5.50` for expenses. |
| **Duplicate transactions** | Kuber detects some duplicates automatically. You can also visit the **Duplicates** tab to merge or dismiss them. |
