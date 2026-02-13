#!/usr/bin/env python3
"""
MNN Inference Server
Handles communication with MNN models via stdin/stdout
"""

import sys
import json
import os
import asyncio
import signal
from typing import Dict, Any, Optional

try:
    import mnn
    import numpy as np
except ImportError as e:
    print(f"ERROR: Missing required packages: {e}", file=sys.stderr)
    print(json.dumps({"type": "ERROR", "error": f"Missing required packages: {e}"}))
    sys.exit(1)


class MNNHandler:
    def __init__(self):
        self.model = None
        self.interpreter = None
        self.session = None
        self.config = {}
        
    def load_model(self, model_path: str, config: Dict[str, Any]):
        """Load an MNN model from the specified path"""
        try:
            # Update config
            self.config = config
            
            # Load the MNN model
            self.interpreter = mnn.Interpreter(model_path)
            
            # Create session
            config = mnn.ScheduleConfig()
            config.type = mnn.BackendType.CPU  # Default to CPU
            
            # Check if GPU is requested
            if config.get('gpu_layers', 0) > 0:
                config.type = mnn.BackendType.AUTOMATION  # Use best available backend
            
            self.session = self.interpreter.create_session(config)
            
            # Get input tensor
            self.input_tensor = self.interpreter.get_input(0)
            
            print(json.dumps({"type": "READY", "model": os.path.basename(model_path)}))
            return True
        except Exception as e:
            print(json.dumps({"type": "ERROR", "error": f"Failed to load model: {str(e)}"}), file=sys.stderr)
            return False
    
    def tokenize(self, text: str) -> list:
        """Convert text to tokens - this is a simplified tokenizer"""
        # Note: In a real implementation, you'd use the appropriate tokenizer
        # for the specific model (e.g., sentencepiece for some models)
        # For now, we'll use a simple space-based split as a placeholder
        return text.split()
    
    def detokenize(self, tokens: list) -> str:
        """Convert tokens back to text"""
        # Again, this is a simplified detokenizer
        return " ".join(tokens)
    
    def generate_response(self, prompt: str, temperature: float = 0.7, max_tokens: int = 512):
        """Generate a response from the model"""
        try:
            # In a real implementation, this would involve:
            # 1. Tokenizing the prompt
            # 2. Feeding tokens to the model
            # 3. Sampling next tokens iteratively
            # 4. Converting output back to text
            
            # For demonstration purposes, we'll simulate the process
            # since the actual MNN model inference implementation would
            # depend on the specific model architecture
            
            # Send initial token to indicate processing started
            print(json.dumps({"type": "TOKEN", "token": ""}), flush=True)
            
            # Simulate processing (in real implementation, this would be actual inference)
            import time
            simulated_response = f"This is a simulated response from MNN for prompt: '{prompt[:50]}...' (truncated)"
            
            # Stream the response in chunks to simulate real inference
            chunk_size = 10
            for i in range(0, len(simulated_response), chunk_size):
                chunk = simulated_response[i:i+chunk_size]
                print(json.dumps({"type": "TOKEN", "token": chunk}), flush=True)
                time.sleep(0.01)  # Small delay to simulate processing
            
            final_response = simulated_response
            print(json.dumps({"type": "RESPONSE", "response": final_response}), flush=True)
            
        except Exception as e:
            print(json.dumps({"type": "ERROR", "error": f"Generation error: {str(e)}"}), file=sys.stderr)


def main():
    print("MNN Inference Server Started", file=sys.stderr)
    
    handler = MNNHandler()
    
    # Listen for commands from stdin
    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue
                
            # Parse the command
            cmd = json.loads(line)
            cmd_type = cmd.get("type")
            
            if cmd_type == "LOAD_MODEL":
                model_path = cmd.get("model_path")
                config = cmd.get("config", {})
                
                if handler.load_model(model_path, config):
                    print(json.dumps({"type": "LOADED"}), flush=True)
                else:
                    print(json.dumps({"type": "ERROR", "error": "Failed to load model"}), flush=True)
                    
            elif cmd_type == "GENERATE":
                prompt = cmd.get("prompt", "")
                temperature = cmd.get("temperature", 0.7)
                max_tokens = cmd.get("max_tokens", 512)
                
                handler.generate_response(prompt, temperature, max_tokens)
                
            elif cmd_type == "UNLOAD":
                # Cleanup resources
                handler.model = None
                handler.interpreter = None
                handler.session = None
                print(json.dumps({"type": "UNLOADED"}), flush=True)
                
            elif cmd_type == "PING":
                print(json.dumps({"type": "PONG"}), flush=True)
                
            else:
                print(json.dumps({"type": "ERROR", "error": f"Unknown command type: {cmd_type}"}), file=sys.stderr)
                
        except json.JSONDecodeError:
            print(json.dumps({"type": "ERROR", "error": "Invalid JSON received"}), file=sys.stderr)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(json.dumps({"type": "ERROR", "error": f"Unexpected error: {str(e)}"}), file=sys.stderr)
    
    # Cleanup on exit
    if handler.session:
        handler.session.resizeTensor([])
        handler.session.release()


if __name__ == "__main__":
    main()