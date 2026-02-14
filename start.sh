#!/bin/bash

# Anchor OS - Unified Launcher with Advanced Logging (Unix Version)
# Launches all services with centralized logging and rotation

echo "========================================================"
echo "  Anchor OS - Unified Launcher with Advanced Logging"
echo "  Launching all services with centralized logging"
echo "========================================================"
echo

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo "Please install Node.js v18+ from https://nodejs.org/"
    exit 1
fi

# Check for PNPM
if ! command -v pnpm &> /dev/null; then
    echo "[WARN] PNPM is not installed. Installing via NPM..."
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install PNPM."
        exit 1
    fi
    echo "[OK] PNPM installed successfully."
fi

# Set environment variables based on configuration
echo "[INFO] Setting environment variables based on configuration..."
node set-env-vars.js
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to set environment variables."
    exit 1
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    echo "[INFO] Creating logs directory..."
    mkdir -p logs
fi

# Run log rotation script
echo "[INFO] Running log rotation..."
bash scripts/rotate-logs.sh 2>/dev/null || echo "[INFO] No log rotation script found or failed to execute."

# Install dependencies at root
echo "[INFO] Installing dependencies..."
pnpm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Root dependencies installation failed."
    exit 1
fi

# Check if logging is enabled in user_settings.json
LOGGING_ENABLED=$(node -p "require('./user_settings.json').logging.enabled" 2>/dev/null || echo true)

if [ "$LOGGING_ENABLED" = "false" ]; then
    echo "[INFO] Logging is disabled in user_settings.json"
    # Start services without logging
    echo "[INFO] Logging is disabled, starting services without logging..."

    # Start Anchor Engine without logging
    echo "[INFO] Starting Anchor Engine (port 3160)..."
    (cd packages/anchor-engine && SKIP_VECTOR_PROCESSING=$SKIP_VECTOR_PROCESSING node --expose-gc engine/dist/index.js) &
    ANCHOR_ENGINE_PID=$!

    sleep 5

    # Start Inference Server without logging
    echo "[INFO] Starting Inference Server (port 3001)..."
    (cd packages/inference-server && node --expose-gc server.js) &
    INFERENCE_SERVER_PID=$!

    sleep 5

    # Start Nanobot Node without logging
    echo "[INFO] Starting Nanobot Node (agent service)..."
    (cd packages/nanobot-node && node --expose-gc server.js) &
    NANOBOT_NODE_PID=$!

    sleep 5

    # Start Anchor UI without logging
    echo "[INFO] Starting Anchor UI (development mode)..."
    (cd packages/anchor-ui && pnpm dev) &
    ANCHOR_UI_PID=$!

    echo
    echo "[INFO] All services launched successfully!"
    echo
    echo "Services are running:"
    echo "  - Anchor Engine: http://localhost:3160"
    echo "  - Inference Server: http://localhost:3001"
    echo "  - Anchor UI: http://localhost:5173 (development)"
    echo
    echo "Press Ctrl+C to stop all services..."

    # Wait for all background processes
    wait $ANCHOR_ENGINE_PID $INFERENCE_SERVER_PID $NANOBOT_NODE_PID $ANCHOR_UI_PID
else
    echo "[INFO] Logging is enabled, starting services with logging..."

    # Start Anchor Engine with logging
    echo "[INFO] Starting Anchor Engine (port 3160) with logging..."
    (cd packages/anchor-engine && SKIP_VECTOR_PROCESSING=$SKIP_VECTOR_PROCESSING node --expose-gc engine/dist/index.js > ../../logs/anchor_engine.log 2>&1) &
    ANCHOR_ENGINE_PID=$!

    sleep 5

    # Start Inference Server with logging
    echo "[INFO] Starting Inference Server (port 3001) with logging..."
    (cd packages/inference-server && node --expose-gc server.js > ../../logs/inference_server.log 2>&1) &
    INFERENCE_SERVER_PID=$!

    sleep 5

    # Start Nanobot Node with logging
    echo "[INFO] Starting Nanobot Node (agent service) with logging..."
    (cd packages/nanobot-node && node --expose-gc server.js > ../../logs/nanobot_node.log 2>&1) &
    NANOBOT_NODE_PID=$!

    sleep 5

    # Check if UI logging is enabled in config
    UI_LOGGING_ENABLED=$(node -p "require('./user_settings.json').logging.services.anchor_ui.enabled" 2>/dev/null || echo false)

    if [ "$UI_LOGGING_ENABLED" = "true" ]; then
        echo "[INFO] Starting Anchor UI (development mode) with logging..."
        (cd packages/anchor-ui && pnpm dev > ../../logs/anchor_ui.log 2>&1) &
        ANCHOR_UI_PID=$!
    else
        echo "[INFO] Starting Anchor UI (development mode) without logging..."
        (cd packages/anchor-ui && pnpm dev) &
        ANCHOR_UI_PID=$!
    fi

    echo
    echo "[INFO] All services launched successfully!"
    echo
    echo "Services are running:"
    echo "  - Anchor Engine: http://localhost:3160"
    echo "  - Inference Server: http://localhost:3001"
    echo "  - Anchor UI: http://localhost:5173 (development)"
    echo
    echo "Logs are available in the ./logs/ directory"
    echo
    echo "To view logs in real-time, use: tail -f logs/[service].log"
    echo
    echo "Press Ctrl+C to stop all services..."

    # Wait for all background processes
    wait $ANCHOR_ENGINE_PID $INFERENCE_SERVER_PID $NANOBOT_NODE_PID $ANCHOR_UI_PID
fi