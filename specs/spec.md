# Anchor OS Technical Specification

> Last revised: February 2026

## Vision

Anchor OS is a **sovereign, local-first personal knowledge engine** — an offline-capable AI memory system with physics-based associative search, multi-channel agent integration, and local LLM inference. All data stays on your machine. No cloud. No API keys required. Full sovereignty.

## Design Principles

1. **Sovereignty First** — Your data stays on your machine. Always.
2. **Physics Over Magic** — Search is deterministic graph traversal, not black-box embeddings.
3. **LLM as Narrator** — The model weaves results into language; it doesn't think for you.
4. **Atoms Are Forever** — Content is decomposed once, queryable forever, across formats.
5. **Offline by Default** — Everything works without internet. Cloud is opt-in.

---

## System Architecture

Anchor OS is a monorepo (`pnpm-workspace.yaml`) following a split-brain service-oriented architecture. All services communicate over localhost HTTP and share configuration via a root `user_settings.json`.

### Core Services

| Service | Package | Port | Technology | Role |
|---|---|---|---|---|
| Anchor Engine | `packages/anchor-engine` | 3160 | TypeScript, Express, PGlite | Knowledge DB, search, ingestion, orchestrator |
| Inference Server | `packages/inference-server` | 3001 | Node.js, Express, `node-llama-cpp` | Dedicated LLM server with engine abstraction |
| Nanobot | `packages/nanobot-node` | 8080 | Node.js + Python, `worker_threads` | Sovereign agent with tools, memory, multi-channel chat |
| Anchor UI | `packages/anchor-ui` | 5173 | React 19, Vite, Tailwind CSS | Dashboard with search, chat, monitoring |

### Supplementary Modules

| Module | Role |
|---|---|
| `@rbalchii/native-atomizer` | C++ N-API text decomposition |
| `@rbalchii/native-fingerprint` | C++ SimHash deduplication |
| `@rbalchii/native-keyassassin` | C++ keyword extraction |
| `@rbalchii/native-vector` | C++ vector operations |

---

## Atomic Knowledge Architecture

Content is decomposed into a hierarchy: **Compound → Molecule → Atom**.

- **Compound**: A source file or document.
- **Molecule**: A semantic chunk (paragraph, code block, section).
- **Atom**: The smallest meaningful unit — a sentence, definition, or fact.

Each atom is stored in PGlite with byte-offset pointers back to its source file. Atoms are tagged via NLP entity extraction and organized into buckets (`notebook`, `inbox`, `external`, `quarantine`).

### Deduplication
SimHash fingerprinting via native C++ (`@rbalchii/native-fingerprint`) ensures no duplicate atoms enter the graph.

### Watchdog
A file watcher auto-ingests new files dropped into inbox directories. Supports **Dynamic Path Management**, allowing users to add or remove watched directories at runtime via the API/UI (`/v1/system/paths`), with settings persisted to `user_settings.json`.

---

## Ingestion Pipeline ("Semantic Shift")

### Performance Strategy
- **Batched Transactions**: `BEGIN ... COMMIT` blocks insert thousands of atoms/tags in a single transaction — O(1) commit overhead.
- **Chunking**: Large files split into 50KB chunks to prevent OOM while preserving semantic context.
- **Sub-Batching**: Massive inserts split into 50-item sub-batches within a single transaction to keep memory flat.
- **Atomic Deduplication**: `SemanticIngestionService` uses a `Map` per chunk cycle to ensure unique entities, preventing `ON CONFLICT` errors.

### Tag Infection (Write Path)
A generator-based streaming tag propagation system. During ingestion, new content is analyzed for semantic categories and linked to related atoms through shared tags and buckets, creating associative pathways for the Tag-Walker protocol without vector processing.

---

## Search & Retrieval (Tag-Walker → Universal Semantic Search)

### Tag-Walker Protocol (Standard 104)
A physics-inspired "Planets and Moons" model:
- **Planets** (70% budget): Direct keyword FTS matches — high-confidence hits.
- **Moons** (30% budget): Graph-discovered associations via SQL bipartite traversal (atoms ↔ tags) using CTE-optimized JOINs.
- **Fusion Scoring**: Results merged with dynamic allocation based on query characteristics.

### Key Capabilities
- **Weighted Reservoir Sampling** with temperature parameter for serendipity.
- **Deterministic Semantic Expansion** — synonym ring without LLM involvement.
- **Temporal Context Extraction** — parses "last 3 months", date ranges from natural language.
- **Graph-Context Serializer** with intent detection.
- **Sovereign System Prompt** — LLM narrates physics results, stays within the graph's knowledge.

### Elastic Context (Adaptive Radius Inflation)
Context is dynamically "inflated" from the retrieved atom's byte-offset position in the source file:
- Few hits → massive context (up to 32KB per atom).
- Many hits → focused context (200B per atom).
- Maximizes information density within the LLM's token budget.

---

## Memory Lifecycle

### Dreamer Service
Background Markovian summarization running on a cron schedule. Compresses old conversation history and knowledge into progressively denser summaries.

### Temporal Tagging
Atoms are tagged with season, quarter, and time-of-day metadata for temporal retrieval.

### Epochal Historian
Identifies macro-patterns: **Epochs** (eras of activity), **Episodes** (event clusters), **Entities** (recurring actors).

### Mirror Protocol ("Tangible Knowledge Graph")
- **Source-of-Truth**: The `sources` table tracks all ingested files and their integrity hashes.
- **Reflection**: Files are physically copied from `inbox/` to `mirrored_brain/`, organized by provenance (`@inbox`, `@external`, `@quarantine`).
- **Rehydration**: Expands flat YAML backups back into a full directory structure.

### BERT NER Teacher
GliNER-based named entity recognition with lazy loading and automatic unload after idle timeout.

---

## Nanobot Agent Framework

### Architecture
- **Node.js server** with Express, running an agent loop (tool calls → state updates → response).
- **Python agent framework** with a message bus architecture for channel adapters.
- **Inference via `worker_threads`** — a dedicated worker thread manages the llama runtime (model, context, session).

### Multi-Channel Support
Discord, Telegram, WhatsApp, DingTalk, Feishu — each adapter connects through the Python message bus.

### Tool Registry
Shell execution, filesystem operations, web requests, GitHub integration, cron scheduling, subagent spawning.

### Memory
Hybrid XML/Markdown persistent memory file (`memory.md`) with a Dreaming Protocol for background compression. Supports rolling context windows, role-based retrieval, and keyword search.

### Skill System
Progressive skill loading — summaries injected into the system prompt, full skill bodies loaded on demand.

---

## Inference Server

### Engine Abstraction
Strategy pattern via `EngineManager` supporting:
- **LlamaEngine** — `node-llama-cpp` with GGUF models.
- **MNNEngine** — Alibaba MNN runtime for mobile/edge models.

### Features
- Dynamic model loading/unloading with lazy initialization.
- OpenAI-compatible `/v1/chat/completions` API.
- Integrated Nano-Console control panel for manual model management.
- Automatic `<search>` tag detection in LLM output → calls Anchor Engine search API.

---

## API Surface (32+ Endpoints)

All services expose OpenAI-compatible APIs with shared middleware:

### Anchor Engine (`/v1/...`)
Ingestion, search, atom CRUD, bucket/tag listing, backup/restore, Dreamer trigger, research scraping, Scribe (Markovian state), system config, health checks, debug SQL, graph data.

### Inference Server (`/v1/...`)
Chat completions, model load/unload/status, engine switch.

### Nanobot (`/v1/...`)
Chat completions, completions, model load.

### Security
- **API Key Authentication**: Bearer token middleware on all `/v1` routes. Configured via `user_settings.json` → `server.api_key`. Empty key = open access (development mode).
- **Request Validation**: Declarative schema validation on all POST endpoints.

---

## Key Implementation Details

### Model Management
- Models stored in root `models/` directory as GGUF files.
- Path resolution centralized in `user_settings.json` via `model_dir`.
- Inference Server supports lazy loading for VRAM/RAM optimization.

### Resource Management
- All Node.js services run with `--expose-gc`.
- `ResourceManager` in Anchor Engine performs proactive memory monitoring and manual GC when usage exceeds 85%.

### Configuration
- Single `user_settings.json` at project root, shared by all services.
- Settings: model directory, ports, model names, GPU layers, context size, API key, logging preferences.

### Development Workflow
- **Unified Startup**: `start.bat` (Windows) / `start.sh` (Unix) handles dependency injection and parallel service execution.
- **Package Manager**: pnpm workspaces.
- **Testing**: Engine test suite (10 sections, 38+ files). Nanobot test suite for memory functions.

---

## Success Metrics

| Metric | Target | Current |
|---|---|---|
| Search latency (p95) | < 200ms | ~150ms |
| Ingestion throughput | > 100 atoms/sec | Achieved |
| Memory window efficiency | > 90% relevant | ~85% |
| API endpoint coverage | 100% validated | ~60% (WIP) |
| Test coverage (engine) | > 80% integration | ~70% |
| Cross-platform parity | Full | Partial (Windows-led) |
