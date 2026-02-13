import { LlamaEngine } from "./engines/LlamaEngine.js";
import { MNNEngine } from "./engines/MNNEngine.js";

export class EngineManager {
  constructor() {
    this.engines = {
      llama: new LlamaEngine(),
      mnn: new MNNEngine()
    };
    
    this.currentEngineName = null;
    this.currentEngine = null;
  }

  /**
   * Initialize the engine manager with a specific engine
   * @param {string} engineName - Name of the engine to use ('llama' or 'mnn')
   */
  async initialize(engineName) {
    if (!this.engines[engineName]) {
      throw new Error(`Unsupported engine: ${engineName}`);
    }
    
    this.currentEngineName = engineName;
    this.currentEngine = this.engines[engineName];
    
    console.log(`Intialized engine manager with ${engineName} engine`);
  }

  /**
   * Switch to a different inference engine
   * @param {string} engineName - Name of the engine to switch to
   * @param {Object} config - Configuration for the new engine
   */
  async switchEngine(engineName, config = {}) {
    if (!this.engines[engineName]) {
      throw new Error(`Unsupported engine: ${engineName}`);
    }
    
    // If we're already using this engine, just return
    if (this.currentEngineName === engineName) {
      return { status: "already_active", engine: engineName };
    }
    
    console.log(`🔄 Switching from ${this.currentEngineName || 'none'} to ${engineName} engine`);
    
    // Unload the current engine if it exists
    if (this.currentEngine) {
      console.log(`.Unloading current ${this.currentEngineName} engine...`);
      await this.currentEngine.unload();
    }
    
    // Set the new engine
    this.currentEngineName = engineName;
    this.currentEngine = this.engines[engineName];
    
    return { status: "switched", from: this.currentEngineName, to: engineName };
  }

  /**
   * Load a model using the current engine
   * @param {string} modelPath - Path to the model file
   * @param {Object} config - Configuration options
   */
  async loadModel(modelPath, config) {
    if (!this.currentEngine) {
      throw new Error("No engine initialized");
    }
    
    return await this.currentEngine.loadModel(modelPath, config);
  }

  /**
   * Generate a response using the current engine
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @param {Function} onToken - Callback for streaming tokens
   */
  async generate(prompt, options = {}, onToken = null) {
    if (!this.currentEngine) {
      throw new Error("No engine initialized");
    }
    
    return await this.currentEngine.generate(prompt, options, onToken);
  }

  /**
   * Unload the current model
   */
  async unload() {
    if (this.currentEngine) {
      return await this.currentEngine.unload();
    }
  }

  /**
   * Get the current engine status
   */
  getStatus() {
    if (!this.currentEngine) {
      return {
        currentEngine: null,
        ready: false,
        currentModel: null
      };
    }
    
    return {
      currentEngine: this.currentEngineName,
      ready: this.currentEngine.isReady,
      currentModel: this.currentEngine.currentModelPath
    };
  }

  /**
   * Get the current engine instance
   */
  getCurrentEngine() {
    return this.currentEngine;
  }

  /**
   * Get the current engine name
   */
  getCurrentEngineName() {
    return this.currentEngineName;
  }
}