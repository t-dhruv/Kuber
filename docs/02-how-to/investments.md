# Tracking Investments

**Investments** in the sidebar, under Insights, tracks holdings at the lot level:
every buy and sell you record is kept as its own lot, so cost basis is computed
from what you actually paid rather than an average you maintain by hand.

Kuber connects to no brokerage. You record the trades; Kuber does the
arithmetic.

## Add a holding

Click **Add Holding** and fill in:

- **Ticker Symbol**
- **Security Name**
- **Shares** — how many you hold now.
- **Purchase Price per Share** — what you paid.
- **Account (optional)** — link it to an investment Account so the holding rolls
  into that Account's value and into net worth.

This creates the holding and its first lot.

## Record buys, sells and dividends

Open a holding and add a transaction to it. The modal is titled **Add Transaction
— TICKER** and takes:

- **↑ Buy** or **↓ Sell**
- **Date**
- **Shares**
- **Price per Share**
- **Note (optional)**

Each entry becomes a lot in the **Transaction Lots** table, showing date, type,
shares, price per share and amount.

Once the holding has any sell, two more columns appear: **ACB/sh**, the adjusted
cost base per share, and **Realized Gain** on that disposal. This is why lots
matter — selling part of a position needs to know what those particular shares
cost.

Dividends are recorded against the holding too, and appear in the lots table with
the amount received rather than a share count. Totals for **Dividends Received**
and estimated annual dividend income show at the top of the page when there is
anything to show.

## Recurring buys

A holding you contribute to on a schedule can carry a **Recurring Buys** plan —
an amount, a frequency, and a day of the month. Like [recurring
bills](recurring.md), this is a plan rather than something that creates lots on
its own.

Contributions awaiting confirmation appear as pending lots at the top of the page
until you confirm them, so nothing enters your cost basis without you agreeing to
it.

## Allocation

The **Allocation** tab breaks the portfolio down by weight, so you can see
concentration you did not intend.

## A note on performance figures

Kuber reports what it can compute reliably: current value, cost basis, unrealised
and realised gains, and dividends recorded. It does **not** publish
time-weighted or money-weighted rates of return, and the investment report says
so where you might expect one.

That is deliberate. Those figures depend on a complete, correctly dated record of
every contribution and withdrawal, and Kuber cannot verify it has one when the
data is entered by hand. A return number that silently assumes complete data is
worse than no number.

## Delete a lot

Each lot row has a delete control. Deleting a lot changes cost basis and every
gain computed from it — including realised gains on sells that referenced those
shares. Check the resulting figures afterwards.

## Verify

- The holding lists with your share count and current value.
- Its lots table shows one row per trade, in date order.
- Cost basis matches what you paid across the buys you entered.
- If the holding is linked to an Account, its value is reflected in net worth on
  the Dashboard.
