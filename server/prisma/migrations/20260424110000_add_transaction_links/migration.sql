CREATE TABLE "transaction_link_types" (
  "id"      TEXT NOT NULL,
  "name"    TEXT NOT NULL,
  "inward"  TEXT NOT NULL,
  "outward" TEXT NOT NULL,
  CONSTRAINT "transaction_link_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transaction_link_types_name_key" ON "transaction_link_types"("name");

CREATE TABLE "transaction_links" (
  "id"          TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "linkTypeId"  TEXT NOT NULL,
  "fromId"      TEXT NOT NULL,
  "toId"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transaction_links_fromId_toId_linkTypeId_key"
  ON "transaction_links"("fromId", "toId", "linkTypeId");
CREATE INDEX "transaction_links_householdId_idx" ON "transaction_links"("householdId");

ALTER TABLE "transaction_links"
  ADD CONSTRAINT "transaction_links_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_links"
  ADD CONSTRAINT "transaction_links_linkTypeId_fkey"
  FOREIGN KEY ("linkTypeId") REFERENCES "transaction_link_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction_links"
  ADD CONSTRAINT "transaction_links_fromId_fkey"
  FOREIGN KEY ("fromId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_links"
  ADD CONSTRAINT "transaction_links_toId_fkey"
  FOREIGN KEY ("toId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 3 default link types
INSERT INTO "transaction_link_types" ("id", "name", "inward", "outward") VALUES
  ('ltype-repayment',  'repayment',   'is repaid by',    'repays'),
  ('ltype-relates',    'relates-to',  'relates to',      'relates to'),
  ('ltype-duplicates', 'duplicates',  'is duplicate of', 'duplicates');