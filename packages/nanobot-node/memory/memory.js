/**
 * Memory Management System for Nanobot (Phase 2: Hybrid Architecture)
 * 
 * Implements a persistent rolling context window using a Hybrid XML/Markdown file.
 * Features:
 * - XML Control Plane (<system>, <state>, <insights>)
 * - Markdown Conversation Stream
 * - Dreaming Protocol (Recursive Summarization)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { textCompletion } from '../core/brain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memory configuration
export const MEMORY_CONFIG = {
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH || path.join(__dirname, '..', 'memory.md'),
  CONTEXT_WINDOW_SIZE: parseInt(process.env.CONTEXT_WINDOW_SIZE) || 2048, // Total tokens
  PRUNE_THRESHOLD: 0.7 // Prune/Dream when file exceeds 70% of context
};

// Rough token estimation (1 token approx 4 chars)
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MEMORY_CONFIG.CONTEXT_WINDOW_SIZE * CHARS_PER_TOKEN * MEMORY_CONFIG.PRUNE_THRESHOLD;

/**
 * Initialize the memory system with Hybrid Schema
 */
export async function initializeMemory() {
  try {
    await fs.access(MEMORY_CONFIG.MEMORY_FILE_PATH);
    console.log(`[Memory] Memory file found at ${MEMORY_CONFIG.MEMORY_FILE_PATH}`);
    // Optional: Validate schema or migrate if needed
  } catch (error) {
    console.log('[Memory] Creating new memory file with Hybrid Schema...');
    const initialContent = `
<system>
  <prime_directive>You are the Anchor OS Sovereign Agent.</prime_directive>
  <mode>Universal</mode>
</system>

<state>
  <task>Initializing</task>
  <tools>["node-llama-cpp", "fs", "terminal"]</tools>
  <next_intent>Await user command.</next_intent>
</state>

<insights>
  * Memory initialized.
</insights>

---
# CONVERSATION STREAM

`;
    await fs.writeFile(MEMORY_CONFIG.MEMORY_FILE_PATH, initialContent.trim() + '\n\n');
  }
}

/**
 * Get the full content of the memory file
 */
export async function getMemoryFileContent() {
  try {
    const content = await fs.readFile(MEMORY_CONFIG.MEMORY_FILE_PATH, 'utf8');
    // console.log(`[Memory] 📖 Read context (${content.length} chars)`); // Verbose but useful
    return content;
  } catch (error) {
    console.error('[Memory] ❌ Error reading memory file:', error);
    return '';
  }
}

/**
 * Update the <state> block in the memory file
 * @param {object} newState - Object containing key-value pairs for state
 */
export async function updateStateBlock(newState) {
  try {
    let content = await getMemoryFileContent();

    // Construct new state XML
    let stateXML = '<state>\n';
    for (const [key, value] of Object.entries(newState)) {
      stateXML += `  <${key}>${value}</${key}>\n`;
    }
    stateXML += '</state>';

    // Regex replace the existing <state> block
    if (content.includes('<state>')) {
      content = content.replace(/<state>[\s\S]*?<\/state>/, stateXML);
    } else {
      // Insert after system if missing
      content = content.replace('</system>', `</system>\n\n${stateXML}`);
    }

    await fs.writeFile(MEMORY_CONFIG.MEMORY_FILE_PATH, content);
    console.log('[Memory] 🔄 State updated via XML.');
  } catch (error) {
    console.error('[Memory] ❌ Error updating state:', error);
  }
}

/**
 * Update the <insights> block (appends new bullet points)
 * @param {string[]} newInsights - Array of insight strings
 */
export async function appendInsights(newInsights) {
  try {
    let content = await getMemoryFileContent();

    // Find insights block
    const match = content.match(/<insights>([\s\S]*?)<\/insights>/);
    if (match) {
      let currentInsights = match[1].trim();
      const newPoints = newInsights.map(i => `  * ${i}`).join('\n');
      const updatedInsights = `<insights>\n${currentInsights}\n${newPoints}\n</insights>`;
      content = content.replace(/<insights>[\s\S]*?<\/insights>/, updatedInsights);
      await fs.writeFile(MEMORY_CONFIG.MEMORY_FILE_PATH, content);
    }
  } catch (error) {
    console.error('[Memory] Error appending insights:', error);
  }
}

/**
 * Add a new entry to the memory file (Analysis & Pruning included)
 */
export async function addToMemoryFile(role, content) {
  const timestamp = new Date().toISOString();
  let formattedEntry = '';

  if (role === 'Context') {
    formattedEntry = `> [Context Search] Found:\n${content}\n\n`;
  } else if (role === 'Tool') {
    formattedEntry = `> [Tool Output]\n${content}\n\n`;
  } else if (role === 'Assistant') {
    // Check for [Internal Monologue] - if missing, maybe add it? 
    // relying on server.js to format this mostly.
    formattedEntry = `## ${role} - ${timestamp}\n${content}\n\n`;
  } else {
    // User
    formattedEntry = `## ${role} - ${timestamp}\n${content}\n\n`;
  }

  try {
    console.log(`[Memory] ✍️ Appending ${role}...`);
    await fs.appendFile(MEMORY_CONFIG.MEMORY_FILE_PATH, formattedEntry);
    await pruneAndDream(); // The "Dreaming" Protocol
  } catch (error) {
    console.error('[Memory] ❌ Error appending to memory:', error);
  }
}

/**
 * Phase 2 Pruning: "The Dreaming Protocol"
 * If size > threshold:
 * 1. Identify oldest conversation blocks.
 * 2. (Future) Summarize them into <insights>.
 * 3. Delete them from the stream.
 */
export async function pruneAndDream() {
  try {
    let content = await fs.readFile(MEMORY_CONFIG.MEMORY_FILE_PATH, 'utf8');

    if (content.length <= MAX_CHARS) {
      return;
    }

    console.log(`[Memory] Pruning/Dreaming triggered (Size: ${content.length})...`);

    // Split key sections
    const streamMarker = '\n# CONVERSATION STREAM\n';
    const streamIndex = content.indexOf(streamMarker);

    if (streamIndex === -1) return; // Malformed file

    const headerSection = content.substring(0, streamIndex + streamMarker.length);
    let streamBody = content.substring(streamIndex + streamMarker.length);

    // Pruning Strategy: Remove oldest '## Role' blocks from streamBody
    while (headerSection.length + streamBody.length > MAX_CHARS) {
      // Find next block
      const nextSplit = streamBody.indexOf('\n##', 3);
      if (nextSplit === -1) break; // Start of stream

      // Identification of the block we are about to delete (for potential dreaming)
      const blockToRemove = streamBody.substring(0, nextSplit);

      // DREAMING PROTOCOL: Summarize before deleting
      try {
        console.log('[Memory] 🌙 Dreaming on old memory block...');
        const prompt = `Summarize the following conversation snippet into a single concise insight bullet point. Preserve key facts, names, or decisions. Ignore pleasantries.

TEXT:
${blockToRemove}

INSIGHT:`;

        const dreamResult = await textCompletion(prompt, {
          maxTokens: 100,
          temperature: 0.3
        });

        if (dreamResult.success) {
          const insight = dreamResult.response.choices[0].text.trim();
          if (insight && insight.length > 5) {
            console.log(`[Memory] ✨ Dream Insight: "${insight}"`);
            await appendInsights([insight]);
          }
        }
      } catch (dreamError) {
        console.error('[Memory] Dreaming failed, discarding block:', dreamError);
      }

      streamBody = streamBody.substring(nextSplit);
    }

    await fs.writeFile(MEMORY_CONFIG.MEMORY_FILE_PATH, headerSection + streamBody);
    console.log(`[Memory] Pruned to ${headerSection.length + streamBody.length} chars.`);

  } catch (error) {
    console.error('[Memory] Error in Dream Cycle:', error);
  }
}

// Re-exports
export async function addMemoryEntry(role, content) {
  return addToMemoryFile(role, content);
}
export async function getMemoryContextWindow() {
  return { memories: [] };
}