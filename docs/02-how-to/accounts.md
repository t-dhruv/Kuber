# Adding and managing Accounts

An Account in Kuber is a financial account — a current account, a credit card, an
investment account, a loan. It is never a login. The person with credentials is a
User.

Kuber has no bank connections. Every balance here is one you entered, and it
stays correct because you record Transactions against it, not because anything
syncs overnight.

## Add an Account

Go to **Accounts** in the sidebar, under Money, and click **Add account**.

The form asks for:

- **Account Name** — required. What you will recognise it by: "Main Checking".
- **Account Type** — required, and the one field worth thinking about. See below.
- **Institution** — optional. This is an autocomplete; picking a known bank also
  attaches its logo, which makes the Accounts list much easier to scan.
- **Last Four Digits** — optional, for telling two cards at the same bank apart.
- **Starting Balance** — the balance as it stands right now, on the day you are
  adding the Account. Kuber has no history before this number.
- **Currency** — defaults to your Household currency. Ten are available.
- **Credit Limit** — appears only when the type is Credit Card.

Click **Add Account**. It appears in the list grouped under its type.

## Account types

There are thirteen, and the type is not cosmetic — it decides whether the
Account counts as an asset or a debt in net worth, and how it is grouped:

| Type | Counts as |
|---|---|
| Checking, Savings | Cash |
| Investment, TFSA, RRSP, FHSA, RESP, 401(k), IRA, Roth IRA | Investments |
| Credit Card, Loan | Liabilities |
| Other | Other assets |

The registered and retirement types (TFSA, RRSP, FHSA, RESP, 401(k), IRA, Roth
IRA) behave exactly like Investment for reporting. They exist so the Account
reads as what it actually is.

**Other** is the custom type — use it for anything that does not fit, and put the
distinguishing detail in the name.

### Credit cards and loans

**Enter what you owe as a negative number.** A card with 1,500 outstanding is
`-1500`.

This matters. The Accounts page counts a Credit Card or Loan toward what you owe
only when its balance is negative — enter that same card as `1500` and it
contributes nothing to your net worth rather than reducing it, and the page
treats the positive balance as an overpayment.

## Correct a balance that has drifted

Because you maintain balances by hand, they drift. Rather than editing the
balance directly — which silently rewrites history — reconcile:

1. Click the Account to open its detail panel, then click **Reconcile**.
2. Kuber shows the balance it currently holds.
3. Enter the **Actual balance (from your bank)**.
4. Kuber shows the difference it is about to book.

Confirming creates a **Balance Adjustment** Transaction for the difference, so
the correction reaches the Journal instead of appearing from nowhere. If
the two balances already agree, Kuber tells you so and books nothing.

## Edit, hide, exclude or delete an Account

The **⋯** menu on an Account row offers four actions.

**Edit** opens the same form, except the balance field is now labelled *Current
Balance*, and the button reads *Save Changes*. Changing the balance here does not
create an adjusting Transaction — that is what Reconcile is for.

**Hide account** keeps it out of the list and out of net worth, without losing
anything. Useful for a closed Account you still want history for.

**Exclude from net worth** leaves the Account visible and its Transactions in
reports, but stops it counting toward the total. This is the one to use for an
Account you administer but do not own.

**Delete** is a soft delete. The Account is hidden and excluded from every
report, and so is everything that hangs off it: its Transactions, recurring
items, investment holdings, lots and dividends. Nothing is erased from the
database, but there is no undelete in the UI. To recover one, restore from a
[backup](backup.md).

## Manual Assets and Manual Liabilities

Things with no Account behind them — a car, a house, a private loan — are Manual
Assets and Manual Liabilities, and live on the **Assets & Debt** tab of the
Accounts page.

Click **Add Asset** or **Add Liability**, give it a name and a current value, and
save. Both feed net worth alongside your Accounts, and the tab shows the split
between them.

Update these by hand whenever the value changes; nothing revalues them for you.

## Adding many Accounts at once

If you are migrating from another tool, **Import CSV** on the Accounts page takes
a CSV of Accounts rather than making you add them one at a time. The column list,
including `last_four`, is shown on that page and in the
[reference](../03-reference.md).

## Verify

- The Account is listed under the group matching its type.
- The Dashboard's net worth has moved by the amount you entered, in the right
  direction — up for an asset, down for a credit card or loan you entered
  negative.
- An Account you excluded from net worth appears in the list but does not move
  the total.
