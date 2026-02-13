# Anchor OS Technical Specification

## System Architecture

Anchor OS is a decentralized, local-first AI ecosystem organized as a monorepo. It follows a service-oriented architecture where specialized components communicate over local network protocols.

### Core Components

1.  **Anchor Engine (`packages/anchor-engine`)**
    *   **Role:** Management Hub & Knowledge Database.
    *   **Technology:** Node.js, PGlite (PostgreSQL), `node-llama-cpp`.
    *   **Functions:** 
        *   Orchestrates other services via `ProcessManager`.
        *   Manages semantic memory (Atoms, Tags, Edges).
        *   Provides search and retrieval capabilities for RAG.
        *   Monitors system resources via `ResourceManager`.

2.  **Inference Server (`packages/inference-server`)**
    *   **Role:** Dedicated LLM Execution Environment.
    *   **Technology:** Express, `node-llama-cpp` (spawning child processes for isolation).
    *   **Features:**
        *   Dynamic model loading/unloading.
        *   OpenAI-compatible chat completions API.
        *   Integrated control panel (Nano-Console) for manual model management.
        *   Tool support for semantic search integration.

3.  **Nanobot Node (`packages/nanobot-node`)**
    *   **Role:** Lightweight Autonomous Agent.
    *   **Technology:** Node.js, `worker_threads` for inference.
    *   **Functions:** Provides agentic capabilities like Discord/Email integration and local terminal access.

4.  **Anchor UI (`packages/anchor-ui`)**
    *   **Role:** Primary User Interface.
    *   **Technology:** React/Vite.

5.  **Native Vector Module (`@rbalchii/native-vector`)**
    *   **Role:** High-Performance Vector Search Engine.
    *   **Technology:** C++ Addon (N-API), USearch, SIMD/AVX2 acceleration.
    *   **Functions:**
        *   **Local-First:** Embedded vector search with no external service dependencies ("Sovereign Architecture").
        *   **Zero-Copy:** Uses memory-mapped files (`.view()`) for instant startup and negligible RAM overhead.
        *   **SIMD Optimized:** Utilizes AVX2/AVX-512 hardware acceleration for blazing fast distance calculations.

## 2. Ingestion Pipeline ("Semantic Shift")

### Performance Strategy ("Big O" Optimization)
*   **Batched Transactions:** Ingestion uses `BEGIN ... COMMIT` blocks to insert thousands of atoms/tags in a single transaction, reducing complexity from O(N) to O(1) relative to commit overhead.
*   **Chunking:** Large files are automatically split into 50KB chunks to prevent Out-Of-Memory (OOM) errors while preserving semantic context.

### Ingestion Resilience
*   **Atomic Deduplication:** The `SemanticIngestionService` uses a `Map` within each chunk processing cycle to ensure strictly unique atomic entities. This prevents `ON CONFLICT` errors caused by recurring concepts (e.g., repeated words) within the same batch.
*   **Sub-Batching:** To minimize Heap memory usage during SQL query construction, massive insert operations are split into smaller sub-batches (e.g., 50 items) within a single database transaction. This ensures O(1) commit overhead while keeping memory footprints flat.

### "Gatekeeper" (Write Path)
*   **Drift Detection:** Before ingestion, new content is embedded and compared against the vector index.
*   **Temporal Collapse:** If a "Near Duplicate" (Distance < 0.05) is found, the new atom is linked as a **Variant** (`is_variant_of`) rather than a new vector. This prevents index pollution and maintains specific memories without flooding the search space.

## 3. Search & Retrieval

### Hybrid Retrieval Strategy
*   **Vector Search:** Retrieves top 50 semantic matches using Cosine Similarity.
*   **Full-Text Search (FTS):** Retrieves keyword-based matches (exact phrases, technical terms).
*   **Fusion Scoring:** Results are merged, with scores boosted if found by both methods or if they have high "Provenance" (Internal vs External).

### Elastic Context
*   **Radial Inflation:** Context is dynamically "inflated" from the retrieved atom's position in the source file.
*   **Adaptive Window:** The radius of inflation scales based on the number of search hits—few hits yield massive context (up to 32KB), while many hits yield focused context (200B) to maximize information density within the token budget.

## 4. Mirror Protocol ("Tangible Knowledge Graph")
*   **Source-of-Truth:** The `sources` table tracks all ingested files and their integrity hashes.
*   **Reflection:** The Mirror Service physically copies files from `inbox/` to `mirrored_brain/`, organizing them by provenance (`@inbox`, `@external`, `@quarantine`).
*   **Rehydration:** Capable of expanding flat YAML backups back into a full directory structure.

## Key Implementation Details

### Model Management
*   Models are stored in the root `models/` directory as GGUF files.
*   Path resolution is centralized in `user_settings.json` using the `model_dir` property.
*   Inference Server supports lazy loading to optimize VRAM/RAM usage.

### Resource Management & Optimization
*   All Node.js services are configured to run with the `--expose-gc` flag.
*   `ResourceManager` in Anchor Engine performs proactive memory monitoring and manual garbage collection when usage exceeds defined thresholds (e.g., 85%).

### Networking & API
*   **Anchor Engine:** Port 3160
*   **Inference Server:** Port 8000 (standardized from 3001)
*   **UI:** Port 5173
*   Internal Tooling: Inference Server automatically calls Anchor Engine's search API using `<search>` tags detected in LLM output.

## Development Workflow
*   **Unified Startup:** `start.bat` (Windows) or `start.sh` (Unix) handles dependency injection and parallel service execution.
*   **Configuration:** All services share `user_settings.json` located at the project root.
