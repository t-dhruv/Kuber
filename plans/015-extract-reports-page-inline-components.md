# Plan 015: Extract ReportsPage inline components into separate files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- client/src/pages/reports/ReportsPage.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: none (can be done independently, before or after other plans)
- **Category**: refactor
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

`ReportsPage.tsx` is 1092 lines — a god component mixing page routing, data
fetching, filter state management, and 4+ inline component definitions:

1. **SearchableMultiSelect** (~280 lines) — a multi-select dropdown with search
   filtering, used for category/tag/account selection filters
2. **ToggleField** (~40 lines) — a switch/toggle for boolean report filters
3. **NativeSelect** (~50 lines) — styled `<select>` wrapper
4. **FilterField** (~40 lines) — label + children wrapper

Extracting these into dedicated files reduces the page to ~700 lines, enables
individual testing, and makes the components reusable across other pages.
This aligns with the project's modularity rules (treat files over 400 lines as
extraction candidates, 700+ as technical debt).

## Current state

### Inline components in ReportsPage.tsx

#### SearchableMultiSelect (approx lines 50-330)
Full multi-select with dropdown, search input, selected items display, and
"select all" toggle. Exists as a local `const` or `function` declaration.
Props include at minimum: `options`, `selectedValues`, `onChange`, `label`.

#### ToggleField (approx lines 345-385)
Small wrapper around `<label><input type="checkbox"> <span>` or styled toggle.
Props: `label`, `checked`, `onChange`.

#### NativeSelect (approx lines 390-440)
Styled `<select>` element with label.
Props: `label`, `value`, `onChange`, `options`.

#### FilterField (approx lines 445-485)
Layout wrapper: `<div><label>{label}</label><children></div>`.

### Page structure
After extraction, the page file still owns:
- Page routing (tab switching / legacy tab logic)
- `useQuery` calls for report data
- Filter state (`useState`/`useReducer`)
- Layout/arrangement of filter controls
- Rendering of StandardReportPanel with filter state

### Existing ui components
`client/src/components/ui/` contains reusable primitives. Before extracting,
check if any existing ui component already covers the function of ToggleField
or NativeSelect. If so, use it directly instead of extracting.

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Build     | `npm run build --workspace=@kuber/client`  | exit 0              |
| Tests     | `npm run test --workspace=@kuber/client`   | all pass            |
| Lint      | `npm run lint --workspace=@kuber/client`   | exit 0              |

## Scope

**In scope**:
- `client/src/pages/reports/ReportsPage.tsx` — remove inline component definitions
- `client/src/components/reports/SearchableMultiSelect.tsx` — create
- `client/src/components/reports/ToggleField.tsx` — create
- `client/src/components/reports/NativeSelect.tsx` — create
- `client/src/components/reports/FilterField.tsx` — create
- `client/src/components/reports/index.ts` — barrel export (create)
- `client/src/pages/reports/reportsPageComponents.ts` — or put FilterField here
  if it is too trivial for its own file

**Out of scope**:
- No behavioral changes — pure extract-and-import refactor
- No renaming of props or types (keep exact same interfaces)
- No integration with ui primitives (can be a follow-up)
- No changes to StandardReportPanel or server code

**May be out of scope** (check during extraction):
- If SearchableMultiSelect uses inline styles or hardcoded colors, leave as-is
  (Design system color migration is a separate effort)

## Git workflow

- Branch: `advisor/015-extract-report-page-components`
- Commit message style: `refactor: extract ReportsPage inline components to src/components/reports`

## Steps

### Step 1: Check existing ui components for overlap

Run: `ls client/src/components/ui/*.tsx client/src/components/ui/*.ts`
Check if any existing component (Select, MultiSelect, Toggle, Switch, Checkbox,
Field) already provides the same API as the inline components. If found, prefer
that existing component instead of extracting.

### Step 2: Create extracted component files

For each of the 4 inline components in ReportsPage.tsx:

1. Copy the full component definition (function + types + styling) into a new
   file at `client/src/components/reports/<ComponentName>.tsx`
2. Make sure props types are exported
3. Keep ALL imports self-contained (React, any hooks, any UI dependencies)
4. Keep ALL styling exactly as-is (tailwind classes, inline styles, etc.)

#### Example structure for SearchableMultiSelect.tsx:

```tsx
// client/src/components/reports/SearchableMultiSelect.tsx
import { useState, useMemo } from "react";

export interface SearchableMultiSelectOption {
  value: string;
  label: string;
}

export interface SearchableMultiSelectProps {
  label: string;
  options: SearchableMultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function SearchableMultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  placeholder,
}: SearchableMultiSelectProps) {
  // ... paste the exact content from ReportsPage.tsx, adjusting
  // imports and removing references to ReportsPage scope
}
```

**Critical**: Preserve the exact rendering, states, and styling. This is a
pure extraction, not a rewrite.

### Step 3: Create barrel export

Create `client/src/components/reports/index.ts`:

```ts
export { SearchableMultiSelect } from "./SearchableMultiSelect";
export type { SearchableMultiSelectOption, SearchableMultiSelectProps } from "./SearchableMultiSelect";
export { ToggleField } from "./ToggleField";
export type { ToggleFieldProps } from "./ToggleField";
export { NativeSelect } from "./NativeSelect";
export type { NativeSelectOption, NativeSelectProps } from "./NativeSelect";
export { FilterField } from "./FilterField";
export type { FilterFieldProps } from "./FilterField";
```

### Step 4: Replace in ReportsPage.tsx

1. Remove the inline function/const definitions for all 4 components
2. Add import: `import { SearchableMultiSelect, ToggleField, NativeSelect, FilterField } from "../../components/reports";`
3. Adjust prop types — if the inline definitions used inline type annotations,
   import the extracted types
4. Keep the rest of ReportsPage.tsx exactly the same

### Step 5: Verify

```bash
npm run build --workspace=@kuber/client
npm run test --workspace=@kuber/client
npm run lint --workspace=@kuber/client
```

All exit 0.

### Step 6: Audit for other consumers

Search for any other files that might depend on these inline components (they
were defined inside ReportsPage, so no other file should import them). Run:
```bash
grep -rn "SearchableMultiSelect\|ToggleField\|NativeSelect\|FilterField" client/src/
```

Only the new component files and the imports in ReportsPage.tsx should appear.

## Test plan

- Existing tests pass (no new functionality)
- Manual: reports page loads and all filter controls work identically

## Verification checklist

- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] `npm run lint --workspace=@kuber/client` exits 0
- [ ] ReportsPage.tsx is at least 300 lines shorter
- [ ] All 4 components exist in `client/src/components/reports/`
- [ ] ReportsPage still renders and functions identically
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Any extracted component references a closure variable from ReportsPage
  (e.g. a state setter or callback defined outside the component). This would
  mean the component is not truly self-contained — it needs a prop interface
  change before extraction.
- The component count or structure in ReportsPage differs significantly from
  the 4 listed above (if there are more/other inline components).
- Moving the component reveals circular import or type dependency issues.

## Maintenance notes

- After extraction, each component can be unit-tested independently.
- SearchableMultiSelect (~280 lines) is the most complex extraction; it may
  contain sub-components that could be further extracted (e.g., SearchInput,
  DropdownPanel). Do not do that in this plan.
- FilterField is trivial; consider inlining it as a styled `<div>` wrapper
  inside ReportsPage or a shared ui component on a future pass.
