-- Fix object group scoping validation for budgets.
-- Budgets reference object_groups through "groupId"; accounts/categories use
-- "objectGroupId". The shared trigger must read the column that exists on the
-- table that fired it.
CREATE OR REPLACE FUNCTION validate_object_group_scoping()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'budgets' THEN
    IF NEW."groupId" IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM "object_groups" og
        WHERE og."id" = NEW."groupId"
          AND og."householdId" = NEW."householdId"
      ) THEN
        RAISE EXCEPTION 'Object group must belong to the same household as the budget';
      END IF;
    END IF;
  ELSE
    IF NEW."objectGroupId" IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM "object_groups" og
        WHERE og."id" = NEW."objectGroupId"
          AND og."householdId" = NEW."householdId"
      ) THEN
        RAISE EXCEPTION 'Object group must belong to the same household as the entity';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
