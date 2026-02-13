# MNN Integration Specification

## Overview
This document specifies the integration of MNN (Mobile Neural Network) as an alternative inference engine in the Anchor OS inference server, alongside the existing node-llama-cpp implementation.

## Architecture

### Engine Abstraction Layer
The system now uses an abstracted engine interface to support multiple inference backends:

- `InferenceEngine` - Base abstract class defining the interface
- `LlamaEngine` - Implementation for node-llama-cpp
- `MNNEngine` - Implementation for MNN via Python subprocess
- `EngineManager` - Orchestrates engine switching and management

### MNN Implementation
- MNN inference is handled via a Python script (`mnn_inference.py`) using PyMNN
- Communication occurs via stdin/stdout JSON messages
- The Node.js process manages the Python subprocess lifecycle
- Streaming responses are supported to match existing API behavior

## Configuration

### user_settings.json Updates
Added `inference_engine` option to the `llm` section:
```json
{
  "llm": {
    "inference_engine": "llama",  // Options: "llama" or "mnn"
    // ... other settings
  }
}
```

## API Endpoints

### Engine Management
- `GET /v1/engine/status` - Returns current engine status
- `POST /v1/engine/switch` - Switch between inference engines

### Payload for Engine Switch
```json
{
  "engine": "llama",  // Required: "llama" or "mnn"
  "model": "model.gguf"  // Optional: model to load after switching
}
```

### Response Format
```json
{
  "status": "switched",
  "from": "llama",
  "to": "mnn",
  "loaded_model": "model.gguf"  // If model was loaded
}
```

## Backward Compatibility
- Existing endpoints remain unchanged (`/v1/chat/completions`, `/v1/models`, etc.)
- Default behavior preserved (uses llama engine if not specified)
- Same response formats maintained

## Process Management
- Engine switching terminates the current inference subprocess
- New engine subprocess is spawned with appropriate configuration
- Resource cleanup is handled automatically

## Error Handling
- Engine initialization failures are reported appropriately
- Model loading errors are propagated to the client
- Communication errors between Node.js and Python processes are handled gracefully