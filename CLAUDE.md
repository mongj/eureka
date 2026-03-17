# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm build                          # Build all packages
pnpm test                           # Run all tests
pnpm lint                           # Lint with oxlint
pnpm format                         # Format with oxfmt

# Per-package
pnpm --filter @eureka/core build
pnpm --filter @eureka/core test
pnpm --filter @eureka/agent test
pnpm --filter @eureka/ai test

# Single test file
pnpm --filter @eureka/core exec vitest run test/cli.test.ts

# Run CLI (after build)
pnpm --filter @eureka/core cli -- "show a rotating cube"
```

## Workflow

- After every change, always run pnpm lint and fix any errors

## Tooling Preferences

- **pnpm** (not npm/yarn)
- **oxlint + oxfmt** (not eslint/prettier/biome)
- Node >= 20
- TypeScript strict mode, ES2022 target, ESM (`"type": "module"`)
