# Privacy and Data Handling

Kuber is designed for self-hosted personal finance management. This document describes how the application handles data from an engineering perspective. It is not legal advice.

## Data Stored

Depending on enabled features, Kuber may store:

- Account names, institutions, balances, currencies, and account metadata.
- Transactions, imports, receipts, categories, tags, merchants, budgets, bills, rules, reports, goals, assets, liabilities, investments, and audit records.
- User profile data such as name, email address, timezone, password hash, 2FA status, preferences, sessions, and API tokens.
- Integration settings for AI providers, outbound webhooks, email delivery, and optional IMAP receipt import.
- Uploaded files and generated artifacts when file or receipt features are used.

## Local Processing

Core finance features run inside the self-hosted application and database. Data remains in the operator-controlled deployment unless an external integration is configured or the operator connects external infrastructure such as hosted email, AI, logging, backups, or monitoring.

## External Processors and Integrations

External data sharing depends on configuration:

| Integration | Data potentially sent | Notes |
| --- | --- | --- |
| AI advisor/providers | Financial context, user questions, report summaries, investment or wealth-analysis context | Provider choice is configurable. Custom/non-Ollama base URLs are restricted from private/reserved network targets by server-side URL validation. |
| Webhooks | Event type and event payload for configured events | Webhook destinations are owner/admin controlled and restricted from private/reserved network targets by server-side URL validation. |
| Email delivery | Recipient email, subject, and generated notification/report content | Depends on SMTP or provider configuration. |
| IMAP receipt import | Mailbox connection settings and receipt email contents fetched into Kuber | IMAP processing imports matching receipt data into the application. |
| Backups/logging/monitoring | Deployment-dependent database, file, metric, or log data | Self-hosted operators control these systems. |

## Credentials and Secrets

Kuber stores passwords as hashes. Some integration secrets are encrypted at rest where implemented. Operators should protect the database, backups, `.env` files, and server logs as sensitive materials.

Known hardening work remains tracked in `docs/audits/full-application-gap-implementation-progress-2026-05-07.md`.

## Retention and Deletion

Kuber's current retention model is explicit hard delete for user-requested deletion paths unless a specific feature documents otherwise. Deleted records may still remain in database backups, exported files, logs, or audit/history tables until those systems expire or are purged by the self-host operator.

## Self-Hosted Operator Responsibilities

Operators are responsible for:

- Choosing trusted AI, webhook, email, backup, and monitoring providers.
- Configuring TLS and secure production secrets.
- Limiting administrative access to the deployment and database.
- Setting backup retention and deletion procedures.
- Reviewing local legal and compliance obligations for financial and personal data.

## User Controls

Available controls depend on enabled features, but may include export, account deletion, integration disablement, API-token revocation, webhook deletion, session logout, and preference updates.
