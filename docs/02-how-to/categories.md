# Categories, Buckets and Rules

A Category classifies a Transaction. Its **type** — income, expense or transfer —
is the single source of truth for how every report treats it, so a Category typed
wrongly will quietly distort your totals.

Its **Bucket** is a second, independent assignment: needs, wants or savings.
Buckets drive the 50/30/20 view and nothing else. A Category has both.

Manage all of this under **Settings → Categories**.

## Add a Category

Click **Add Category** and fill in:

- **Name** — for example "Groceries".
- **Emoji** — optional, and worth setting: the Category pickers elsewhere show it,
  which makes a long list far quicker to scan.
- **Group** — the heading it sits under in lists.
- **Type** — income, expense or transfer. Get this right.

Add Categories here before you need them. The Category picker on the Transaction
form only searches existing Categories — it will not create one for you.

## Organise Categories into groups

Groups are just headings for the Category list. Add one with the **New group
name…** field. Deleting a group does not delete the Categories inside it.

## Change type, Bucket, or flags

Each Category row carries four controls, all toggled by clicking them directly:

- **Type** — click the type badge to change it. Tooltip: *Click to change type*.
- **Bucket** — click the Bucket badge to change it between Needs, Wants and
  Savings.
- **Tax deductible** — flags the Category for tax reporting.
- **Exclude from reports** — keeps its Transactions out of reports entirely.

### Resetting Buckets

Kuber assigns a Bucket to each Category by inference from its name — rent,
insurance and utilities land in Needs, and anything unrecognised defaults to
Wants. Resetting returns every Category to that inferred default, discarding
your changes. Use it after a bulk import, not to fix one Category.

## Categorise automatically with Rules

A Rule is a stored condition that categorises matching Transactions for you. Go
to **Rules** in the sidebar, under Automation, and click **New Rule**.

**When…** — one or more conditions. Each is a field, an operator, and a value:

| Field | Operators |
|---|---|
| Merchant name, Description | contains, equals, starts with, ends with |
| Amount | is greater than, is less than, is ≥, is ≤, equals |

Add conditions to narrow a Rule. "Merchant name contains AMZN" *and* "Amount is
greater than 100" matches only the large orders.

**Then…** — one or more actions:

- **Set category**
- **Add tag**
- **Hide transaction**
- **Mark as reviewed**

Leave **Rule name** blank and Kuber names the Rule after what it does.

### Applying a Rule to Transactions you already have

New Rules apply to Transactions recorded from then on. To reach existing ones:

- **Apply** on a single Rule row runs just that Rule across your history.
- **Apply all** runs every Rule.

Both ask for confirmation first, because both rewrite existing records in bulk
and neither is undoable in one step.

## Verify

- The Category shows the type and Bucket you set.
- A new Transaction matching a Rule's conditions arrives already categorised.
- **Budget** shows spending against the Category.
- The 50/30/20 split on **Wealth** reflects the Buckets you assigned.
