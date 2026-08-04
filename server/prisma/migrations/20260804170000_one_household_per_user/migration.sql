-- ADR-0004: a User belongs to exactly one Household.
--
-- The join table already carried a unique on (userId, householdId), which
-- permitted a User to hold memberships in several Households. No code ever
-- supported that: every auth path resolved the session's Household as the first
-- membership row, unordered, so such a User would land in an arbitrary Household
-- and not reliably the same one twice running.

-- Any row beyond the first is unreachable data — it was never selectable by
-- login, only capable of displacing the row that was. Keep the earliest
-- membership per User, which is the one an unordered scan most often returned,
-- and drop the rest. Financial records belong to the Household, not to this
-- table, so nothing here removes books; it removes an ambiguity about which
-- books a User opens.
DELETE FROM "household_members" a
USING "household_members" b
WHERE a."userId" = b."userId"
  AND (b."joinedAt", b."id") < (a."joinedAt", a."id");

CREATE UNIQUE INDEX "household_members_userId_key" ON "household_members"("userId");
