# Nanobot Node.js Refactor

This project is a refactor of the original Python-based nanobot to a Node.js "Sovereign" architecture. It creates a lightweight, stateless agent that runs locally and connects via Tailscale.

## Features

- **Node.js Implementation**: Built with Node.js for better integration with the Sovereign ecosystem
- **LLM Integration**: Uses `node-llama-cpp` for local inference
- **Memory System**: Implements a rolling context window for maintaining conversation history
- **Express API**: Provides OpenAI-compatible API endpoints
- **Tailscale Ready**: Designed to connect via Tailscale

## Architecture

```
nanobot-node/
├── core/
│   ├── brain.js          # Main LLM interface using node-llama-cpp
│   └── inference-worker.js # Worker thread for inference
├── memory/
│   └── memory.js         # Rolling context window implementation
├── specs/
│   └── doc_policy.md     # Documentation policy
├── tests/
│   └── test_nano_refactor.js # Test suite
├── server.js             # Main Express server
├── .env                  # Environment configuration
└── package.json          # Dependencies
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env`:
```env
MODEL_PATH=./models/your-model.gguf
CTX_SIZE=2048
GPU_LAYERS=0
PORT=8080
MAX_MEMORY_ENTRIES=100
CONTEXT_WINDOW_SIZE=2048
```

3. Run the server:
```bash
node server.js
```

## API Endpoints

- `GET /health` - Health check
- `POST /v1/chat/completions` - Chat completions (OpenAI compatible)
- `POST /v1/completions` - Text completions
- `GET /v1/status` - Brain status
- `GET /v1/memory/recent/:count` - Get recent memories
- `POST /v1/memory/search` - Search memories
- `DELETE /v1/memory/clear` - Clear all memory

## Testing

Run the test suite:
```bash
node tests/test_nano_refactor.js
```

## Memory Management

The system implements a rolling context window that:
- Stores conversation history in `memory.md`
- Limits the number of stored entries (configurable)
- Provides context to the LLM based on token limits
- Allows searching and retrieving past interactions

## Configuration

The system can be configured via environment variables:

- `MODEL_PATH` - Path to the GGUF model file
- `CTX_SIZE` - Context size in tokens
- `GPU_LAYERS` - Number of layers to offload to GPU (0 for CPU)
- `PORT` - Server port (Default: 8080)
- `MAX_MEMORY_ENTRIES` - Maximum number of memory entries to keep
- `CONTEXT_WINDOW_SIZE` - Size of the context window in tokens