# How-to: Track Investments

## Goal
Track holdings, see portfolio performance, monitor allocation.

---

## Add Investment Account

1. Click **Accounts** → **Add Account**
2. Type: **Investment**
3. Institution: "Fidelity", "Robinhood", etc.
4. Save

Then manage holdings under **Investments**.

---

## Add Holding

1. Click **Investments** in sidebar
2. Click **Add Holding**
3. Fill:
   - **Ticker:** "AAPL" (Apple)
   - **Shares:** `10`
   - **Cost Basis:** `1500` (what you paid)
   - **Account:** pick investment account
4. Click **Save**

Holding appears w/ current value.

---

## View Portfolio

Go to **Investments**:

- **Holdings table:** ticker, shares, current value
- **Allocation chart:** pie chart by ticker/sector
- **Performance:** total return (current vs cost basis)
- **Pending:** buys/sells not yet categorized

---

## Update Prices

Kuber can:
- **Auto-fetch** prices (if API configured)
- **Manual update:** click holding → edit → update current price

---

## Allocation Check

**Investments** page shows:
- By **ticker:** AAPL 30%, MSFT 25%, etc.
- By **sector:** Tech 50%, Healthcare 30%, etc.

Goal: diversify — no single holding >10%.

---

## Performance Tracking

- **Total Return:** (current value - cost basis) / cost basis
- **Dollar Gain/Loss:** current value - cost basis
- **Time-based:** view performance over months

---

## Confirmation

- Holding appears w/ correct shares + price
- Portfolio total = sum(shares × price)
- Allocation chart updates after adding holdings

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Price not updating** | Prices may be cached. Try manual update or wait for next auto-fetch. |
| **Wrong ticker** | Edit holding → correct ticker. Kuber fetches new price. |
| **Can't see performance** | Need at least 2 holdings over different dates to see trend. |
| **Allocation chart empty** | Ensure holdings have sector data. Add manually if auto-detect failed. |
