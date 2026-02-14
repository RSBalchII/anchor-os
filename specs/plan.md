# Anchor OS — Implementation Plan

> Last revised: February 2026

## Current State

Anchor OS is a fully functional sovereign knowledge engine with:
- 4 running services (Engine, Inference Server, Nanobot, UI)
- 32+ API endpoints with auth and validation
- Physics-based search (Tag-Walker / Universal Semantic Search)
- Atomic knowledge decomposition with NLP tagging
- Multi-channel agent framework (Discord, Telegram, WhatsApp, etc.)
- Local LLM inference with GGUF models
- Electron desktop overlay

The project has pivoted from its original roadmap (code intelligence + horizontal scaling) to a **personal sovereign knowledge engine** — and has shipped significantly more than originally planned in the search, memory, and agent domains.

---

## Phase 1: Hardening (Q1 2026)

**Goal**: Make the existing system production-ready and secure.

> [!IMPORTANT]
> Security and stability must come before new features. Several known bugs affect daily use.

### Proposed Changes

#### Security (`packages/*/middleware/`)
| Action | File | Description |
|---|---|---|
| DONE | `*/middleware/auth.{js,ts}` | API key auth on all `/v1` routes |
| DONE | `*/middleware/validate.{js,ts}` | Request body validation on POST endpoints |
| NEW | `packages/nanobot-node/tools/` | Replace tool deny-list with explicit allowlist |
| MODIFY | `packages/inference-server/server.js` | Add path traversal check on model load |
| NEW | All services | Rate limiting middleware (express-rate-limit) |

#### Bug Fixes
| Action | File | Description |
|---|---|---|
| DONE | `packages/nanobot-node/memory/memory.js` | Implement missing `getRecentMemories`, `searchMemories`, `clearMemory` |
| DONE | `packages/nanobot-node/core/inference-worker.js` | Add `unloadModel` message handler |
| MODIFY | `packages/nanobot-node/server.js` | Preserve chat session across requests instead of recreating |
| MODIFY | `packages/inference-server/engines/EngineManager.js` | Fix `switchEngine()` — `from` field not passed correctly |
| MODIFY | `packages/inference-server/engines/MNNEngine.js` | Add request ID tracking for concurrent requests |
| MODIFY | `set-env-vars.js` | Fix environment variable propagation |
| MODIFY | `start.bat` | Replace hardcoded paths with relative paths |

#### Testing
| Action | File | Description |
|---|---|---|
| DONE | `packages/anchor-engine/engine/tests/` | 10-section integration test suite (38+ files) |
| DONE | `packages/nanobot-node/tests/` | Fixed test imports and assertions |
| NEW | `packages/inference-server/tests/` | Model lifecycle + chat completions tests |
| NEW | `packages/anchor-ui/tests/` | Vitest + React Testing Library component tests |
| NEW | `scripts/smoke-test.sh` | Multi-service startup validation |

### Verification Plan
- [ ] All services start without errors via `start.bat` / `start.sh`
- [ ] Auth middleware rejects requests without valid API key
- [ ] Validation middleware rejects malformed POST bodies
- [ ] All existing engine tests pass
- [ ] Nanobot memory tests pass
- [ ] New inference-server tests pass

---

## Phase 2: Intelligence & UX (Q2 2026)

**Goal**: Deeper search capabilities, polished UI, better conversation quality.

### Proposed Changes

#### Search (`packages/anchor-engine/`)
| Action | File | Description |
|---|---|---|
| MODIFY | Search pipeline | Send multi-turn conversation history to LLM |
| MODIFY | Search pipeline | Cross-session memory bridging |
| NEW | Ingestion pipeline | Audio ingestion (Whisper → atoms) |
| NEW | Ingestion pipeline | Image/OCR ingestion (vision model → text → atoms) |
| MODIFY | Search API response | Add explanation field showing *why* each result matched |

#### UI (`packages/anchor-ui/`)
| Action | File | Description |
|---|---|---|
| MODIFY | `src/App.tsx` | Replace hash routing with React Router |
| MODIFY | Various components | Replace `alert()`/`confirm()` with modal components |
| MODIFY | `src/App.tsx` | Wire MonitoringDashboard to a route |
| NEW | Chat components | Add conversation persistence |
| MODIFY | `vite.config.ts` | Fix proxy for `/monitoring/*` routes |
| MODIFY | `src/pages/TaxonomyPage.tsx` | Replace mock data with live API |

#### Agent (`packages/nanobot-node/`)
| Action | File | Description |
|---|---|---|
| MODIFY | `server.js` | Add SSE streaming for chat completions |
| MODIFY | Agent loop | Maintain conversation history across turns |
| NEW | Tool execution | Sandboxed execution environment |

### Verification Plan
- [ ] Multi-turn chat produces contextually relevant responses
- [ ] UI navigation works with browser back/forward buttons
- [ ] Audio and image files can be ingested end-to-end
- [ ] Streaming responses appear token-by-token in chat UI

---

## Phase 3: Ecosystem (Q3-Q4 2026)

**Goal**: Integrations, developer tools, and community foundations.

### Proposed Changes

#### Developer Experience
| Action | Description |
|---|---|
| NEW | VS Code extension — sidebar for search, context injection, chat |
| NEW | CLI tool (`anchor-cli`) for ingestion, search, backup |
| NEW | OpenAPI/Swagger spec auto-generated from routes |
| NEW | Getting-started guide and developer tutorials |
| NEW | Plugin system for custom ingestion pipelines |

#### Operations
| Action | Description |
|---|---|
| NEW | GitHub Actions CI pipeline (build, lint, test, platform matrix) |
| NEW | Docker Compose for one-command deployment |
| NEW | Health dashboard with alerting integration |
| NEW | Automated backup scheduling (cron + Mirror Protocol) |
| NEW | Performance regression benchmarks in CI |

#### Advanced Features
| Action | Description |
|---|---|
| NEW | Federated knowledge — P2P encrypted sync between instances |
| NEW | Collaborative memory spaces (shared buckets with ACLs) |
| NEW | Mobile companion app (read-only search + quick capture) |
| NEW | Plugin API for third-party integrations |

### Verification Plan
- [ ] VS Code extension installs and performs search from sidebar
- [ ] `anchor-cli ingest <file>` works from terminal
- [ ] Docker Compose brings up all services with `docker compose up`
- [ ] CI pipeline passes on push to main
