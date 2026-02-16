import type { AppConfig, ModelRecord } from "@mlc-ai/web-llm";

/**
 * Configuration for WebLLM Models.
 * Add models here to make them available in the UI.
 * 
 * You can point 'model_lib_url' and 'local_id' to local paths if you are hosting 
 * models on your own server (e.g., /models/my-model/...), 
 * or use the default HuggingFace URLs.
 */
export const webLLMConfig: AppConfig = {
    useIndexedDBCache: true,
    model_list: [
        // --- DEEPSEEK FAMILY ---
        {
            "model": "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
            "model_id": "DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC/DeepSeek-R1-Distill-Llama-8B-q4f32_1-ctx4k_cs1k-webgpu.wasm",
            "vram_required_MB": 6101,
            "low_resource_required": false,
        },
        // --- QWEN 2.5 FAMILY ---
        {
            "model": "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct",
            "model_id": "Qwen2.5-7B-Instruct-q4f32_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2.5-7B-Instruct-q4f32_1-MLC/Qwen2.5-7B-Instruct-q4f32_1-ctx32k_cs1k-webgpu.wasm",
            "vram_required_MB": 5100, // Est
            "low_resource_required": false,
        },
        {
            "model": "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct",
            "model_id": "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2.5-1.5B-Instruct-q4f32_1-MLC/Qwen2.5-1.5B-Instruct-q4f32_1-ctx32k_cs1k-webgpu.wasm",
            "vram_required_MB": 1200,
            "low_resource_required": true,
        },
        // --- GEMMA 2 FAMILY ---
        {
            "model": "https://huggingface.co/google/gemma-2-9b-it",
            "model_id": "gemma-2-9b-it-q4f32_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-9b-it-q4f32_1-MLC/gemma-2-9b-it-q4f32_1-ctx4k_cs1k-webgpu.wasm",
            "vram_required_MB": 6500,
            "low_resource_required": false,
        },
        {
            "model": "https://huggingface.co/google/gemma-2-2b-it",
            "model_id": "gemma-2-2b-it-q4f32_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-2-2b-it-q4f32_1-MLC/gemma-2-2b-it-q4f32_1-ctx4k_cs1k-webgpu.wasm",
            "vram_required_MB": 1800,
            "low_resource_required": true,
        },
        // --- LLAMA 3 FAMILY ---
        {
            "model": "https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f32_1-MLC",
            "model_id": "Llama-3-8B-Instruct-q4f32_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3-8B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
            "vram_required_MB": 6144,
            "low_resource_required": false,
        },
        // --- PHI FAMILY ---
        {
            "model": "https://huggingface.co/microsoft/Phi-3.5-mini-instruct",
            "model_id": "Phi-3.5-mini-instruct-q4f16_1-MLC",
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Phi-3.5-mini-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
            "vram_required_MB": 3072,
            "low_resource_required": true,
        },
    ]
};
