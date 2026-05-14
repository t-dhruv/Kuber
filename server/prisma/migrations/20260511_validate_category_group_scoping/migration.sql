-- Validate that CategoryGroup and its Categories belong to same household
-- Create a trigger function that validates the relationship
CREATE OR REPLACE FUNCTION validate_category_group_scoping()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if category's householdId matches the group's householdId
  IF NEW."groupId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "category_groups" cg
      WHERE cg."id" = NEW."groupId"
        AND cg."householdId" = NEW."householdId"
    ) THEN
      RAISE EXCEPTION 'Category group must belong to the same household as the category';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on categories insert/update
DROP TRIGGER IF EXISTS validate_category_group_scoping_trigger ON "categories";
CREATE TRIGGER validate_category_group_scoping_trigger
BEFORE INSERT OR UPDATE ON "categories"
FOR EACH ROW
EXECUTE FUNCTION validate_category_group_scoping();

-- Similar validation for budgets with object_groups
CREATE OR REPLACE FUNCTION validate_object_group_scoping()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if entity's householdId matches the object group's householdId
  IF NEW."objectGroupId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "object_groups" og
      WHERE og."id" = NEW."objectGroupId"
        AND og."householdId" = NEW."householdId"
    ) THEN
      RAISE EXCEPTION 'Object group must belong to the same household as the entity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all entities that reference object_groups
DROP TRIGGER IF EXISTS validate_object_group_scoping_accounts_trigger ON "accounts";
CREATE TRIGGER validate_object_group_scoping_accounts_trigger
BEFORE INSERT OR UPDATE ON "accounts"
FOR EACH ROW
EXECUTE FUNCTION validate_object_group_scoping();

DROP TRIGGER IF EXISTS validate_object_group_scoping_categories_trigger ON "categories";
CREATE TRIGGER validate_object_group_scoping_categories_trigger
BEFORE INSERT OR UPDATE ON "categories"
FOR EACH ROW
EXECUTE FUNCTION validate_object_group_scoping();

DROP TRIGGER IF EXISTS validate_object_group_scoping_budgets_trigger ON "budgets";
CREATE TRIGGER validate_object_group_scoping_budgets_trigger
BEFORE INSERT OR UPDATE ON "budgets"
FOR EACH ROW
EXECUTE FUNCTION validate_object_group_scoping();
