# Kuber

Self-hosted personal finance. One deployment serves one family's books: accounts,
transactions, budgets, goals, and investments, with no third-party bank connections.

## Language

### Tenancy

**Instance**:
A single self-hosted Kuber deployment — one database, one set of images, run by one
operator. An Instance is not a tenant boundary; the Household is.
_Avoid_: server, server instance, installation, tenant

**Household**:
The data-isolation boundary. Every financial record belongs to exactly one Household,
and no query may cross between them.
_Avoid_: family, tenant, organization, workspace

**User**:
A person with login credentials. A User belongs to exactly one Household.
_Avoid_: user account, member account, login

**Member**:
A User's participation in a Household, carrying a role of `owner` or `member`.
_Avoid_: membership, seat, participant

**Owner**:
The Member role permitted to invite Users, reset another Member's MFA, and manage
Instance-wide settings.
_Avoid_: admin, administrator, superuser

**Self-hoster**:
The person who operates an Instance. Usually also the Owner, but the roles are distinct —
operating the deployment is not the same as holding a role inside a Household.
_Avoid_: host, sysadmin, operator

### Money

**Account**:
A financial account — chequing, savings, credit card, investment, loan, or a custom type.
Never a login. When you mean the person, say User.
_Avoid_: user account, bank account

**Transaction**:
A single movement of money against an Account. May be divided into Splits or paired into
a Transfer.
_Avoid_: entry, record, txn

**Split**:
A portion of a Transaction assigned to its own Category, so one Transaction can span
several Categories.
_Avoid_: line item, allocation, sub-transaction

**Transfer**:
A pair of Transactions moving money between two Accounts in the same Household. Excluded
from income and expense totals — a Transfer is not spending.
_Avoid_: internal transaction, movement

**Category**:
The classification applied to a Transaction, typed as `income`, `expense`, or `transfer`.
Type is the single source of truth for how a Transaction is reported.
_Avoid_: tag, label, bucket

**Bucket**:
A Category's 50/30/20 assignment — `needs`, `wants`, or `savings`. Distinct from
Category type, which drives reporting.
_Avoid_: group, class

**Manual Asset / Manual Liability**:
A holding or debt tracked by hand rather than derived from an Account, counted in net
worth. Kept as two terms because they carry opposite sign.
_Avoid_: manual account, off-book account

**Rule**:
A stored condition set that categorises matching Transactions automatically.
_Avoid_: filter, automation, macro

### Reporting

**Journal**:
The normalised ledger rows that every report reads from. Reports never query
Transactions directly.
_Avoid_: ledger, entries table

**Snapshot**:
A point-in-time net-worth record, captured daily, that history charts read back.
_Avoid_: history record, datapoint

**Standard report**:
A report served by the `/reports/standard/*` contract, as opposed to the legacy report
endpoints still in place alongside it.
_Avoid_: report v2, new reports
