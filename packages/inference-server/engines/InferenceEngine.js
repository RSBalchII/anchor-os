/**
 * Abstract base class for inference engines
 */
export class InferenceEngine {
  /**
   * Load a model
   * @param {string} modelPath - Path to the model file
   * @param {Object} config - Configuration options
   * @returns {Promise<boolean>} - Whether the model was loaded successfully
   */
  async loadModel(modelPath, config) {
    throw new Error("loadModel method must be implemented by subclass");
  }

  /**
   * Generate a response from the model
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options (temperature, max_tokens, etc.)
   * @param {Function} onToken - Callback for streaming tokens
   * @returns {Promise<string>} - Generated response
   */
  async generate(prompt, options = {}, onToken = null) {
    throw new Error("generate method must be implemented by subclass");
  }

  /**
   * Unload the current model
   * @returns {Promise<void>}
   */
  async unload() {
    throw new Error("unload method must be implemented by subclass");
  }

  /**
   * Check if the engine is ready
   * @returns {boolean} - Whether the engine is ready
   */
  get isReady() {
    throw new Error("isReady getter must be implemented by subclass");
  }

  /**
   * Get the current model path
   * @returns {string|null} - Current model path or null if none loaded
   */
  get currentModelPath() {
    throw new Error("currentModelPath getter must be implemented by subclass");
  }
}