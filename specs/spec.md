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
        *   Provides local, embedded vector similarity search.
        *   Uses memory-mapped files for zero-copy loading and low RAM usage.
        *   Supports "Sovereign" architecture (no external dependencies).

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
