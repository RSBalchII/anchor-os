# Anchor UI

**Version:** 3.0.0 | **Status:** Active | **Port:** 5173

> **"The Bridge to Reality."**

## Overview

The **Anchor UI** is the primary interface for the Anchor OS. Built with React, TypeScript, and Vite, it provides a unified dashboard for managing your knowledge graph, interacting with AI agents, and monitoring system health.

## Key Features

- **Unified Dashboard**: Single pane of glass for Search, Chat, and System Health.
- **Agent Chat**: Direct interface to Nanobot agent (proxied via Anchor Engine).
- **Semantic Search**: Visual interface for exploring memory with filtering and temporal controls.
- **Model Management**: Load/Unload and switch LLM models dynamically.
- **Responsive Design**: Glassmorphism aesthetic optimized for desktop and tablet.

## Architecture

- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS + Lucide Icons + Custom Glass Panel Components
- **API**: Communicates with Anchor Engine (Proxy) on port 3160 (or configured base URL).

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Configuration

The UI connects to the API defined in `.env` (`VITE_API_BASE_URL`) or defaults to the relative path proxy in production builds.
