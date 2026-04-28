# Explanations: Understanding Kuber

These articles explain the *why* behind Kuber's design. They help you understand the philosophy, the data model, and the security choices — so you can use Kuber more effectively.

---

## Why Self-Hosting? (Instead of SaaS)

Most personal finance apps are **SaaS** (Software as a Service):
- You pay a monthly subscription
- Your data lives on *their* servers
- They can see your spending patterns
- They can change pricing or shut down anytime

Kuber is **self-hosted**:
- **No subscriptions** — run it on hardware you already own
- **Your data stays yours** — it never leaves your server
- **No third-party bank connections** — you control what gets imported
- **Open source** — audit the code yourself, or modify it

### Who Should Self-Host?

Self-hosting is for people who:
- Value privacy and data ownership
- Have (or want to learn) basic server administration
- Want to avoid monthly fees
- Like customizing their tools

If that's not you, a SaaS app like YNAB or Mint might be easier to start with. But if you're reading this, you probably value control — and Kuber gives you that.

---

## Accounts, Transactions, Categories — The Data Model

Understanding Kuber's data model helps you organize your finances effectively.

### Accounts

An **account** is a container for transactions. Each account has:
- A **type** (Checking, Savings, Credit Card, Investment, Loan, Custom)
- A **balance** (either manually entered or calculated from transactions)
- An optional **institution** name (e.g., "Chase")

Accounts are grouped in the UI:
- **Checking & Savings** → your cash
- **Credit Cards** → your debts
- **Investments** → your portfolio
- **Manual Assets/Liabilities** → things like cars, houses, personal loans

### Transactions

A **transaction** represents money moving in or out:
- **Positive amount** = income (paycheck, refund, interest)
- **Negative amount** = expense (coffee, rent, shopping)
- Each transaction belongs to **one account**
- Each transaction can have **one category** and multiple **tags**

Transactions are **soft-deleted** — they're hidden but never permanently erased. This protects your history.

### Categories

**Categories** group your transactions so you can see *where* your money goes:

| Category Type | Examples |
|---------------|---------|
| Expense | Food & Dining, Transportation, Housing, Entertainment |
| Income | Salary, Freelance, Interest, Gifts |

You can create as many categories as you want. The **Rules Engine** can auto-assign categories based on merchant name, amount, or other conditions.

### Tags

**Tags** are flexible labels you can add to any transaction (optional):
- "business" (for tax-deductible expenses)
- "vacation" (trips and holidays)
- "recurring" (monthly subscriptions)

Tags are not hierarchical like categories — use them for cross-cutting concerns.

---

## Household & Multi-User

Kuber supports **households** — multiple people sharing finances:

- The **first person to register** becomes the **household owner**
- The owner can **invite members** from Settings → Household
- All data is **scoped to the household** — you only see your household's accounts and transactions
- Each member has their own **login, 2FA, and preferences**

### Use Cases

- **Couples:** Share a household to see joint accounts and split expenses
- **Roommates:** Track shared bills (rent, utilities) while keeping personal spending separate
- **Small businesses:** Use a household for business finances, invite an accountant as a member

---

## Budgets & Goals — Philosophy

### Budgets = Spending Limits

A **budget** sets a maximum you want to spend in a category each month:
- "Food & Dining: $300/month"
- "Entertainment: $100/month"

Kuber tracks your actual spending against the budget and shows progress:
- **Under budget** → green (you're doing great!)
- **Near limit** → yellow (slow down)
- **Over budget** → red (you've spent more than planned)

### Goals = Savings Targets

A **goal** is something you're saving *toward*:
- "Emergency Fund: $10,000"
- "Vacation: $3,000"
- "New Laptop: $2,000"

Each goal shows a **progress ring** — how much you've saved vs. the target.

### The 50/30/20 Rule

Kuber's **Wealth** page uses the 50/30/20 budgeting rule:
- **50% Needs** — rent, groceries, utilities, insurance
- **30% Wants** — dining out, entertainment, hobbies
- **20% Savings** — emergency fund, retirement, investments

Kuber automatically assigns your categories to these buckets and shows where you're overspending.

---

## AI Advisor — What It Sees, What It Doesn't

### What the AI Sees

When you chat with the AI Advisor, it has **read-only access** to:
- Your account names and balances
- Your transaction history (merchant, amount, category)
- Your budget limits and progress
- Your savings goals

The AI uses this context to give personalized advice.

### What the AI Doesn't See

- Your **passwords** or authentication details
- Data from **other households** (strictly scoped)
- Anything beyond your financial data (no emails, no private notes unless you paste them in chat)

### Privacy Guarantees

- Your API key is stored **encrypted** in the database
- The key is only sent to **your chosen provider** (Claude, OpenAI, etc.)
- **Ollama** runs entirely on your server — no data leaves at all
- You can **disable** the AI Advisor entirely if you prefer

---

## Security Model

Kuber takes security seriously — your financial data is sensitive.

### Authentication: JWT + httpOnly Cookies

1. You log in with email + password
2. Server returns:
   - **Access token** (JWT, 15-minute lifetime) — stored in memory by the frontend
   - **Refresh token** (JWT, 7-day lifetime) — stored as an **httpOnly cookie** (not accessible to JavaScript)
3. When the access token expires, the frontend uses the refresh token to get a new one
4. If you log out, the refresh cookie is cleared

> **Why httpOnly cookies?** They can't be read by JavaScript, so XSS attacks can't steal your session.

### Two-Factor Authentication (2FA)

Optional but **strongly recommended**:
- Uses **TOTP** (Time-based One-Time Password)
- Works with Google Authenticator, Authy, Bitwarden, etc.
- **Backup codes** provided for emergency access

### Account Lockout

After too many failed login attempts, your account is temporarily locked — this prevents brute-force attacks.

### Audit Log

Sensitive actions (login, password change, 2FA toggle, budget changes) are logged in an **audit log**. Only household owners can view it.

### Soft Deletes

Financial records are **never permanently deleted**:
- "Deleted" transactions are marked `isDeleted: true`
- They're hidden from the UI but remain in the database
- This preserves your history and prevents accidental data loss

---

## Soft Deletes — Why Data Never Truly Dies

When you "delete" a transaction, account, or budget in Kuber, it's not really gone:

1. The record is marked `isDeleted: true` in the database
2. It disappears from the UI (soft-deleted)
3. It remains in the database for audit/history purposes
4. Only a database admin (you) can permanently erase it

### Why This Matters

- **Undo accidents:** If you accidentally delete a transaction, a database restore can bring it back
- **Audit trail:** Your financial history is never lost
- **Legal compliance:** Some jurisdictions require financial records to be kept for years

### Restoring Soft-Deleted Data

If you need to restore a soft-deleted item:
1. Access the database directly: `docker compose exec postgres psql -U kuber kuber_db`
2. Find the record: `SELECT * FROM transactions WHERE "isDeleted" = true;`
3. Un-delete it: `UPDATE transactions SET "isDeleted" = false WHERE id = '...';`

> **Tip:** In practice, you should rarely need to do this. Be careful with deletions!

---

## Investment Tracking

Kuber tracks investments separately from daily spending:

### Holdings

A **holding** represents shares you own:
- Ticker symbol (e.g., "AAPL" for Apple)
- Number of shares
- Cost basis (what you paid)
- Current price (fetched automatically or entered manually)

The **total portfolio value** = sum(shares × current price) across all holdings.

### Allocation

Kuber shows your portfolio allocation:
- **By ticker** — how much of each stock you own
- **By sector** — technology, healthcare, finance, etc.

This helps you diversify and avoid over-concentration.

### Performance

Track how your investments are doing over time:
- **Total return** — current value vs. cost basis
- **Percentage gain/loss**
- **Pending transactions** — buys/sells that haven't been categorized yet

---

## Summary: Kuber's Design Principles

| Principle | What It Means |
|-----------|----------------|
| **Data ownership** | Your financial data stays on your server |
| **Privacy first** | No third-party bank connections, no data mining |
| **Soft deletes** | Financial history is never permanently lost |
| **Household scope** | Multi-user, but data is isolated per household |
| **Open source** | Audit the code, modify it, contribute back |
| **Self-hosted** | No subscriptions, no vendor lock-in |
