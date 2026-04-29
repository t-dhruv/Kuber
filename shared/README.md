# Shared Types & DTOs

This folder contains core TypeScript types that are shared across client and server code in Kuber.

- shared/src/types.ts: core enums and mortgage-related types
- shared/src/dtos.ts: Data Transfer Object interfaces used across API boundaries
- shared/src/validators.ts: lightweight runtime guards for DTO shapes (non-invasive)

Pattern: use the barrel export from shared/src/index.ts to import these across the codebase.
