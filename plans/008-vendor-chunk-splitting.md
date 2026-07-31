# Plan 008: Split large vendor chunks in Vite build

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 28cf4a0..HEAD -- client/vite.config.ts` — if in-scope file changed, compare excerpts against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `28cf4a0`, 2026-06-19

## Why this matters

The client build produces 4 chunks over 300KB each (main: 822KB, another: 636KB, recharts: 410KB, emoji-picker: 310KB). This delays first-page load on all devices — 2.1MB uncompressed / ~650KB gzipped JS before the app is interactive. Without manual chunk splitting, `recharts` (heavy charting library used on 3 pages) and `emoji-picker-react` (used only in Settings → Categories) are bundled into general chunks that every page loads.

## Current state

`client/vite.config.ts` — no `manualChunks` or `rollupOptions.output` configuration for code splitting.

Auditor.md notes this has been an existing warning across 8+ audit entries with no action taken.

## Scope

**In scope**:
- `client/vite.config.ts` — add `manualChunks` config

**Out of scope**:
- Route-level code splitting (already done via React Router lazy imports)
- Removing or replacing `emoji-picker-react` or `recharts`
- `IconPicker` lazy loading pattern (add as follow-up)

## Steps

### Step 1: Add manualChunks to Vite config

In `client/vite.config.ts`, add `build.rollupOptions.output.manualChunks`:

```ts
export default defineConfig({
  plugins: [...],
  resolve: { alias: { "@": "/src" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          'emoji-picker': ['emoji-picker-react'],
        },
      },
    },
  },
  server: { ... },
});
```

This splits `recharts` and `emoji-picker-react` into separate vendor chunks that are only loaded when those imports are actually used. Both are already lazy-imported by the React Router setup.

### Step 2: Build and verify

```bash
npm run build --workspace=@kuber/client
```

Look for the chunk size output at the end. The main app chunk should be smaller (the 822KB chunk should drop by ~400KB). The new `recharts` and `emoji-picker` chunks should appear as separate entries, each loaded only when the respective pages are visited.

### Step 3: Run client tests

```bash
npm run test --workspace=@kuber/client
```

All pass.

### Step 4: Lint

```bash
npm run lint --workspace=@kuber/client
```

## Test plan

- No new tests. Build output size change is the verification.
- Test `npm run test --workspace=@kuber/client` ensures no import resolution issues.

## Done criteria

- [ ] `npm run build --workspace=@kuber/client` exits 0
- [ ] Build output shows `recharts` and `emoji-picker` as separate chunks (check `dist/assets/` listing)
- [ ] The main JS chunk is visibly smaller (compare 822KB baseline — should drop to ~500KB range)
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] `npm run lint --workspace=@kuber/client` exits 0
- [ ] `plans/README.md` status updated

## STOP conditions

- If a React error occurs at runtime related to chunk loading (unlikely with manualChunks on these deps), verify the chunk names don't conflict with route-based dynamic imports.
- If build fails, check if the Vite version supports the `manualChunks` syntax (Vite 7 does).

## Maintenance notes

- When adding new heavy dependencies, add them to `manualChunks`.
- Monitor the build output after each dependency update.
- The `IconPicker` component that imports `emoji-picker-react` is used in `CategoriesSection` — consider lazy-loading `IconPicker` with `React.lazy()` as a follow-up.
