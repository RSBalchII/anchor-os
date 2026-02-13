# Inference Server

**Version:** 1.0.0 | **Status:** Active | **Port:** 3001

> **"Pure Compute."**

## Overview

The **Inference Server** is a standalone, dedicated service for running local Large Language Models (LLMs) using `node-llama-cpp` and `MNN`. It provides an OpenAI-compatible API for chat completions and is designed to be orchestrated by the Anchor Engine or Nanobot Node.

## Key Features

- **OpenAI-Compatible API**: Drop-in replacement for OpenAI client libraries.
- **Multiple Backends**: Supports `node-llama-cpp` (GGUF) and `MNN` (Mobile Neural Network).
- **Lazy Loading**: Loads models on demand to save resources.
- **Model Management**: API endpoints to dynamic load/unload models.
- **Performance**: Optimized for local execution on CPU/GPU.

## Architecture

- **Port**: 3001 (Default)
- **Model Dir**: `../../models` (Root models directory)
- **API Prefix**: `/v1`

## API Endpoints

### Chat Completions
`POST /v1/chat/completions`

### Model Management
- `GET /v1/models`: List available models.
- `POST /v1/model/load`: Load a specific model.
- `POST /v1/model/unload`: Unload the current model.
- `GET /v1/model/status`: Check current model status.

## Usage

### Standalone
```bash
pnpm start
```

### Configuration
Configuration is managed via the centralized `user_settings.json` in the project root.
