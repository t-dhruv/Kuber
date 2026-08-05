# Kuber documentation

Kuber is self-hosted personal finance. One deployment — an **Instance** — serves
one family's books, with no third-party bank connections.

The vocabulary used throughout these documents is defined in
[`CONTEXT.md`](../CONTEXT.md). The one worth knowing up front: an **Account** is
always a financial account, never a login. A person with credentials is a
**User**.

## Tutorial

Start here if you have never run Kuber.

- [From nothing to your first Transaction](01-tutorial.md)

## How-to guides

Task-focused instructions for a specific job. Full list in the
[how-to index](02-how-to/00-index.md).

**Running an Instance**

- [Self-hosting and deployment](02-how-to/self-hosting.md)
- [Serving Kuber over HTTPS](02-how-to/https.md)
- [Upgrading to a new version](02-how-to/update.md)
- [Backing up and restoring your data](02-how-to/backup.md)
- [Configuring email](02-how-to/email.md)
- [Adding the observability overlay](02-how-to/observability.md)

**Using Kuber**

Accounts, Transactions, Categories and tags, Budgets, Goals, recurring bills,
Investments, MFA, Household management and the AI advisor are all covered in the
[how-to index](02-how-to/00-index.md).

## Reference

- [Environment variables, ports, and the CSV import format](03-reference.md)

## Explanation

- [Understanding Kuber](04-explanation.md) — why self-host, the data model, the
  50/30/20 approach, and the security posture.
- [Architecture decisions](adr/) — why the deployment, cookie, email
  verification and Household decisions are what they are.
