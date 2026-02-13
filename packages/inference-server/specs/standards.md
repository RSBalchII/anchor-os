# Standards (Inference Server)

## Design Philosophy
- **Minimal Dependencies:** Keep the server lightweight (Express + configurable inference engines).
- **Environment First:** All configuration via `.env` and `user_settings.json`.
- **Stateless:** The server handles one request at a time (per process).
- **Engine Agnostic:** Support multiple inference backends through abstraction.
- **Graceful Failures:** Use timeouts (`300s`) and clear error messages.

## Logging
- Prefix all engine logs with `[Engine]` or specific engine name (e.g., `[Llama Engine]`, `[MNN Engine]`).
- Log initial configuration (GPU, Threads, Context Size).
- Log prompt length and generation time.
- Log engine switching events.

## Code Style
- Use ES Modules (`import/export`).
- Follow the engine abstraction pattern for new inference backends.
- Avoid complex nested template literals strings passed to `spawn` (use concatenation).
