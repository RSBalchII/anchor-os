import { fileURLToPath } from "url";
import path from "path";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runBenchmark() {
    try {
        console.log("🚀 Starting Inference Benchmark (CPU Check)...");

        const modelPath = process.env.MODEL_PATH;
        if (!modelPath) {
            throw new Error("MODEL_PATH not set in .env");
        }

        console.log(`   Model: ${modelPath}`);
        console.log("   Loading Llama Runtime (Force CPU)...");

        // Initialize Llama (Force CPU)
        const llama = await getLlama({ gpu: false });

        console.log("   Loading Model File...");
        const model = await llama.loadModel({
            modelPath: modelPath,
        });

        console.log("   Creating Context (2048)...");
        const context = await model.createContext({
            contextSize: 2048,
            gpuLayers: 0,
            threads: 4 // Explicitly set threads for stability check
        });

        console.log("   Creating Session...");
        const session = new LlamaChatSession({
            contextSequence: context.getSequence()
        });

        console.log("\n🧪 Running Prompt: 'Explain quantum computing in one sentence.'");

        const start = Date.now();
        let tokens = 0;

        process.stdout.write("   Output: ");

        const response = await session.prompt("Explain quantum computing in one sentence.", {
            maxTokens: 50,
            onTextChunk: (chunk) => {
                process.stdout.write(chunk);
                tokens++;
            }
        });

        const end = Date.now();
        const duration = (end - start) / 1000;
        const tokensPerSec = tokens / duration;

        console.log(`\n\n✅ Benchmark Complete!`);
        console.log(`   Time: ${duration.toFixed(2)}s`);
        console.log(`   Tokens: ${tokens}`);
        console.log(`   Speed: ${tokensPerSec.toFixed(2)} t/s`);

    } catch (error) {
        console.error("\n❌ Benchmark Failed:", error);
    }
}

runBenchmark();
