# MNN Integration for Anchor OS Inference Server

This document explains how to use the MNN (Mobile Neural Network) integration in the Anchor OS inference server.

## Overview

The inference server now supports multiple inference engines:
- **node-llama-cpp**: The original implementation using llama.cpp
- **MNN**: Mobile Neural Network engine for optimized mobile/embedded inference

The system allows dynamic switching between these engines without restarting the server.

## Configuration

### Setting the Default Engine

Set the default inference engine in `user_settings.json`:

```json
{
  "llm": {
    "inference_engine": "llama",  // Options: "llama" or "mnn"
    // ... other settings
  }
}
```

### Engine Switching

Switch engines dynamically using the API:

```bash
curl -X POST http://localhost:3001/v1/engine/switch \
  -H "Content-Type: application/json" \
  -d '{"engine": "mnn", "model": "your-model.gguf"}'
```

## API Endpoints

### Engine Status
```bash
GET /v1/engine/status
```

Returns the current engine status:
```json
{
  "currentEngine": "mnn",
  "ready": true,
  "currentModel": "/path/to/model.gguf"
}
```

### Engine Switching
```bash
POST /v1/engine/switch
```

Payload:
```json
{
  "engine": "llama",         // Required: "llama" or "mnn"
  "model": "model.gguf"      // Optional: model to load after switching
}
```

## MNN Setup Requirements

To use the MNN engine, you need:

1. **Python 3.7+** installed on your system
2. **PyMNN** package installed:
   ```bash
   pip install mnn
   ```

Note: The MNN engine communicates with the Node.js server via a Python subprocess using JSON messages over stdin/stdout.

## Testing

After configuring your system, you can test the MNN integration:

1. Start the inference server
2. Switch to the MNN engine using the API
3. Load a compatible model
4. Test inference using the standard chat completion endpoint

## Troubleshooting

### Python Not Found
If you get errors about Python not being found, ensure Python is in your system PATH.

### MNN Package Not Found
Install PyMNN using pip:
```bash
pip install mnn
```

### Model Compatibility
Ensure your model format is compatible with the selected inference engine.