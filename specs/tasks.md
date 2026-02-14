# Anchor OS — Task Tracker

> Last revised: February 2026

## Status Guide
- `[ ]` Pending
- `[x]` Completed
- `[-]` Skipped / Cancelled

---

## Phase 1: Hardening (Q1 2026)

### Security & Reliability
- [x] API key authentication across all services <!-- id: sec-1 -->
- [x] Request validation on all mutation endpoints <!-- id: sec-2 -->
- [ ] Path traversal protection on model load endpoints <!-- id: sec-3 -->
- [ ] Command execution allowlist (replace deny-list in nanobot tools) <!-- id: sec-4 -->
- [ ] Rate limiting on public-facing endpoints <!-- id: sec-5 -->
- [ ] Input sanitization for SQL/injection vectors <!-- id: sec-6 -->

### Bug Fixes
- [x] Fix nanobot missing memory functions (`getRecentMemories`, `searchMemories`, `clearMemory`) <!-- id: bug-1 -->
- [x] Fix nanobot worker missing `unloadModel` handler <!-- id: bug-2 -->
- [ ] Fix nanobot session recreation on every request (preserve conversation context) <!-- id: bug-3 -->
- [ ] Fix inference-server `EngineManager.switchEngine()` — `from` field bug <!-- id: bug-4 -->
- [ ] Fix MNNEngine concurrent request handling (add request ID tracking) <!-- id: bug-5 -->
- [ ] Fix `set-env-vars.js` to actually propagate environment variables <!-- id: bug-6 -->
- [ ] Fix `start.bat` hardcoded paths → use relative paths <!-- id: bug-7 -->
- [ ] Achieve Windows/Unix launch script parity <!-- id: bug-8 -->

### Testing
- [x] Anchor Engine: Integration test suite (10 sections, 38+ files) <!-- id: test-1 -->
- [x] Nanobot: Fix test imports and memory function tests <!-- id: test-2 -->
- [ ] Inference Server: Add test suite (model load/unload, chat completions, engine switch) <!-- id: test-3 -->
- [ ] Anchor UI: Add Vitest + React Testing Library for component tests <!-- id: test-4 -->
- [ ] Add smoke test script that validates all services start and respond to health checks <!-- id: test-5 -->

---

## Phase 2: Intelligence & UX (Q2 2026)

### Search Enhancements
- [ ] Multi-turn conversation context in chat (send history to LLM) <!-- id: search-1 -->
- [ ] Cross-session memory bridging — recall relevant past conversations <!-- id: search-2 -->
- [ ] Audio ingestion pipeline (Whisper → atoms) <!-- id: search-3 -->
- [ ] Image/OCR ingestion (vision model → text → atoms) <!-- id: search-4 -->
- [ ] Search result explanation — show *why* each result was surfaced <!-- id: search-5 -->

### UI Polish
- [ ] Replace hash-based routing with proper router (React Router / TanStack Router) <!-- id: ui-1 -->
- [ ] Replace `alert()`/`confirm()` with modal components <!-- id: ui-2 -->
- [ ] Wire up MonitoringDashboard to a route <!-- id: ui-3 -->
- [ ] Add conversation persistence (localStorage or API-backed) <!-- id: ui-4 -->
- [ ] Fix Vite proxy for `/monitoring/*` routes <!-- id: ui-5 -->
- [ ] Complete TaxonomyPage (replace mock data with live API) <!-- id: ui-6 -->

### Agent Improvements
- [ ] Streaming SSE support in nanobot chat completions <!-- id: agent-1 -->
- [ ] Conversation history in agent loop (multi-turn context) <!-- id: agent-2 -->
- [ ] Improved tool safety (sandboxed execution environment) <!-- id: agent-3 -->
- [ ] Agent skill marketplace — share/install skill packs <!-- id: agent-4 -->

---

## Phase 3: Ecosystem (Q3-Q4 2026)

### Developer Experience
- [ ] VS Code extension — sidebar for search, context injection, chat <!-- id: dx-1 -->
- [ ] CLI tool for ingestion, search, backup from terminal <!-- id: dx-2 -->
- [ ] REST API documentation (OpenAPI/Swagger spec) <!-- id: dx-3 -->
- [ ] Developer getting-started guide and tutorials <!-- id: dx-4 -->
- [ ] Plugin system for custom ingestion pipelines <!-- id: dx-5 -->

### Operations
- [ ] GitHub Actions CI pipeline (build, lint, test) <!-- id: ops-1 -->
- [ ] Docker Compose for one-command deployment <!-- id: ops-2 -->
- [ ] Health dashboard with alerting <!-- id: ops-3 -->
- [ ] Automated backup scheduling <!-- id: ops-4 -->
- [ ] Performance regression testing in CI <!-- id: ops-5 -->

### Advanced Features
- [ ] Federated knowledge — sync between Anchor OS instances (P2P, encrypted) <!-- id: adv-1 -->
- [ ] Collaborative memory spaces (shared buckets) <!-- id: adv-2 -->
- [ ] Mobile companion app (read-only search + quick capture) <!-- id: adv-3 -->
- [ ] Plugin API for third-party integrations <!-- id: adv-4 -->
