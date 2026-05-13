# Tutorial: First Steps with Kuber

Welcome to Kuber! This tutorial walks you through installing Kuber on your own server and recording your first transaction — all in about 30 minutes.

## What You'll Learn

By the end of this tutorial, you will have:
- A running Kuber instance on your server
- Your first account created
- Your first transaction recorded
- A basic budget set up

## Prerequisites

You'll need:
- A server or VPS with **1 GB RAM** (2 GB recommended)
- **Docker 24+** and **Docker Compose v2** installed
- A domain name (optional, but required for HTTPS)
- About **30 minutes**

> **Don't have Docker?** Install it from [docker.com](https://www.docker.com). The free Docker Desktop works for testing on your own computer.

---

## Step 1: Install Kuber

### 1.1 Clone the Repository

Open a terminal on your server and run:

```bash
git clone https://github.com/yourusername/kuber.git
cd kuber
```

### 1.2 Configure Environment

```bash
cp .env.example .env
```

Now open the `.env` file in a text editor and set these **required** values:

```bash
# Generate two strong secrets (run each command separately):
openssl rand -base64 64   # paste the output into JWT_SECRET
openssl rand -base64 64   # paste the output into JWT_REFRESH_SECRET

# Set a strong database password
POSTGRES_PASSWORD=a-strong-password-here
DATABASE_URL=postgresql://kuber:a-strong-password-here@postgres:5432/kuber_db

# Set your public URL (no trailing slash)
CLIENT_URL=http://your-server-ip
```

> **Important:** `JWT_SECRET` and `JWT_REFRESH_SECRET` must be different long random strings. Changing them later will sign out all users.

### 1.3 Start the Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

This starts four containers: `postgres`, `server`, `client`, and `nginx`. The first run builds images — this takes 2–3 minutes.

### 1.4 Run Database Migrations

```bash
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

### 1.5 Create Your Account

Open your browser and navigate to **http://your-server-ip** (or **http://localhost** if running locally).

Click **Create Account** and fill in:
- First name
- Last name
- Email address
- Password (at least 8 characters)

> **Note:** The first person to register becomes the **household owner**. Owner/admin member management exists in Settings; emailed invite redemption is planned future work.

---

## Step 2: Take a Tour of the Dashboard

After logging in, you'll see the **Dashboard** — your financial command center.

### What You'll See

- **Net Worth** — Total assets minus liabilities
- **Budget Progress** — How much of your monthly budget you've spent
- **Recent Transactions** — Your latest spending and income
- **Upcoming Bills** — Recurring payments due soon
- **Savings Goals** — Progress toward your financial goals

Take a moment to click around. The sidebar on the left gives you access to all major sections: **Accounts**, **Transactions**, **Budgets**, **Reports**, and more.

---

## Step 3: Add Your First Account

Let's add a checking account:

1. Click **Accounts** in the sidebar
2. Click **Add Account**
3. Fill in:
   - **Name:** "Main Checking"
   - **Type:** Checking
   - **Institution:** "Chase" (optional)
   - **Last 4 Digits:** e.g., "1234" (optional)
   - **Current Balance:** Enter your actual balance
4. Click **Save**

Your account now appears in the list. The balance is shown next to it.

> **Tip:** You can add multiple accounts — checking, savings, credit cards, even investment accounts.

---

## Step 4: Record Your First Transaction

Now let's record a transaction:

1. Click **Transactions** in the sidebar
2. Click **Add Transaction** (usually a `+` button or "Add" button)
3. Fill in:
   - **Merchant:** "Starbucks"
   - **Amount:** `-5.50` (negative for expenses, positive for income)
   - **Date:** Today's date
   - **Account:** Select "Main Checking"
   - **Category:** Select "Food & Dining" (or create a new category)
4. Click **Save**

Your transaction now appears in the list, grouped by date. Expenses show in red, income in green.

### Quick Tip: Categories

Categories help you understand where your money goes. You can:
- Pick from existing categories (Food, Transport, Housing, etc.)
- Create new ones on the fly (click "Create Category" in the dropdown)
- Let Kuber's **Rules Engine** auto-categorize similar transactions in the future

---

## Step 5: Set a Budget

Budgets help you control spending:

1. Click **Budgets** in the sidebar
2. Click **Add Budget**
3. Fill in:
   - **Category:** "Food & Dining"
   - **Amount:** `300` (your monthly limit)
   - **Period:** Monthly
4. Click **Save**

Now watch the progress bar. As you record transactions in that category, the bar fills up. When you exceed the budget, it turns red — a visual warning to slow down.

---

## Step 6: Explore More Features

Congratulations! You've completed the basics. Here's what to explore next:

| Feature | What It Does | Where to Find It |
|---------|---------------|-------------------|
| **Reports** | See spending breakdowns with charts | Sidebar → Reports |
| **Goals** | Set savings targets with progress rings | Sidebar → Goals |
| **Recurring** | Track monthly bills and subscriptions | Sidebar → Recurring |
| **AI Advisor** | Chat about your finances (optional) | Sidebar → Advisor |
| **Settings** | Configure email, 2FA, household members | Sidebar → Settings |

---

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Can't access the site** | Check that Docker is running: `docker compose -f docker-compose.prod.yml ps` |
| **Login loop / constant logouts** | Ensure `JWT_SECRET` and `JWT_REFRESH_SECRET` are set and stable in `.env` |
| **Emails not sending** | Check SMTP settings in `.env` (see [How-to: Configure Email](02-how-to/email.md)) |
| **Can't create account** | Run migrations: `docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy` |

For more help, see the [full self-hosting guide](SELF_HOSTING.md) or open a [GitHub Issue](https://github.com/yourusername/kuber/issues).

---

## Summary

You've just:
- Installed Kuber on your own server
- Created your first account
- Recorded your first transaction
- Set up a budget

Your financial data is now under **your** control — no subscriptions, no third-party bank connections, no data mining. Welcome to self-hosted personal finance!

**Next:** Check out the [How-to Guides](02-how-to/) to learn specific tasks, or read the [Explanations](04-explanation.md) to understand Kuber's design philosophy.
