# A User belongs to exactly one Household

`HouseholdMember` is a join table with `@@unique([userId, householdId])`, so the schema
modelled Users and Households as many-to-many. Every auth path contradicted it: five
sites in `auth.ts` resolved the session's Household as `user.householdMembers[0]`, with
no `orderBy` and no household switcher anywhere in the client or server. A User in two
Households would land in an arbitrary one, not necessarily the same one across logins —
in a finance app, that means opening the books and seeing someone else's numbers.

The code's assumption becomes the truth. A User belongs to exactly one Household: invites
are rejected for Users who already hold a membership, and a database constraint enforces
at most one `HouseholdMember` per User.

## Considered options

Building a real household switcher was the alternative. It would honour the schema, but
it touches auth, the JWT payload, and every household-scoped query — significant scope
for a capability that matches no real use case we have, since people belong to one
household.

## Consequences

The join table is retained rather than collapsed into a column, so multi-household support
stays reachable later without a destructive migration. Anyone reading the schema will
assume many-to-many is supported; it is not, and the constraint is what enforces that.
