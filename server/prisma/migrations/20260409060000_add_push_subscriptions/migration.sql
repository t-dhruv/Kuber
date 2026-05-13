CREATE TABLE "push_subscriptions" (
  "id"          TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "endpoint"    TEXT NOT NULL,
  "p256dh"      TEXT NOT NULL,
  "auth"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_householdId_idx" ON "push_subscriptions"("householdId");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
