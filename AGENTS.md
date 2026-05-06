@CLAUDE.md

## Project Coding Standards

- Keep changes small, behavior-preserving, and covered by focused regression tests before cleanup or refactor edits.
- Prefer deleting dead code and reusing existing helpers over adding new abstractions or dependencies.
- Split UI and route files when they mix data fetching, state orchestration, rendering, and low-level helpers; new feature files should stay narrowly scoped and easy to review.
- Treat files over roughly 500 lines as refactor candidates during nearby work; extract cohesive components, pure helpers, and typed API adapters instead of adding more inline code.
- Keep report and finance calculations in server-side pure functions with unit tests; UI components should consume stable response shapes and avoid duplicating business logic.
- Run affected tests plus lint, typecheck/build, and a dependency/security scan before claiming completion.
