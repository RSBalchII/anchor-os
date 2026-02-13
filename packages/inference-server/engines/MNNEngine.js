import { spawn } from "child_process";
import { InferenceEngine } from "./InferenceEngine.js";

export class MNNEngine extends InferenceEngine {
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
      console.log("🛑 Stopping current MNN process...");
      this.process.kill();
      this.process = null;
      this.ready = false;
    }

    console.log(`🚀 Starting MNN Inference Engine...`);
    console.log(`   Model: ${modelPath}`);

    this.currentModelPath = modelPath;

    // Spawn the Python MNN inference script
    this.process = spawn('python', [`${process.cwd()}/mnn_inference.py`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    this.process.stdin.setEncoding('utf-8');

    this.process.stdout.on('data', (data) => {
      // Handle responses from the Python script
      const lines = data.toString().split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (e) {
          console.log(`[MNN Engine] ${line.trim()}`);
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      console.error(`[MNN Engine Error] ${data.toString().trim()}`);
    });

    this.process.on('close', (code) => {
      console.log(`MNN process exited with code ${code}`);
      if (this.currentModelPath === modelPath) {
        this.ready = false;
        this.process = null;
      }
    });

    // Send the load model command to the Python script
    const loadCmd = {
      type: "LOAD_MODEL",
      model_path: modelPath,
      config: config
    };
    
    this.process.stdin.write(JSON.stringify(loadCmd) + '\n');

    // Wait for the model to be ready
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for MNN model to be ready"));
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

  handleMessage(message) {
    const messageType = message.type;
    
    if (messageType === 'READY') {
      console.log("✅ MNN model process is ready!");
      this.ready = true;
    } else if (messageType === 'TOKEN') {
      const token = message.token;
      // Find the corresponding request in the queue and call the onToken callback
      const queueItem = this.responseQueue.find(item => item.awaitingTokens);
      if (queueItem && queueItem.onToken) {
        queueItem.onToken(token);
      }
    } else if (messageType === 'RESPONSE') {
      const response = message.response;
      // Find the corresponding request in the queue and resolve it
      const queueItem = this.responseQueue.find(item => item.awaitingResponse);
      if (queueItem) {
        queueItem.resolve(response);
        this.responseQueue = this.responseQueue.filter(item => item !== queueItem);
      }
    } else if (messageType === 'LOADED') {
      console.log("✅ MNN model loaded successfully");
      this.ready = true;
    } else if (messageType === 'ERROR') {
      const error = message.error;
      console.error(`[MNN Engine Error] ${error}`);
      // Find the corresponding request in the queue and reject it
      const queueItem = this.responseQueue.find(item => item.awaitingResponse || item.awaitingTokens);
      if (queueItem) {
        queueItem.reject(new Error(error));
        this.responseQueue = this.responseQueue.filter(item => item !== queueItem);
      }
    } else if (messageType === 'PONG') {
      // Ping response - not typically used in this context
    }
  }

  async generate(prompt, options = {}, onToken = null) {
    if (!this.ready) {
      throw new Error("MNN engine is not ready");
    }

    const { temperature = 0.7, maxTokens = 512 } = options;
    const requestId = Date.now() + Math.random();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MNN generation timeout (300s)"));
      }, 300000);

      // Add to response queue
      const queueItem = {
        id: requestId,
        resolve: (val) => { 
          clearTimeout(timeout); 
          resolve(val); 
        },
        reject: (err) => { 
          clearTimeout(timeout); 
          reject(err); 
        },
        onToken: onToken,
        awaitingResponse: true,
        awaitingTokens: true
      };
      
      this.responseQueue.push(queueItem);

      // Send generate command to Python script
      const generateCmd = {
        type: "GENERATE",
        prompt: prompt,
        temperature: temperature,
        max_tokens: maxTokens
      };
      
      this.process.stdin.write(JSON.stringify(generateCmd) + '\n');
    });
  }

  async unload() {
    if (this.process) {
      console.log("🛑 Stopping MNN process...");

      // Send unload command to Python script
      const unloadCmd = { type: "UNLOAD" };
      this.process.stdin.write(JSON.stringify(unloadCmd) + '\n');

      // Wait a bit for the command to be processed
      await new Promise(resolve => setTimeout(resolve, 500));

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