import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import { EngineManager } from "./EngineManager.js";

// Load Environment Variables
dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load centralized configuration from root
let config = {};
const configPath = path.join(__dirname, '..', '..', 'user_settings.json');
if (fs.existsSync(configPath)) {
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`[Config] Loaded settings from ${configPath}`);
    } catch (e) {
        console.error(`[Config] Failed to load settings from ${configPath}:`, e);
    }
}

// Configuration with fallbacks
const PORT = parseInt(process.env.PORT || config.server?.port || "3001");
const HOST = process.env.HOST || config.server?.host || "0.0.0.0";

// Construct the model path using the root directory as reference
const rootDir = path.join(__dirname, '..', '..'); // Go up twice to reach project root
const modelDir = config.llm?.model_dir || '../../models';
const modelFile = config.llm?.chat_model || '';
let MODEL_PATH;
if (path.isAbsolute(modelDir)) {
    MODEL_PATH = path.join(modelDir, modelFile);
} else {
    MODEL_PATH = path.resolve(rootDir, modelDir, modelFile);
}
const ECE_REMOTE_URL = process.env.ECE_REMOTE_URL || config.llm?.remote_url || 'http://localhost:3160/v1/memory/search';

// Initialize the engine manager with the configured engine
const engineManager = new EngineManager();
const selectedEngine = config.llm?.inference_engine || 'llama'; // Default to llama for backward compatibility
console.log(`[Engine Manager] Initializing with ${selectedEngine} engine`);
await engineManager.initialize(selectedEngine);

// Store for active model processes
let modelReady = false;
let currentModelPath = null; // Track currently loaded model

const ensureModelReady = (req, res, next) => {
    // If model load is requested via body, we might need to wait
    // But basic check:
    const currentEngine = engineManager.getCurrentEngine();
    if (currentEngine && !currentEngine.isReady) {
        return res.status(503).json({
            error: "Model is loading, please wait...",
            retry_after: 5
        });
    }
    next();
};

// Implement GET /v1/models
app.get('/v1/models', async (req, res) => {
    try {
        const modelsDir = process.env.MODELS_DIR || path.dirname(MODEL_PATH);
        import('fs').then(fs => {
            if (fs.existsSync(modelsDir)) {
                const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.gguf'));
                const data = files.map(f => ({
                    id: f, // Use filename as ID
                    object: "model",
                    created: Math.floor(Date.now() / 1000),
                    owned_by: "user",
                    permission: []
                }));
                // Add aliases or "current" indicator if useful?
                // For compatibility, just return the list.
                res.json({ object: "list", data: data });
            } else {
                res.json({ object: "list", data: [] });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Implement POST /v1/model/load
app.post('/v1/model/load', async (req, res) => {
    try {
        const { model } = req.body;
        if (!model) {
            return res.status(400).json({ error: "Model name is required" });
        }

        const cleanModelId = model.replace(/^openai\//, '');
        const modelsDir = process.env.MODELS_DIR || path.dirname(MODEL_PATH);
        const requestedPath = path.resolve(modelsDir, cleanModelId);

        import('fs').then(fs => {
            if (fs.existsSync(requestedPath)) {
                // Use the engine manager to load the model
                engineManager.loadModel(requestedPath, config.llm || {})
                    .then(() => {
                        // Update our tracking variables
                        currentModelPath = requestedPath;
                        modelReady = true;
                        res.json({ status: "loading", model: cleanModelId });
                    })
                    .catch(error => {
                        console.error("Error loading model:", error);
                        res.status(500).json({ error: error.message });
                    });
            } else {
                res.status(404).json({ error: `Model file not found: ${cleanModelId}` });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Implement POST /v1/model/unload
app.post('/v1/model/unload', async (req, res) => {
    try {
        // Use the engine manager to unload the model
        await engineManager.unload();
        modelReady = false;
        currentModelPath = null;
        res.json({ status: "unloaded" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Implement GET /v1/model/status
app.get('/v1/model/status', (req, res) => {
    const status = engineManager.getStatus();
    res.json({
        ready: status.ready,
        loading: !status.ready && status.currentModel !== null, // If has model but not ready, it's loading
        current_model: status.currentModel ? path.basename(status.currentModel) : null,
        engine: status.currentEngine
    });
});

// OpenAI-compatible chat completion endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        let { messages, model, temperature = 0.7, max_tokens = 4096 } = req.body;

        // Dynamic Loading Logic
        if (model) {
            // Clean up model ID (remove 'openai/' prefix if sent by OpenClaw)
            const cleanModelId = model.replace(/^openai\//, '');

            // Check if we need to switch
            const modelsDir = process.env.MODELS_DIR || path.dirname(MODEL_PATH);
            const requestedPath = path.resolve(modelsDir, cleanModelId);

            // Simple check: if filename differs from current basename
            // (Assuming cleanModelId is just the filename for local models)
            const currentBase = currentModelPath ? path.basename(currentModelPath) : null;

            if ((!currentBase || cleanModelId !== currentBase) && cleanModelId.endsWith('.gguf')) {
                console.log(`🔄 Switching model from ${currentBase} to ${cleanModelId}`);

                try {
                    const fs = await import('fs');
                    if (fs.existsSync(requestedPath)) {
                        await engineManager.loadModel(requestedPath, config.llm || {});
                        currentModelPath = requestedPath;
                        modelReady = true;
                        processRequest();
                    } else {
                        res.status(404).json({ error: `Model file not found: ${cleanModelId}` });
                    }
                } catch (e) {
                    console.error("Error switching model:", e);
                    res.status(500).json({ error: `Failed to switch model: ${e.message}` });
                }
                return;
            }
        }

        // If no model is loaded and no model specified in request, fail
        if (!currentModelPath && !model) {
            return res.status(400).json({ error: "No model loaded and no model specified." });
        }

        // If no switch needed, proceed immediately
        processRequest();

        async function processRequest() {
            const currentEngine = engineManager.getCurrentEngine();
            if (!currentEngine || !currentEngine.isReady) {
                return res.status(503).json({ error: "Model loading...", retry_after: 2 });
            }

            // INJECT SYSTEM PROMPT FOR TOOLS
            const toolSystemMsg = {
                role: 'system',
                content: `[TOOL CAPABILITY]: You have access to a semantic database (ECE).
    To search for information, output a search query wrapped in tags like this: <search>your query here</search>.
    Stop generating after outputting the tag.
    When you receive the search results, answer the user's question using that information.`
            };

            // Initialize SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const effectiveMessages = [toolSystemMsg, ...messages];
            const MAX_TURNS = 5;
            let turn = 0;

            (async () => {
                while (turn < MAX_TURNS) {
                    turn++;
                    console.log(`\n🔄 Turn ${turn}`);

                    let bufferedResponse = "";

                    try {
                        // Generate response using the current engine
                        const response = await currentEngine.generate(
                            effectiveMessages.map(msg => {
                                const role = msg.role || 'user';
                                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
                                if (role === 'system') return `<|system|>\n${content}`;
                                if (role === 'user') return `<|user|>\n${content}`;
                                if (role === 'assistant') return `<|assistant|>\n${content}`;
                                return `${role.charAt(0).toUpperCase() + role.slice(1)}: ${content}`;
                            }).join('\n\n') + '\n\n<|assistant|>\n',
                            { temperature, maxTokens: max_tokens },
                            (token) => {
                                // Stream token to client
                                const chunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: model || "remote-inference",
                                    choices: [{ index: 0, delta: { content: token }, finish_reason: null }]
                                };
                                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                                bufferedResponse += token;
                            }
                        );

                        // If we got a response, add it to the buffer
                        if (response && typeof response === 'string') {
                            bufferedResponse += response;
                        }

                        // Check for Tools
                        const searchMatch = bufferedResponse.match(/<search>(.*?)<\/search>/s);

                        if (searchMatch) {
                            const query = searchMatch[1].trim();
                            console.log(`🔍 Tool Call: Search("${query}") calling ${ECE_REMOTE_URL}`);

                            try {
                                if (!ECE_REMOTE_URL) throw new Error("ECE_REMOTE_URL not configured");

                                const searchRes = await fetch(ECE_REMOTE_URL, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ query: query, deep: false })
                                });

                                if (!searchRes.ok) throw new Error(`ECE Error: ${searchRes.statusText}`);

                                const searchJson = await searchRes.json();
                                let toolResult = "";

                                if (searchJson.results && searchJson.results.length > 0) {
                                    // 1. Sort by Date (Oldest to Newest)
                                    const sortedResults = searchJson.results.sort((a, b) => {
                                        return (a.timestamp || 0) - (b.timestamp || 0);
                                    });

                                    // 2. Format with larger context (Fit ~2k tokens / ~8000 chars)
                                    let currentLength = 0;
                                    const MAX_CONTEXT_CHARS = 8000;

                                    const formattedResults = sortedResults.map(r => {
                                        if (currentLength >= MAX_CONTEXT_CHARS) return null;

                                        // Use up to 500 chars per memory, or more if few results
                                        const contentSnippet = r.content.substring(0, 500);
                                        const dateStr = r.timestamp ? new Date(r.timestamp).toISOString() : 'unknown';
                                        const entry = `- [${dateStr}] ${contentSnippet}...`;

                                        if (currentLength + entry.length > MAX_CONTEXT_CHARS) return null;

                                        currentLength += entry.length;
                                        return entry;
                                    }).filter(Boolean);

                                    toolResult = `[Found ${formattedResults.length} memories (Chronological)]: \n` +
                                        formattedResults.join('\n');
                                } else {
                                    toolResult = `[No memories found for "${query}"]`;
                                }

                                effectiveMessages.push({ role: 'assistant', content: bufferedResponse });
                                effectiveMessages.push({ role: 'system', content: `TOOL OUTPUT: ${toolResult}\nNow answer.` });
                                continue;

                            } catch (e) {
                                console.error("❌ Context Retrieval Failed", e.message);
                                effectiveMessages.push({ role: 'assistant', content: bufferedResponse });
                                effectiveMessages.push({ role: 'system', content: `TOOL ERROR: Context Database Unreachable.` });
                                continue;
                            }
                        } else {
                            break;
                        }
                    } catch (err) {
                        console.error("❌ Generation Error:", err);
                        throw err;
                    }
                }
                res.write('data: [DONE]\n\n');
                res.end();
            })().catch(error => {
                console.error("❌ Error:", error);
                if (!res.headersSent) res.status(500).json({ error: error.message });
                else res.end();
            });
        }

    } catch (error) {
        console.error("❌ Error:", error);
        if (!res.headersSent) res.status(500).json({ error: error.message });
        else res.end();
    }
});

// Implement POST /v1/engine/switch
app.post('/v1/engine/switch', async (req, res) => {
    try {
        const { engine, model } = req.body;

        if (!engine) {
            return res.status(400).json({ error: "Engine name is required" });
        }

        if (!['llama', 'mnn'].includes(engine)) {
            return res.status(400).json({ error: "Supported engines: 'llama', 'mnn'" });
        }

        // Perform the engine switch
        const result = await engineManager.switchEngine(engine, config.llm || {});

        // If a model was specified, load it with the new engine
        if (model) {
            const cleanModelId = model.replace(/^openai\//, '');
            const modelsDir = process.env.MODELS_DIR || path.dirname(MODEL_PATH);
            const requestedPath = path.resolve(modelsDir, cleanModelId);

            const fs = await import('fs');
            if (fs.existsSync(requestedPath)) {
                await engineManager.loadModel(requestedPath, config.llm || {});
                currentModelPath = requestedPath;
                modelReady = true;

                result.loaded_model = cleanModelId;
            } else {
                result.warning = `Model file not found: ${cleanModelId}`;
            }
        }

        res.json(result);
    } catch (e) {
        console.error("Error switching engine:", e);
        res.status(500).json({ error: e.message });
    }
});

// Implement GET /v1/engine/status
app.get('/v1/engine/status', (req, res) => {
    const status = engineManager.getStatus();
    res.json(status);
});

// Serve static "Nano-Console" HTML file at /chat - REMOVED (Consolidated into Anchor UI)
// app.get('/chat', (req, res) => { ... });


app.listen(PORT, HOST, () => {
    console.log(`\n🌐 Sovereign Inference Server listening on http://${HOST}:${PORT}`);
    console.log(`   Linked to ECE Core at: ${ECE_REMOTE_URL || "NOT SET"}`);
});
