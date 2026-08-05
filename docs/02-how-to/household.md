# Managing your Household

A Household is Kuber's data-isolation boundary. Every Account, Transaction,
Budget and Goal belongs to exactly one Household, and no query crosses between
them.

Each person has their own User — their own credentials and their own
[MFA](2fa.md) — and Users in the same Household see the same books.

Manage this under **Settings → Household**.

## One User, one Household

**A User belongs to exactly one Household.** This is enforced by a database
constraint, not merely by convention, and it is worth knowing before you plan
how to use your Instance.

There is no Household switcher, and adding somebody who already has a User in
another Household is not possible — see [ADR-0004](../adr/0004-a-user-belongs-to-exactly-one-household.md)
for why. If you need genuinely separate books, run a second Instance.

## Household settings

The top of the page holds **Household Name** and **Currency**. The currency is
the default for new Accounts; individual Accounts can differ.

## Invite someone

In **Invite Member**, enter their **Email** and choose a **Role**, then send.

Kuber shows the invite link on screen after creating it, with **Copy link**. That
matters on a self-hosted Instance with no email provider configured: the
invitation email cannot be delivered, so passing that link along by hand is how
the invite actually reaches them. Invites expire after seven days.

The invitee signs up through the link and joins your Household directly.

### "That user already belongs to a household"

An invite to an address that already has a User anywhere on the Instance is
rejected with:

> That user already belongs to a household. A user can belong to only one
> household.

The message is the same whether they are already in *your* Household or someone
else's — deliberately, so that inviting an address cannot be used to discover
who else has a User on the Instance.

The rejection happens when the invite is created, rather than producing a link
that would fail at signup with nothing the invitee could do about it.

## Roles

A Member's role decides what they can change. The invite form offers two of the
three; the Owner role belongs to whoever created the Household.

- **Owner** — everything below, plus the two destructive controls: removing a
  Member and resetting another Member's MFA. An Owner cannot remove themselves.
- **Admin** — can invite further Users, but cannot remove Members or reset
  anyone's MFA.
- **Member** — full access to the Household's financial records, with no
  administrative powers.

All three see all of the Household's money. The distinction is administrative,
not privacy between partners.

## Reset a Member's MFA

If a Member is locked out of their authenticator and has no backup codes, an
Owner can clear it: **Reset 2FA** on their row, then confirm. Only an Owner can
do this — an Admin cannot.

This disables their second factor so they can sign in with their password alone,
and they should set it up again immediately. The control does not appear for
Owners, and you cannot reset your own this way — use **Settings → Security** for
that. Which is why an Owner's backup codes matter more than anyone's.

## Remove a Member

**Remove** on their row, then confirm. Only an Owner can remove Members, the
control does not appear for Owners, and an Owner cannot remove themselves.

Removing a Member revokes their access. The financial records they created belong
to the Household and stay.

## Who can sign up

Registration on a fresh Instance is open until the first Household exists, then
closes automatically — so exposing your Instance to the internet does not let
strangers register on it. Invited signup keeps working regardless.

To deliberately reopen open registration, set `ALLOW_SIGNUP=true`. To close it
even on an empty Instance, set `ALLOW_SIGNUP=false`. See the
[reference](../03-reference.md).

## Verify

- The Member appears in the list with the role you gave them.
- They can sign in and see the same Accounts and Transactions you do.
- Inviting an address that already has a User is rejected with the message above.
- After a 2FA reset, that Member signs in with their password alone.
