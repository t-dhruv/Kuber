# Understanding Kuber

Background reading rather than instructions. If you want to get something done,
the [how-to guides](02-how-to/00-index.md) are the shorter path; this explains
the reasoning those guides sit on top of.

The vocabulary here is defined in [`CONTEXT.md`](../CONTEXT.md).

## Why self-host

Kuber is one deployment — an Instance — serving one family's books, run on
hardware you control.

The usual alternative is a hosted service holding your financial history on its
servers, funded by a subscription and sometimes by what the data is worth. That
model buys real convenience: automatic bank feeds, no maintenance, no backups to
think about.

Self-hosting trades that convenience away for three things:

**The data stays where you put it.** Your Transactions live in your Postgres
volume. Nothing is transmitted anywhere unless you configure something that
transmits it — and the one feature that does, [the AI advisor](02-how-to/ai-advisor.md),
is off by default and says so plainly.

**Nobody can change the terms.** Nothing is repriced, discontinued, or acquired
underneath you. An Instance you have pinned to a version tag keeps working.

**No bank credentials anywhere.** Kuber has no third-party bank connections, so
there is no aggregator holding your logins, and no aggregator to be breached.

The cost is honest and worth stating: you are the Self-hoster. Backups are your
responsibility, upgrades are your decision, and if the machine dies without a
[backup](02-how-to/backup.md) the data is gone. There is no support line and no
password reset from outside.

Kuber also has no bank feeds, which is the direct consequence of not asking for
your credentials. Transactions arrive by hand or by CSV import.

## The data model

### Household — the isolation boundary

Every financial record belongs to exactly one Household, and no query crosses
between them. A User is a person with credentials, and belongs to exactly one
Household — enforced by a database constraint, not just by convention. See
[ADR-0004](adr/0004-a-user-belongs-to-exactly-one-household.md).

This is why there is no Household switcher: the code assumed one Household per
User in every auth path, and the schema quietly permitted more. Rather than
leaving that contradiction to be resolved arbitrarily at login — in a finance
app, by showing someone the wrong books — the constraint makes the assumption
true.

### Accounts and Transactions

An **Account** is a financial account. It is never a login; that is a User. The
distinction is laboured throughout these documents precisely because most
software uses the word both ways.

A **Transaction** is one movement of money against an Account. Two structures
build on it:

- A **Split** divides one Transaction across several Categories. A single shop
  receipt is often groceries *and* household goods, and Splits let that be one
  real record rather than two invented ones.
- A **Transfer** pairs two Transactions moving money between your own Accounts.
  Transfers are excluded from income and expense totals — moving money between
  your pockets is not spending, and counting it would overstate both sides.

### Categories, types and Buckets

A **Category** classifies a Transaction, and carries a **type** — income, expense
or transfer. Type is the single source of truth for how reporting treats a
Transaction. This is the one piece of data modelling worth getting right by hand:
a Category typed wrongly does not look wrong, it just quietly moves numbers.

A **Bucket** is separate: a Category's 50/30/20 assignment of needs, wants or
savings. Buckets feed one view and nothing else.

Tags are the third axis — free-form, many per Transaction, for groupings that are
not a kind of spending at all.

### Journal, and why reports do not read Transactions

Reports read from the **Journal** — normalised ledger rows — rather than querying
Transactions directly. The indirection buys consistency: Splits, Transfers and
refunds each need different handling to be counted correctly, and doing that
resolution once, on the way into the Journal, means every report agrees. Reports
computing it independently is how two screens come to disagree about last month.

A **Snapshot** is a point-in-time net-worth record, captured daily. History
charts read Snapshots rather than recomputing the past, so the shape of your net
worth over time does not shift when you edit an old Transaction.

### Soft deletion

Deleting a financial record marks it deleted rather than erasing the row. It
leaves your lists and every report immediately, and there is no undelete in the
UI — recovery means restoring a [backup](02-how-to/backup.md).

The reason to keep the row is referential: financial records are linked, and
erasing one leaves others describing something that no longer exists.

## The 50/30/20 approach

Kuber ships an opinion about budgeting, and you can ignore it — but it is worth
knowing what it means.

The rule of thumb splits take-home pay three ways: **50% needs, 30% wants, 20%
savings.** Kuber implements it through Buckets on Categories, surfaced in the
Wealth view.

Its value is not the specific numbers, which will not fit everyone. It is that
the split forces a distinction the Category list does not: how much of your
spending you could actually change. Fifty categories tell you where money went.
Three Buckets tell you how much of it was ever really optional.

Kuber infers a starting Bucket for each Category by name — rent and utilities to
Needs, anything unrecognised to Wants — and expects you to correct it. The
inference is a starting point, not a judgement about your life.

The Budget page makes a related distinction with Fixed, Flexible and Non-Monthly
budget types, for the same underlying reason: an overspend on a Fixed cost means
something changed, an overspend on a Flexible one may be a normal month, and a
Non-Monthly cost arriving in one lump is not an overspend at all.

## The security posture

### What protects an Instance

**Authentication** is a password plus optional MFA: TOTP from an authenticator
app, or an emailed one-time code. TOTP works with no email provider, which is the
common self-hosted case. See [MFA](02-how-to/2fa.md).

**Household scoping** is applied at the query layer, and the isolation boundary
is covered by tests using real database fixtures rather than mocks — a mocked
client returns whatever it is told, which proves nothing about isolation.

**The entry point** sets security headers, restricts CORS to configured origins,
and rate-limits authentication per client. These are tested against the real
application entry point, because middleware configured there is invisible to
tests that mount routers individually.

**Registration** closes automatically once the first Household exists, so an
Instance exposed to the internet does not accept strangers. `ALLOW_SIGNUP`
overrides this in either direction.

**Secrets at rest** — AI provider keys, IMAP passwords and webhook signing
secrets — are encrypted with `AI_ENCRYPTION_KEY`, which is required in
production.

### Two decisions that look like holes

Both are deliberate, and both are recorded as ADRs precisely because they read
badly without the reasoning.

**Email verification is skipped when no email provider is configured**
([ADR-0003](adr/0003-email-verification-is-skipped-when-no-provider-is-configured.md)).
Verification proves control of an address by sending a message to it. With no
mail transport configured, that message is never sent — so gating login on it
protects nothing and permanently locks out the legitimate Self-hoster, which is
exactly what earlier versions did. When a provider *is* configured, verification
applies as normal.

**`COOKIE_SECURE` is configurable** ([ADR-0002](adr/0002-cookie-secure-is-configurable.md)).
Browsers discard `Secure` cookies sent over plain HTTP, so an Instance at
`http://192.168.1.50` lost its session every fifteen minutes with nothing in any
log to explain why. The flag defaults to enabled and the server warns at boot
when you disable it. Disabling it is a real reduction in security — a refresh
token crossing a plain-HTTP LAN can be intercepted — and it exists because the
alternative was not universal HTTPS but an unexplainable login loop.

### What is not in place

**There is no TLS termination in the default stack.** The three-service
deployment publishes plain HTTP; anything beyond a trusted LAN should sit behind
your own reverse proxy or tunnel. See [HTTPS](02-how-to/https.md).

**Field-level encryption is foundation only.** The schema carries encrypted
columns and the Security page reports status, but the setup flow is not
available, so it is not something to rely on today.

**Your data is readable by anyone with the database.** Records are protected by
the application, not encrypted against the Self-hoster. Anyone with the Postgres
volume or a backup file has your books — treat backups accordingly.

### The threat model, plainly

Kuber defends against attackers reaching your Instance over the network, and
against one Household reading another's records. It does not defend against
someone who has your server, your database volume, or your backups. Self-hosting
moves the trust from a vendor to you; it does not remove the need for it.

## Where the reasoning is recorded

Architecture decisions live in [`adr/`](adr/), and each explains what was
considered and what it costs. Three carry explicit "do not fix this" notes,
because the decision reads as a defect to anyone who arrives without the history.
