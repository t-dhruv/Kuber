# How-to: Add Accounts

## Goal
Add all your financial accounts to Kuber so you can track balances and transactions in one place.

## Account Types

Kuber supports these account types:
- **Checking** — Everyday spending
- **Savings** — Emergency fund, targeted savings
- **Credit Card** — Credit card balances (shown as liabilities)
- **Investment** — Stocks, ETFs, mutual funds
- **Loan** — Mortgages, student loans, personal loans
- **Custom** — Any other account type you need

---

## Add a Bank Account (Checking/Savings)

1. Click **Accounts** in the sidebar
2. Click **Add Account**
3. Fill in:
   - **Name:** "Main Checking" or "Emergency Savings"
   - **Type:** Checking / Savings
   - **Institution:** "Chase", "Bank of America", etc. (optional)
   - **Last 4 Digits:** e.g., "1234" (optional, for identification)
   - **Current Balance:** Enter the actual balance from your bank
4. Click **Save**

The account appears in the list under its group (Checking, Savings, etc.).

---

## Add a Credit Card

1. Click **Accounts → Add Account**
2. Fill in:
   - **Name:** "Visa Card"
   - **Type:** Credit Card
   - **Institution:** "Citi", "Amex", etc.
   - **Last 4 Digits:** e.g., "5678"
   - **Current Balance:** Enter the **outstanding balance** (usually negative, but Kuber stores it as a positive number representing what you owe)
3. Click **Save**

Credit cards appear under "Credit Cards" group. The balance is shown as money you owe.

---

## Add an Investment Account

1. Click **Accounts → Add Account**
2. Fill in:
   - **Name:** "401(k)" or "Robinhood"
   - **Type:** Investment
   - **Institution:** "Fidelity", "Robinhood", etc.
3. Click **Save**

Then track individual holdings under **Investments** in the sidebar.

---

## Edit or Delete an Account

- **Edit:** Click the pencil icon next to an account → update details → Save
- **Delete:** Click the trash icon → confirm deletion

> **Note:** Deleting an account removes it from active app data. Export or back up first if you may need recovery.

---

## Manual Assets & Liabilities

For things not tied to a bank (a car, a house, a personal loan):

1. Go to **Accounts**
2. Look for **Manual Assets** or **Manual Liabilities** section
3. Click **Add Asset** or **Add Liability**
4. Enter name, current value, and type
5. Save

These contribute to your **Net Worth** calculation.

## Confirmation

- Account appears in the list with correct balance
- Balance is shown in the correct group (Checking, Savings, etc.)
- Net Worth (if enabled) updates to include the new account

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Balance not updating** | Refresh the page. Kuber shows the balance you entered — it doesn't sync with your bank automatically. |
| **Can't find account type** | Select "Custom" and type the account type in the Name field. |
| **Deleted wrong account** | Restore from a database backup or re-create the account manually. |
