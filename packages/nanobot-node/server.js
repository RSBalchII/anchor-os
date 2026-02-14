/**
 * Nanobot Node.js Server
 * 
 * A lightweight, sovereign AI agent that runs locally and connects via Tailscale
 * Based on the ECE_Core inference implementation
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeBrain, chatCompletion, textCompletion, getBrainStatus, disposeBrain, unloadModel, loadModel } from './core/brain.js';
import { executeCommand } from './core/tools.js';
import {
  addToMemoryFile,
  getMemoryFileContent,
  initializeMemory,
  updateStateBlock,
  getRecentMemories,
  searchMemories,
  clearMemory
} from './memory/memory.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { validate, schemas } from './middleware/validate.js';

// Load environment variables
dotenv.config();

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

// Create Express app
const app = express();
app.use(express.json({ limit: '50mb' }));

// Apply API key authentication to /v1 routes
const apiKey = config.server?.api_key || process.env.API_KEY || '';
app.use('/v1', createAuthMiddleware(apiKey));
if (apiKey) {
  console.log('[Auth] API key authentication enabled for /v1 routes');
} else {
  console.log('[Auth] No API key configured — /v1 routes are open');
}

// Configuration with fallbacks to centralized settings
const PORT = parseInt(process.env.PORT || config.server?.port || '8000');
const HOST = process.env.HOST || config.server?.host || '0.0.0.0';

// Initialize the brain when the server starts
async function initializeServer() {
  console.log('[Server] Initializing brain...');

  // Construct the model path using the root directory as reference
  const rootDir = path.join(__dirname, '..', '..'); // Go up twice to reach project root
  const modelDir = config.llm?.model_dir || '../../models';
  const modelFile = config.llm?.chat_model || 'llama-3.2-1b-instruct-q4_k_m.gguf';

  // Resolve the full path from the root directory
  let modelPath;
  if (path.isAbsolute(modelDir)) {
    modelPath = path.join(modelDir, modelFile);
  } else {
    modelPath = path.resolve(rootDir, modelDir, modelFile);
  }

  console.log(`[Server] Using model path: ${modelPath}`);

  const result = await initializeBrain({
    MODEL_PATH: process.env.MODEL_PATH || modelPath,
    MODEL_DIR: path.isAbsolute(modelDir) ? modelDir : path.resolve(rootDir, modelDir),
    CTX_SIZE: parseInt(process.env.CTX_SIZE) || config.llm?.ctx_size || 2048,
    GPU_LAYERS: parseInt(process.env.GPU_LAYERS) || config.llm?.gpu_layers || 0
  });

  if (!result.success) {
    console.error('[Server] Failed to initialize brain:', result.message);
    process.exit(1);
  }

  console.log('[Server] Brain initialized successfully');
}

// Health check endpoint
app.get('/health', (req, res) => {
  const status = getBrainStatus();
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    brain: status
  });
});

// Chat completion endpoint (OpenAI compatible) with Agent Loop
app.post('/v1/chat/completions', validate(schemas.chatCompletions), async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    console.log(`[Server] 📩 Incoming Request: ${messages.length} messages`);

    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    if (lastUserMessage) {
      // 1. Add User Prompt to Memory
      await addToMemoryFile('User', lastUserMessage.content);
    } else {
      return res.status(400).json({ error: 'No user message found' });
    }

    // 2. [Optional] Search Context Injection
    // await addToMemoryFile('Context', ...);

    // 3. Get Full Memory Context (Hybrid Schema)
    const fullContext = await getMemoryFileContent();

    // 4. Construct Prompt
    const promptMessages = [
      {
        role: 'system',
        content: `You are Nanobot, the Anchor OS Sovereign Agent.
Current Time: ${new Date().toISOString()}

INSTRUCTIONS:
1. **Memory**: The text below is your *entire* hybrid memory. Read the XML headers (<state>, <insights>) to ground your persona.
2. **Action**: Use <cmd>...</cmd> for shell commands.
3. **State**: If your task changes, output a <update_state> block at the end of your response:
   <update_state>
     <task>New focus...</task>
     <next_intent>What to do next...</next_intent>
   </update_state>
4. **Flow**: Start your response with [Internal Monologue] if you need to plan.

MEMORY FILE:
${fullContext}`
      },
      { role: 'user', content: "Please respond to the latest entry in the Memory File." }
    ];

    // --- Agent Loop ---
    let loopCount = 0;
    const MAX_LOOPS = 5;
    let finalResponse = null;

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      console.log(`[Agent] Turn ${loopCount}...`);

      const result = await chatCompletion(promptMessages, {
        model, // Pass requested model
        temperature,
        maxTokens: max_tokens
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      const assistantMsg = result.response.choices[0].message;
      const content = assistantMsg.content;

      // Log the thought process snippet
      const thoughtSnippet = content.split('\n')[0].substring(0, 100);
      console.log(`[Agent] 🧠 Thought: "${thoughtSnippet}..."`);

      // A. Check for <update_state>
      const stateMatch = content.match(/<update_state>([\s\S]*?)<\/update_state>/);
      if (stateMatch) {
        console.log('[Agent] 🔄 Detected State Update');
        try {
          // Very simple XML-ish parser
          const inner = stateMatch[1];
          // Extract key-values regex
          const updates = {};
          const tagRegex = /<(\w+)>(.*?)<\/\1>/g;
          let match;
          while ((match = tagRegex.exec(inner)) !== null) {
            updates[match[1]] = match[2];
          }
          if (Object.keys(updates).length > 0) {
            await updateStateBlock(updates);
          }
        } catch (e) { console.error('State parse error', e); }
      }

      // B. Check for <cmd> commands
      const cmdMatch = content.match(/<cmd>(.*?)<\/cmd>/s);

      if (cmdMatch) {
        const command = cmdMatch[1].trim();
        console.log(`[Agent] 🛠️ Executing tool: ${command}`);

        await addToMemoryFile('Assistant', content);

        const output = await executeCommand(command, process.cwd());
        console.log(`[Agent] Tool output: ${output.substring(0, 50)}...`);

        await addToMemoryFile('Tool', output);

        // Refresh Context
        const updatedContext = await getMemoryFileContent();
        promptMessages[0].content = `You are Nanobot...
MEMORY FILE:
${updatedContext}`;

      } else {
        finalResponse = result.response;
        await addToMemoryFile('Assistant', content);
        break;
      }
    }

    if (finalResponse) {
      res.json(finalResponse);
    } else {
      res.status(500).json({ error: "Agent loop limit reached without final response." });
    }

  } catch (error) {
    console.error('[Server] Chat completion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Text completion endpoint
app.post('/v1/completions', validate(schemas.completions), async (req, res) => {
  try {
    const { prompt, model, temperature, max_tokens } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await textCompletion(prompt, {
      temperature,
      maxTokens: max_tokens
    });

    if (result.success) {
      res.json(result.response);
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    console.error('[Server] Text completion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get brain status
app.get('/v1/status', (req, res) => {
  const status = getBrainStatus();
  res.json(status);
});

// Load a specific model
app.post('/v1/model/load', validate(schemas.modelLoad), async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'Model name required' });

    const rootDir = path.join(__dirname, '..', '..');
    const modelDir = config.llm?.model_dir || '../../models';
    let modelPath;
    if (path.isAbsolute(modelDir)) {
      modelPath = path.join(modelDir, model);
    } else {
      modelPath = path.resolve(rootDir, modelDir, model);
    }

    if (!fs.existsSync(modelPath)) {
      return res.status(404).json({ error: `Model not found: ${model}` });
    }

    // Call loadModel from brain
    const result = await loadModel(modelPath);
    res.json(result);
  } catch (error) {
    console.error('[Server] Load error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unload current model
app.post('/v1/model/unload', async (req, res) => {
  try {
    const result = await unloadModel();
    res.json(result);
  } catch (error) {
    console.error('[Server] Unload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get model status
app.get('/v1/model/status', (req, res) => {
  const status = getBrainStatus();
  res.json({
    loaded: status.loaded,
    model: status.model ? path.basename(status.model) : null,
    loading: false // Simplified for now
  });
});

// [DEPRECATED] Chat UI moved to Anchor Engine Dashboard
// app.get('/chat', ...);

// List available models
app.get('/v1/models', (req, res) => {
  try {
    const rootDir = path.join(__dirname, '..', '..');
    const modelDir = config.llm?.model_dir || '../../models';

    let modelPath;
    if (path.isAbsolute(modelDir)) {
      modelPath = modelDir;
    } else {
      modelPath = path.resolve(rootDir, modelDir);
    }

    if (!fs.existsSync(modelPath)) {
      return res.json({ object: 'list', data: [] });
    }

    const files = fs.readdirSync(modelPath).filter(file => file.endsWith('.gguf'));
    const models = files.map(file => ({
      id: file,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'user'
    }));

    res.json({ object: 'list', data: models });
  } catch (error) {
    console.error('[Server] Error listing models:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get memory entries
app.get('/v1/memory/recent/:count?', (req, res) => {
  const count = parseInt(req.params.count) || 10;
  getRecentMemories(count)
    .then(memories => res.json({ memories }))
    .catch(error => {
      console.error('[Server] Memory retrieval error:', error);
      res.status(500).json({ error: error.message });
    });
});

// Search memory
app.post('/v1/memory/search', (req, res) => {
  const { term, count = 10 } = req.body;
  if (!term) {
    return res.status(400).json({ error: 'Search term is required' });
  }

  searchMemories(term, count)
    .then(results => res.json({ results }))
    .catch(error => {
      console.error('[Server] Memory search error:', error);
      res.status(500).json({ error: error.message });
    });
});

// Trigger Dreaming Protocol Manually
app.post('/v1/dream', async (req, res) => {
  try {
    console.log('[Server] Manual Dream triggered...');
    // We need to import pruneAndDream first.
    // Dynamic import to avoid circular dependency issues if any, though memory.js already loaded.
    const { pruneAndDream } = await import('./memory/memory.js');
    await pruneAndDream();
    res.json({ message: 'Dream cycle completed.' });
  } catch (error) {
    console.error('[Server] Manual Dream failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear memory
app.delete('/v1/memory/clear', (req, res) => {
  clearMemory()
    .then(() => res.json({ message: 'Memory cleared successfully' }))
    .catch(error => {
      console.error('[Server] Memory clear error:', error);
      res.status(500).json({ error: error.message });
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  await disposeBrain();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Server] Shutting down gracefully...');
  await disposeBrain();
  process.exit(0);
});

// Start the server
async function startServer() {
  await initializeServer();
  await initializeMemory();

  app.listen(PORT, HOST, () => {
    // Also log the model path in the server startup
    const rootDir = path.join(__dirname, '..', '..'); // Go up twice to reach project root
    const modelDir = config.llm?.model_dir || '../../models';
    const modelFile = config.llm?.chat_model || 'llama-3.2-1b-instruct-q4_k_m.gguf';

    let modelPath;
    if (path.isAbsolute(modelDir)) {
      modelPath = path.join(modelDir, modelFile);
    } else {
      modelPath = path.resolve(rootDir, modelDir, modelFile);
    }

    console.log(`\n🌐 Nanobot Server listening on http://${HOST}:${PORT}`);
    console.log(`   Model: ${process.env.MODEL_PATH || modelPath}`);
    console.log(`   Context Size: ${process.env.CTX_SIZE || config.llm?.ctx_size || '2048'} tokens`);
    console.log(`   GPU Layers: ${process.env.GPU_LAYERS || config.llm?.gpu_layers || '0'}`);
  });
}

// Start the server
startServer().catch(err => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});