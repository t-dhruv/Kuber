CREATE TABLE "webhooks" (
  "id"          TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "events"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "secret"      TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhooks_householdId_idx" ON "webhooks"("householdId");

ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
