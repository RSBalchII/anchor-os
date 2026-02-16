import { CreateMLCEngine, MLCEngine, type AppConfig } from "@mlc-ai/web-llm";
import { webLLMConfig } from "../config/web-llm-models";

export class WebLLMService {
    private engine: MLCEngine | null = null;
    private modelId: string = "Llama-3-8B-Instruct-q4f32_1-MLC"; // Default, can be overridden
    private progressCallback: (report: { text: string; progress: number }) => void = () => { };

    constructor() { }

    public setProgressCallback(callback: (report: { text: string; progress: number }) => void) {
        this.progressCallback = callback;
    }

    public async initialize(modelId?: string) {
        if (this.engine) return;

        if (modelId) this.modelId = modelId;

        console.log(`[WebLLM] Initializing with model: ${this.modelId}`);

        // Point to our local inference server (which now serves /models)
        // Ensure this matches the AppConfig expectation of WebLLM
        const appConfig: AppConfig = {
            model_list: [
                {
                    "model_id": this.modelId,
                    "model_lib_url": `${window.location.origin}/models/${this.modelId}/model_lib.wasm`, // Adjust if using prebuilt libs
                    "vram_required_MB": 4096,
                    "low_resource_required": false,
                    "model_wasm_path": `${window.location.origin}/models/${this.modelId}/model.wasm`, // If explicit
                }
            ],
            // If strictly using local models, we might rely on the pre-defined list or simplified config
            // For now, let's use the simplest init that tries to fetch from local /models
            useIndexedDBCache: true
        };

        // Actually, WebLLM often defaults to fetching from huggingface. 
        // We want to force it to look at our local /models endpoint.
        // We usually define the model record to point 'local_id' to our url.

        /* 
           Simplified Approach for custom local models: 
           We just pass the Engine the standard config but override paths if possible.
           However, WebLLM's standard `CreateMLCEngine` expects a model_id string that exists in its registry OR a full record.
        */

        try {
            console.log(`[WebLLM] Requested ModelID: ${this.modelId}`);

            // Find specific model config to ensure valid properties
            const modelConfig = webLLMConfig.model_list.find(m => m.model_id === this.modelId);
            console.log(`[WebLLM] Found Config:`, modelConfig);

            // If we have a specific config for this model, we should use it. 
            // Otherwise, we pass the whole config to let WebLLM registry handle it (for prebuilt models)

            // CRITICAL FIX: If we provide a model_list with ONLY model_lib_url, WebLLM might fail if it expects 'model' (weights) url.
            // However, our web-llm-models.ts only provides model_lib_url.
            // If we are using standard models, we should rely on the internal registry where possible.
            // But since we want to enforce specific versions/libs, we pass the config.

            const initConfig: AppConfig = {
                ...webLLMConfig,
                // Only filter if we actually found a config. If not found, pass all (maybe it's a default one)
                model_list: modelConfig ? [modelConfig] : webLLMConfig.model_list
            };

            console.log(`[WebLLM] InitConfig used:`, JSON.stringify(initConfig, null, 2));

            this.engine = await CreateMLCEngine(
                this.modelId,
                {
                    appConfig: initConfig,
                    initProgressCallback: (report) => {
                        console.log(`[WebLLM] Loading: ${report.text}`);
                        this.progressCallback(report);
                    }
                }
            );
            console.log("[WebLLM] Engine Ready");
        } catch (e) {
            console.error("[WebLLM] Init Failed", e);
            throw e;
        }
    }

    public async generate(messages: any[], onUpdate: (current: string) => void) {
        if (!this.engine) throw new Error("Engine not initialized");

        const completion = await this.engine.chat.completions.create({
            messages,
            stream: true,
        });

        let fullText = "";
        for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta.content || "";
            if (delta) {
                fullText += delta;
                onUpdate(fullText);
            }
        }
        return fullText;
    }

    public getEngine() {
        return this.engine;
    }
}

export const webLLMService = new WebLLMService();
