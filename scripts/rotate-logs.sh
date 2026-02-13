#!/bin/bash

# Log Rotation Script for Anchor OS (Unix Version)
# Truncates log files to last 10,000 lines when they exceed that size

LOG_DIR="${1:-./logs}"
MAX_LINES="${2:-10000}"

# Create logs directory if it doesn't exist
if [ ! -d "$LOG_DIR" ]; then
    echo "Creating log directory: $LOG_DIR"
    mkdir -p "$LOG_DIR"
fi

# Define log files to monitor
LOG_FILES=(
    "$LOG_DIR/anchor_engine.log"
    "$LOG_DIR/inference_server.log"
    "$LOG_DIR/anchor_ui.log"
    "$LOG_DIR/nanobot_node.log"
)

# Rotate each log file
for log_file in "${LOG_FILES[@]}"; do
    if [ -f "$log_file" ]; then
        line_count=$(wc -l < "$log_file" 2>/dev/null || echo 0)
        
        if [ "$line_count" -gt "$MAX_LINES" ]; then
            # Get the number of lines to truncate from the beginning
            lines_to_remove=$((line_count - MAX_LINES))
            
            # Create a temporary file with the last MAX_LINES lines
            tail -n "$MAX_LINES" "$log_file" > "${log_file}.tmp"
            
            # Replace the original file with the truncated version
            mv "${log_file}.tmp" "$log_file"
            
            echo "Rotated $log_file: $line_count lines -> $(wc -l < "$log_file") lines"
        fi
    fi
done

echo "Log rotation completed."