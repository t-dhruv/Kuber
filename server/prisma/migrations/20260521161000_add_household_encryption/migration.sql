CREATE TABLE "household_encryption_keys" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "household_encryption_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_wrapped_keys" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wrappedKey" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "household_wrapped_keys_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "accounts" ADD COLUMN "nameEncrypted" JSONB;
ALTER TABLE "accounts" ADD COLUMN "institutionEncrypted" JSONB;

CREATE UNIQUE INDEX "household_encryption_keys_householdId_version_key" ON "household_encryption_keys"("householdId", "version");
CREATE INDEX "household_encryption_keys_householdId_status_idx" ON "household_encryption_keys"("householdId", "status");
CREATE UNIQUE INDEX "household_wrapped_keys_keyId_userId_key" ON "household_wrapped_keys"("keyId", "userId");
CREATE INDEX "household_wrapped_keys_userId_idx" ON "household_wrapped_keys"("userId");

ALTER TABLE "household_encryption_keys" ADD CONSTRAINT "household_encryption_keys_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_wrapped_keys" ADD CONSTRAINT "household_wrapped_keys_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "household_encryption_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_wrapped_keys" ADD CONSTRAINT "household_wrapped_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
