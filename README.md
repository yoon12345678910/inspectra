# Inspectra

Inspectra is a browser extension that injects Eruda into a live page and extends it with Inspectra-specific diagnostics through Eruda plugins.

Inspectra can also be shipped as a bookmarklet bundle for browsers that do not support extensions.

## Workspace

- `apps/extension`: WXT extension app
- `apps/bookmarklet`: bookmarklet entrypoint bundle
- `packages/agent-main`: main-world hooks for extra diagnostics
- `packages/eruda-runtime`: Eruda initialization, visibility toggle, and plugin registration
- `packages/eruda-plugin-media-permissions`: Eruda custom tab for camera/mic permission state
- `packages/eruda-plugin-webrtc`: Eruda custom tab for WebRTC state

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
- `pnpm build:bookmarklet`: build `dist/bookmarklet/inspectra-bookmarklet.js` and bookmarklet templates
- `pnpm zip`: generate the extension zip
- `pnpm test`: run the current test command
- `pnpm typecheck`: run workspace type checks

## Bookmarklet Hosting

GitHub Pages deployment is supported.

1. Enable `Settings -> Pages -> Source: GitHub Actions`
2. Push to `main`
3. The `pages-bookmarklet` workflow publishes `dist/bookmarklet`

Guide:

- [docs/bookmarklet.md](/Users/jongik/Documents/code/inspectra/docs/bookmarklet.md)

## Product Direction

- Baseline debugger UX: Eruda
- Injection model: extension action click, no app code changes
- Distribution modes: extension first, bookmarklet optional
- Inspectra value-add: Eruda wrapper runtime and plugin-based diagnostics
