# How-to: Manage Household Members

## Goal
Invite family members to share finances. Each person has own login + 2FA.

---

## Household Owner

First person to register → becomes **household owner**.

Owner can:
- Invite/remove members
- View audit log
- Manage household settings

---

## Invite Member

1. Click **Settings** → **Household**
2. Click **Invite Member**
3. Enter:
   - **Email:** invitee's email
   - **Role:** Member (or Admin)
4. Click **Send Invite**

Invitee gets email → clicks link → creates account → joins household.

---

## Roles

| Role | Can Do |
|------|--------|
| **Owner** | Everything + invite/remove members, view audit log |
| **Admin** | Manage accounts, txns, budgets + invite members |
| **Member** | View + edit own txns, view shared accounts |

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

- New member appears in **Household** list
- They can log in + see shared accounts
- Audit log shows invite + join events

## Troubleshooting

| Problem | Solution |
|----------|----------|
| **Invite email not received** | Check spam. Resend from **Household** settings. SMTP must be configured. |
| **Invite link expired** | Send new invite. Links expire after 7 days. |
| **Member can't see data** | Ensure they're in same household. Check **Household** settings. |
| **Can't remove member** | Only owner can remove. Ask household owner. |
