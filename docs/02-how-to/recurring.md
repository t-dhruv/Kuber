# Tracking recurring bills

**Recurring** in the sidebar, under Planning, tracks the money that arrives and
leaves on a schedule — subscriptions, rent, utilities, salary — so you can see
what is still due this month before it lands.

A recurring item is a *plan*, not a Transaction. Kuber does not create
Transactions from it; you still record the actual payment. The plan is what tells
you the payment is coming.

## Add a recurring item

Click **Add** and fill in:

- **Name** — "Netflix", "Rent", "Gym".
- **Amount** — and note the sign convention here, which differs from the
  Transaction form: **negative for expenses**, positive for income. The
  placeholder spells it out: `-29.99` for an expense, `1500` for income.
- **Frequency** — Weekly, Bi-weekly, Monthly, Quarterly or Annually.
- **Next Date** — when it is next due. Kuber rolls this forward by the frequency.
- **Account** — which Account it comes out of, or into.
- **Category** — for expenses.
- **Active** — on by default. Turn it off for something paused rather than
  cancelled.

## Read the page

**Upcoming** lists this month's unpaid expenses. Each carries a status badge:
*Paid*, or *Due* with how long until it is due, so anything overdue is obvious.

Above it, a progress bar splits the month's recurring expenses into what you have
paid and what remains, with an upcoming total.

## Mark an item paid

Click the tick on a recurring row when the payment has actually gone out. The
badge flips to *Paid* and the amount moves from remaining to paid in the summary.

This flag is about this occurrence. When the next due date comes round, the item
returns to unpaid.

## Pause, edit or delete

Each row carries three controls:

- **Pause** / **Resume** — an inactive item stays in the list with its history
  but drops out of upcoming totals. Use this for a subscription you have frozen.
- **Edit** — change any field. Correcting the amount does not rewrite
  Transactions you have already recorded.
- **Delete** — removes the plan. Recorded Transactions are unaffected.

## Relationship to Transactions

A Transaction has its own **Is Recurring** toggle, which marks that Transaction
as part of a repeating series. It is a label on the Transaction and is separate
from the plans on this page — setting it does not create a recurring item, and
adding a recurring item does not tag past Transactions.

## Verify

- The item appears with the right frequency and next due date.
- An expense you entered negative reduces the upcoming total; income does not.
- Marking it paid moves it out of the remaining figure.
- A paused item disappears from upcoming without being deleted.
