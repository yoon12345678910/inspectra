# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Inspectra** is a web inspector that injects [Eruda](https://github.com/liriliri/eruda) into live pages with custom diagnostic plugins. Distributed as a browser extension (desktop), bookmarklet, and SDK/library (mobile).

## Commands

```bash
# Setup (first time)
corepack enable && corepack prepare pnpm@10.32.0 --activate
pnpm install

# Development
pnpm dev               # WXT dev server with hot reload
pnpm typecheck         # Type check across workspace (also serves as lint)

# Build & Distribution
pnpm build             # Build extension for production
pnpm zip               # Package extension as .zip
pnpm build:bookmarklet # Build bookmarklet IIFE bundle (reads .env)

# Relay Server (remote debugging)
pnpm relay             # Start Node.js relay on ws://localhost:9229

# Testing
pnpm test              # Run all tests (vitest)
pnpm test:watch        # Watch mode
```

To load the extension in Chrome during development: Extensions → Load unpacked → `apps/extension/.output/chrome-mv3/`

## Architecture

### Monorepo Layout
- `apps/extension/` — WXT-based browser extension (desktop)
- `apps/bookmarklet/` — Bookmarklet entrypoint (uses SDK)
- `apps/relay/` — WebSocket relay server for remote debugging (Node.js + Deno Deploy)
- `packages/sdk/` — SDK package: `Inspectra.init()` API with optional relay support
- `packages/agent-main/` — Main-world hooks for event capture (WebRTC, media, WebSocket). Uses `window.__INSPECTRA_AGENT__` global singleton to prevent double-instance bugs across bundles.
- `packages/eruda-runtime/` — Eruda initialization, plugin registration, visibility management
- `packages/eruda-plugin-websocket/` — WebSocket diagnostics plugin
- `packages/eruda-plugin-webrtc/` — WebRTC diagnostics plugin
- `packages/eruda-plugin-media-permissions/` — Camera/mic permission tracking plugin

### Extension Worlds & Data Flow

The extension runs code in three distinct contexts that communicate via messages:

```
User clicks action
    ↓
background.ts (Service Worker)
  → attaches Chrome debugger API → captures WebSocket frames at network level
  → sends events to overlay via browser.tabs.sendMessage
    ↓
overlay.content.tsx (Isolated World Content Script)
  → injects main-world.js into page
  → relays debugger events to Eruda runtime via window.postMessage
    ↓
main-world.ts + agent.content.ts (Main World)
  → bootstraps Eruda runtime + plugins
  → bootstraps agent hooks (WebRTC, media, page-level WebSocket)
```

**Key point:** `overlay.content.tsx` bridges the isolated world (access to browser APIs) and the main world (access to page globals like `RTCPeerConnection`). State is shared via `window.__INSPECTRA_ERUDA_STATE__`.

### Communication Protocol

All cross-world messages use `postToInspectraRuntime()` with typed payloads defined in `packages/eruda-runtime/src/protocol.ts`:
- `agent:bootstrap` — agent signals Eruda runtime it's ready
- `overlay:set-visible` — toggle Eruda visibility
- `websocket:debugger-event` — WebSocket frame from Chrome debugger
- `websocket:debugger-status` — debugger attach/detach status

### WebSocket Capture Strategy

Dual-source capture in `eruda-plugin-websocket`:
1. **Chrome debugger API** (`Network.webSocket*` events) — trusted source, captured in background.ts
2. **Page-level hooks** — complementary, less reliable

The debugger API requires `debugger` + `scripting` permissions and `<all_urls>` host permissions (defined in `apps/extension/wxt.config.ts`).

### Plugin Pattern

Each `eruda-plugin-*` package exports a class that extends Eruda's plugin interface. Plugins receive events from `agent-main` (via shared state) and from debugger relay (via postMessage). Agent-main uses a ring buffer of max 200 events per event type to bound memory usage.

### SDK & Remote Debugging

`packages/sdk` provides `Inspectra.init(options)` for script tag / npm usage:
```typescript
Inspectra.init({ relay: 'ws://localhost:9229', room: 'my-project' });
```
- Bootstraps hooks + Eruda (CDN) in one call
- Optional relay connection for remote debugging (auto-reconnect with exponential backoff)
- `agent-main` fires `onEvent` callback → SDK forwards to relay → relay broadcasts to other clients in the same room

`apps/relay` has two versions: `src/node.ts` (ws package, local dev) and `src/deno.ts` (Deno Deploy, zero deps).

### Environment Variables

`.env` at root (optional, see `.env.example`):
- `INSPECTRA_RELAY_URL` — injected into bookmarklet at build time via esbuild `define`
- `INSPECTRA_RELAY_ROOM` — room name for relay grouping
- `INSPECTRA_BOOKMARKLET_URL` — bookmarklet hosting URL

## Key Technologies

| Tool | Version | Purpose |
|------|---------|---------|
| WXT | 0.20.x | Extension framework (Vite-based) |
| Eruda | 3.4.x | Base debugger UI |
| TypeScript | 5.8.x | Language (ES2022 target, strict) |
| pnpm | 10.32.0 | Package manager (enforced via corepack) |
| Vitest | 3.x | Tests (Node environment) |
| esbuild | — | Bookmarklet bundling (IIFE, minified) |

## Development Policies (from AGENTS.md)

- Feature documentation goes in `docs/features/...` **before** implementation. Required: `README.md`, `tasks.md`, and `decision-log.md` for any reversible architectural decisions.
- Docs override code when they conflict — update docs first.
- Keep the workspace small: no new apps or packages beyond `apps/extension` and `packages/*` without explicit justification.
- Primary target: Chrome/Edge desktop debugging UX.

## CI/CD

- **ci.yml**: Runs typecheck → test → build on PR and push to main (Node 22, pnpm 10.32.0)
- **pages-bookmarklet.yml**: Deploys bookmarklet to GitHub Pages on main push
