# Recording Transactions

A Transaction is one movement of money against an Account. This guide covers
recording them by hand, dividing one across Categories with Splits, moving money
between Accounts with a Transfer, and correcting them afterwards.

To bring in history from your bank instead, see the CSV format in the
[reference](../03-reference.md).

## Record an expense or income

Go to **Transactions** in the sidebar and click **Add Transaction**.

The first control is a type toggle: **Expense**, **Income**, **Transfer**. It
decides everything else about the form, so set it first.

For an Expense or Income:

- **Date** — defaults to today.
- **Amount** — always a positive number. The toggle already decided the
  direction, and the hint under the field confirms which way it will be
  recorded. A negative amount leaves the form disabled rather than recording an
  expense.
- **Merchant / Description** — required.
- **Account** — required. Which Account the money moved against.
- **Category** — search the list. There is no create-as-you-type here; a Category
  you do not have yet has to be added under **Settings → Categories** first. See
  [Categories](categories.md).
- **Notes** — optional.

The button names what you are about to do: **Add Expense** or **Add Income**.

## Record a Transfer

Money moving between two of your own Accounts is a Transfer, not spending. Kuber
excludes Transfers from income and expense totals, so recording a credit-card
payment as an expense will overstate what you spent.

Set the toggle to **Transfer** and the form replaces Account and Category with
**From Account** and **To Account**. Pick both — Kuber will not let you transfer
an Account to itself — enter a positive amount, and click **Record Transfer**.

## Split one Transaction across Categories

A single shop receipt is often two or three Categories. Rather than splitting the
purchase into fake Transactions, split the real one.

Click the split icon on the Transaction row — its tooltip reads *Split
transaction*, or *Edit split* if the Transaction is already divided. The modal
shows the original amount, then a row per Category:

- **Category**
- **Amount ($)**
- **Note (optional)**

**Add split line** adds rows; you cannot go below two. A running total tracks
against the original and turns green only when the Splits balance to it exactly.
Kuber will not save an unbalanced Split.

## Edit a Transaction

Click a Transaction to open its drawer. Alongside the fields from the add form:

**Tags** — free-form labels that cut across Categories. Type and press Enter or
click **Add**. A Transaction has one Category but any number of tags. See
[tags](tags.md).

**Needs Review** — flags it for the AI Review queue.

**Is Recurring** — marks it as part of a repeating series. See
[recurring bills](recurring.md).

**Hide from reports** — keeps the Transaction on the Account but out of every
report.

**Refund** — marks money returned to you, and lets you point at the original
Transaction it refunds, so the pair nets out instead of reading as income.

Changing the type of an existing Transaction to Transfer converts it, which
rewrites how it is reported. Kuber warns you before it does.

## Delete a Transaction

Open the Transaction and choose **Delete**. This is a soft delete: the row leaves
your lists and reports, and the Account balance is corrected, but the record
remains in the database. There is no undelete in the UI — recovery means
restoring a [backup](backup.md).

## Work through many at once

Tick the checkboxes on several rows and a bulk bar appears showing the count
selected, with four actions:

- **Recategorize** — apply one Category to all of them.
- **Mark Reviewed** — clear the review flag.
- **Hide** — remove from reports.
- **Delete**.

## Stop categorising by hand

If you are setting the same Category on the same merchant every month, write a
Rule instead. A Rule is a stored condition that categorises matching Transactions
automatically, and can be applied to Transactions already recorded. See
[Categories](categories.md).

## Verify

- The Transaction appears in the list under its date, expenses and income
  visually distinguished.
- The Account balance has moved by the amount, in the expected direction.
- The spend shows against its Category in **Budget** and **Reports**.
- A Transfer moved both Account balances and changed neither your income nor
  your expense total.
