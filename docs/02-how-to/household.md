# How-to: Manage Household Members

## Goal
Manage household members and roles for shared finances. Each person has their own login and 2FA.

---

## Household Owner

First person to register → becomes **household owner**.

Owner can:
- Create invite records and remove members
- View financial audit activity when the audit UI/API is available
- Manage household settings

---

## Invite Member

1. Click **Settings** → **Household**
2. Click **Invite Member**
3. Enter:
   - **Email:** invitee's email
   - **Role:** Member (or Admin)
4. Click **Send Invite**

Current limitation: Kuber records the invite request, but emailed invite-link redemption is not complete yet. Until that flow ships, operators should create users directly or manage membership through trusted administrative processes.

---

## Roles

| Role | Can Do |
|------|--------|
| **Owner** | Household settings, integrations, member removal, shared finance data |
| **Admin** | Household settings, integrations, invite records, shared finance data |
| **Member** | Shared finance data; household-wide settings are restricted |

---

## Remove Member

1. **Settings** → **Household**
2. Find member → click **Remove**
3. Confirm

Their txns stay (scoped to household). Account access removed.

---

## Household Data Scope

- All data scoped to **household ID**
- Members see same accounts, txns, budgets
- Personal txns: tag as "personal" or use separate category
- Audit log shows actions by all members

---

## Confirmation

- Invite request is accepted by the app
- Members listed in **Household** can log in and see shared household data

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Invite email not received** | Email invite delivery is not complete yet. Verify member access through your administrative process. |
| **Invite link expired** | Emailed invite links are planned future work. |
| **Member can't see data** | Ensure they're in same household. Check **Household** settings. |
| **Can't remove member** | Only owner can remove. Ask household owner. |
