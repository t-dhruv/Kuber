# How-to: Manage Household Members

## Goal
Manage household members and roles for shared finances. Each person has their own login and 2FA.

---

## Household Owner

First person to register → becomes **household owner**.

Owner can:
- Create and email invite links
- View financial audit activity when the audit UI/API is available
- Manage household settings
- Reset 2FA for non-owner members who are locked out

---

## Invite Member

1. Click **Settings** → **Household**
2. Click **Invite Member**
3. Enter:
   - **Email:** invitee's email
   - **Role:** Member (or Admin)
4. Click **Send Invite**

Kuber sends an invite link to the email address and shows a copyable signup link in Settings. The invited person must sign up with the same email address; expired or already used invite links are rejected.

---

## Roles

| Role | Can Do |
|------|--------|
| **Owner** | Household settings, integrations, member removal, shared finance data |
| **Admin** | Household settings, integrations, invite links, shared finance data |
| **Member** | Shared finance data; household-wide settings are restricted |

---

## Remove Member

1. **Settings** → **Household**
2. Find member → click **Remove**
3. Confirm

Their txns stay (scoped to household). Account access removed.

---

## Reset a Member's 2FA

1. **Settings** -> **Household**
2. Find a non-owner member with 2FA enabled
3. Click **Reset 2FA**
4. Confirm

The member can sign in with their password and set up 2FA again from Security settings.

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
| **Invite email not received** | Copy the invite link shown after sending, or verify email provider configuration. |
| **Invite link expired** | Send a new invite. |
| **Member can't see data** | Ensure they're in same household. Check **Household** settings. |
| **Can't remove member** | Only owner can remove. Ask household owner. |
| **Can't reset 2FA** | Only owner can reset another non-owner member's 2FA. |
