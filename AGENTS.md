@CLAUDE.md

## Project Coding Standards

- Keep changes small, behavior-preserving, and covered by focused regression tests before cleanup or refactor edits.
- Prefer deleting dead code and reusing existing helpers over adding new abstractions or dependencies.
- Split UI and route files when they mix data fetching, state orchestration, rendering, and low-level helpers; new feature files should stay narrowly scoped and easy to review.
- Treat files over roughly 500 lines as refactor candidates during nearby work; extract cohesive components, pure helpers, and typed API adapters instead of adding more inline code.
- Keep report and finance calculations in server-side pure functions with unit tests; UI components should consume stable response shapes and avoid duplicating business logic.
- Run affected tests plus lint, typecheck/build, and a dependency/security scan before claiming completion.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Kuber** (7201 symbols, 11603 relationships, 214 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Kuber/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Kuber/clusters` | All functional areas |
| `gitnexus://repo/Kuber/processes` | All execution flows |
| `gitnexus://repo/Kuber/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
