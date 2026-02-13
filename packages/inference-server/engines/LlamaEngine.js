import { spawn } from "child_process";
import { InferenceEngine } from "./InferenceEngine.js";

export class LlamaEngine extends InferenceEngine {
  #process = null;
  #ready = false;
  #currentModelPath = null;
  #responseQueue = [];

  constructor() {
    super();
  }

  get ready() {
    return this.#ready;
  }

  set ready(value) {
    this.#ready = value;
  }

  get currentModelPath() {
    return this.#currentModelPath;
  }

  set currentModelPath(value) {
    this.#currentModelPath = value;
  }

  get process() {
    return this.#process;
  }

  set process(value) {
    this.#process = value;
  }

  get responseQueue() {
    return this.#responseQueue;
  }

  set responseQueue(value) {
    this.#responseQueue = value;
  }

  async loadModel(modelPath, config) {
    if (!modelPath) {
      console.error("❌ ERROR: No model path provided");
      return false;
    }

    if (this.process) {
      console.log("🛑 Stopping current model process...");
      this.process.kill();
      this.process = null;
      this.ready = false;
    }

    console.log(`🚀 Starting Llama Inference Engine...`);
    console.log(`   Model: ${modelPath}`);
    console.log(`   GPU Layers: ${config.gpu_layers || 0}`);

    this.currentModelPath = modelPath;

    // Create the child process script with proper configuration values
    const childScript = `
        import { getLlama, LlamaChatSession } from "node-llama-cpp";

        async function startModel() {
            try {
                // Use config values with fallbacks to environment variables
                const ctxSize = parseInt(process.env.CTX_SIZE || "${config.ctx_size || 2048}");
                const batchSize = parseInt(process.env.BATCH_SIZE || "${config.batch_size || 256}");
                const threads = parseInt(process.env.THREADS || "${config.threads || 4}"); // Default to 4 threads for CPU
                const gpuLayers = parseInt(process.env.GPU_LAYERS || "${config.gpu_layers || 0}");
                const useGpu = gpuLayers > 0;

                console.log("Loading Llama Runtime (GPU: " + useGpu + ", Threads: " + threads + ")...");
                const llama = await getLlama({ gpu: useGpu ? "cuda" : false });

                console.log("Loading Model: " + process.env.MODEL_PATH);
                const model = await llama.loadModel({
                    modelPath: process.env.MODEL_PATH,
                });

                console.log("Creating context (Size: " + ctxSize + ", GPU: " + gpuLayers + ", Threads: " + threads + ")...");
                const context = await model.createContext({
                    contextSize: ctxSize,
                    batchSize: batchSize,
                    gpuLayers: gpuLayers,
                    threads: threads,
                    flashAttention: false
                });

                console.log("Creating chat session...");
                const session = new LlamaChatSession({
                    contextSequence: context.getSequence()
                });

                // Signal that model is ready
                process.send({ type: 'READY' });

                // Listen for prompts from parent process
                process.on('message', async (data) => {
                    if (data.type === 'PROMPT') {
                        try {
                            console.log("[Engine] Processing Prompt: " + data.prompt.length + " chars...");
                            const startT = Date.now();
                            const response = await session.prompt(data.prompt, {
                                temperature: data.temperature,
                                maxTokens: data.maxTokens,
                                onTextChunk: (chunk) => {
                                    // Streaming token to parent
                                    process.send({
                                        type: 'TOKEN',
                                        id: data.id,
                                        token: chunk
                                    });
                                }
                            });
                            const endT = Date.now();
                            console.log("[Engine] Generation Complete (" + ((endT - startT)/1000).toFixed(2) + "s)");

                            process.send({
                                type: 'RESPONSE',
                                id: data.id,
                                response: response
                            });
                        } catch (error) {
                            process.send({
                                type: 'ERROR',
                                id: data.id,
                                error: error.message
                            });
                        }
                    }
                });
            } catch (error) {
                console.error("Error in model process:", error);
                process.send({ type: 'ERROR', error: error.message });
            }
        }

        startModel();
    `;

    this.process = spawn('node', ['-e', childScript], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        MODEL_PATH: modelPath,
        CTX_SIZE: config.ctx_size || process.env.CTX_SIZE || "2048",
        BATCH_SIZE: config.batch_size || process.env.BATCH_SIZE || "256",
        THREADS: config.threads || process.env.THREADS || "4",
        GPU_LAYERS: config.gpu_layers || process.env.GPU_LAYERS || "0"
      }
    });

    this.process.stdout.on('data', (data) => {
      console.log(`[Llama Engine] ${data.toString().trim()}`);
    });

    this.process.stderr.on('data', (data) => {
      console.error(`[Llama Engine Error] ${data.toString().trim()}`);
    });

    this.process.on('message', (message) => {
      if (message.type === 'READY') {
        console.log("✅ Llama model process is ready!");
        this.ready = true;
      } else if (message.type === 'TOKEN') {
        const queueItem = this.responseQueue.find(item => item.id === message.id);
        if (queueItem && queueItem.onToken) {
          queueItem.onToken(message.token);
        }
      } else if (message.type === 'RESPONSE') {
        const queueItem = this.responseQueue.find(item => item.id === message.id);
        if (queueItem) {
          queueItem.resolve(message.response);
          this.responseQueue = this.responseQueue.filter(item => item.id !== message.id);
        }
      } else if (message.type === 'ERROR') {
        const queueItem = this.responseQueue.find(item => item.id === message.id);
        if (queueItem) {
          queueItem.reject(new Error(message.error));
          this.responseQueue = this.responseQueue.filter(item => item.id !== message.id);
        }
      }
    });

    this.process.on('close', (code) => {
      console.log(`Llama model process exited with code ${code}`);
      if (this.currentModelPath === modelPath) {
        this.ready = false;
        this.process = null;
      }
    });

    // Wait for the model to be ready
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for model to be ready"));
      }, 60000); // 60 seconds timeout
      
      const checkReady = () => {
        if (this.ready) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          setTimeout(checkReady, 500);
        }
      };
      
      checkReady();
    });
  }

  async generate(prompt, options = {}, onToken = null) {
    if (!this.ready) {
      throw new Error("Llama engine is not ready");
    }

    const { temperature = 0.7, maxTokens = 4096 } = options;
    const requestId = Date.now() + Math.random();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Llama generation timeout (300s)"));
      }, 300000);

      this.responseQueue.push({
        id: requestId,
        resolve: (val) => { 
          clearTimeout(timeout); 
          resolve(val); 
        },
        reject: (err) => { 
          clearTimeout(timeout); 
          reject(err); 
        },
        onToken: onToken
      });

      if (this.process) {
        this.process.send({
          type: 'PROMPT', 
          id: requestId, 
          prompt: prompt, 
          temperature: temperature, 
          maxTokens: maxTokens
        });
      } else {
        reject(new Error("Llama process died"));
      }
    });
  }

  async unload() {
    if (this.process) {
      console.log("🛑 Stopping Llama model process...");
      this.process.kill();
      this.process = null;
      this.ready = false;
      this.currentModelPath = null;
    }
  }

  get isReady() {
    return this.ready;
  }

  // currentModelPath getter is already defined above
}