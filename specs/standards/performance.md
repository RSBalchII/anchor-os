# Performance Standards

## 1. Ingestion Pipeline
*   **Complexity:** Operations must be **O(1)** relative to transaction overhead.
    *   **Bad:** Inserting 1000 atoms individually (1000 transactions).
    *   **Good:** Inserting 1000 atoms in 1 `BEGIN...COMMIT` block.
*   **Chunking:** Files > 50KB must be chunked to avoid Out-Of-Memory (OOM) errors.
*   **Drift Check:** Every write must perform a Vector Search (Gatekeeper) to prevent temporal collapse.

## 2. Search & Retrieval
*   **Latency:** Core search should return within **200ms**.
*   **Vector Search:** Max 50 candidates per query to prevent extensive ranking overhead.
*   **Context Inflation:**
    *   **Elastic Radius:** Scale radius inversely with hit count.
    *   **Max Window:** 32KB (approx 5k tokens).
    *   **Min Window:** 200 Bytes.

## 3. Resource Management
*   **Memory Cap:** Services should monitor heap usage. `ResourceManager` triggers optimization/GC at **85%** usage.
*   **Native Modules:** Use `mmap` (memory mapping) where possible to keep RSS low (e.g., `native-vector`).
*   **Concurrency:** Use `worker_threads` or child processes for CPU-intensive tasks (e.g., Inference, Encryption) to keep the Event Loop free.
