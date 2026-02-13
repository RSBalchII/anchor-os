# Implementation Plan: Inference Server Engine Abstraction

## Goal
Make the Sovereign Inference Server engine-agnostic, supporting multiple inference backends with dynamic switching capability.

## 1. Engine Abstraction Layer
- **Problem:** Current implementation tightly coupled to node-llama-cpp.
- **Solution:**
    - Create abstract `InferenceEngine` interface.
    - Implement `LlamaEngine` adapter for existing node-llama-cpp functionality.
    - Implement `MNNEngine` adapter for MNN via Python subprocess.
    - Create `EngineManager` to orchestrate engine switching.

## 2. MNN Integration
- **Problem:** Need to support MNN inference engine for mobile/embedded optimization.
- **Solution:**
    - Develop Python script (`mnn_inference.py`) using PyMNN.
    - Communicate with Node.js via JSON over stdin/stdout.
    - Support streaming responses to match existing API behavior.
    - Handle model loading, inference, and resource management.

## 3. Dynamic Engine Switching
- **Problem:** Need to switch between inference engines without server restart.
- **Solution:**
    - Add `/v1/engine/switch` endpoint to change active engine.
    - Add `/v1/engine/status` endpoint to check current engine.
    - Implement graceful termination and startup of engine processes.
    - Preserve existing API compatibility during switches.

## 4. Configuration Management
- **Problem:** Need to specify which inference engine to use.
- **Solution:**
    - Add `inference_engine` option to `user_settings.json`.
    - Support both "llama" and "mnn" options.
    - Default to "llama" for backward compatibility.

## 5. Performance & Stability
- **Problem:** Maintain performance and stability with multiple engine types.
- **Solution:**
    - Preserve existing timeout and logging mechanisms.
    - Ensure proper resource cleanup during engine switches.
    - Maintain same error handling patterns across engines.
