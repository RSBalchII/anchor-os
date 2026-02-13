# Tasks

- [x] **Setup Server**
    - [x] Basic Express API.
    - [x] `node-llama-cpp` integration.
    - [x] Process spawning for isolation.

- [ ] **Optimize Performance**
    - [x] Enable Threads Config (`THREADS=4`).
    - [x] Enable GPU Offloading (`GPU_LAYERS=6` to avoid OOM).
    - [x] Benchmark Script (`benchmark.js`).
    - [ ] Tuning: Find optimal threads/layers for specific hardware.

- [ ] **Specs & Documentation**
    - [x] Create `specs/` directory.
    - [x] Define `standards.md`.
    - [ ] Create `implementation_plan.md`.

- [ ] **Future Enhancements**
    - [ ] Centralized Config Loader.
    - [ ] Support for multiple concurrent models (Queue System).
    - [ ] Web WebGPU Fallback (if local executable missing).
