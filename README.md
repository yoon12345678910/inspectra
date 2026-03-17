# Inspectra

Inspectra is an overlay debugger browser extension for live pages. The first implementation target is a Chrome/Edge Desktop MVP with a React + TypeScript + WXT workspace.

## Workspace

- `apps/extension`: WXT extension app
- `packages/core`: shared event, settings, redaction, and export logic
- `packages/bridge`: page/content bridge protocol
- `packages/agent-main`: main-world hooks
- `packages/ui-overlay`: overlay React UI and store
- `packages/adapter-chromium`: Chromium deep-mode skeleton

## Getting Started

1. Use Corepack so the repo runs with a recent pnpm:
   - `corepack enable`
   - `corepack prepare pnpm@10.32.0 --activate`
2. Install dependencies:
   - `pnpm install`
3. Start extension development:
   - `pnpm dev`

## Commands

- `pnpm dev`: run the WXT extension in dev mode
- `pnpm build`: build the extension
- `pnpm zip`: generate the extension zip
- `pnpm test`: run unit tests
- `pnpm typecheck`: run workspace type checks

