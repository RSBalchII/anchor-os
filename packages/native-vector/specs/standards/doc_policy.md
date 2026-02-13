# Documentation Policy (Root Coda) - Native Vector Module

**Status:** Active | **Authority:** Human-Locked | **Domain:** Native Performance Modules

## Core Philosophy for Native Development
1. **Performance is King:** Latency metrics are the only source of truth.
2. **Synchronous Testing:** EVERY C++ change MUST include a matching update to the TypeScript Test Suite.
3. **Visuals over Text:** Prefer Mermaid diagrams for memory/threading models.
4. **Brevity:** Text sections must be <500 characters.
5. **Pain into Patterns:** Every segfault must become a Standard.
6. **LLM-First Documentation:** Documentation must be structured for LLM consumption.
7. **Change Capture:** All significant ABI changes must be documented in new Standard files.
8. **Modular Architecture:** Each header/class must be documented in isolation.
9. **API-First Design:** All N-API interfaces must be clearly defined with TypeScript equivalents.
10. **Self-Documenting Code:** Complex SIMD logic must include inline comments explaining intrinsics.

## LLM RESTRICTIONS & RULES
> [!IMPORTANT]
> **Strict Modification Rules for AI Agents:**
> 1.  **NO NEW FILES**: Do not create new `NNN-title.md` files without user approval.
> 2.  **UPDATE LIVING STANDARDS**: Only update the Living Domain Standards in `specs/standards/`.
> 3.  **USE CHANGELOG**: Log every architectural decision in `CHANGELOG.md` (if present).
> 4.  **DIAGRAMMATIC SPEC**: Keep `specs/spec.md` as a high-level visual map.

## LLM Developer Documentation Directory

### `README.md` (Root) — **PROJECT OVERVIEW**
*   **Role:** Module overview, installation, and build instructions.
*   **Content:** Dependencies, build flags, N-API exposure.

### `SPEC.md` (specs/) — **SYSTEM ARCHITECTURE MAP**
*   **Role:** High-level architecture for LLM developers.
*   **Content:** C++ class hierarchy, memory management strategies, N-API bridge.

### `STANDARDS/` (specs/standards/) — **IMPLEMENTATION RULES**
*   **Role:** Detailed implementation standards.
*   **Content:**
    *   `Memory_Managment.md`: RAII, Smart Pointers, mmap usage.
    *   `SIMD_Policy.md`: AVX/NEON usage, fallback paths.
    *   `NAPI_Bridge.md`: Data conversion rules between V8 and C++.

## Performance Optimization Patterns
*   **Native Acceleration**: Use AVX2/AVX-512 where available.
*   **Zero-Copy Operations**: Use `Napi::Buffer` and `std::span` to minimize copying.
*   **Batch Processing**: Implement `.add_many()` and `.search_many()` to reduce JS-C++ boundary overhead.
*   **Memory alignment**: Ensure 32-byte alignment for SIMD operations.

## Error Handling Patterns
*   **Exception Firewall**: ALL C++ exceptions must be caught and re-thrown as `Napi::Error`.
*   **Null Checks**: Verify all `napi_value` and pointers before usage.
*   **Graceful Degradation**: Fallback to scalar implementations if SIMD is unavailable.

## Key Data Structures
*   **VectorEngine**: Core class wrapping `index_dense_gt`.
*   **SoulIndex**: TypeScript wrapper for type safety.
*   **Float32Array**: Primary data transport format.

## Monitoring & Diagnostics
*   **Debug Logs**: Use `fprintf(stderr)` for unbuffered native logging during development.
*   **Performance Counters**: Track `add/sec` and `search/sec`.
