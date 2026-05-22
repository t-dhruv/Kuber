ALTER TABLE "users" ADD COLUMN "emailMfaEnabled" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "security_tokens_tokenHash_key";

CREATE INDEX "security_tokens_type_tokenHash_idx" ON "security_tokens"("type", "tokenHash");
