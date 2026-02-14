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

/**
 * Get recent memories from the conversation stream
 * Parses the memory file and returns the N most recent entries
 * @param {number} count - Number of recent entries to return
 * @returns {Promise<Array<{role: string, content: string, timestamp: string}>>}
 */
export async function getRecentMemories(count = 10) {
  try {
    const content = await getMemoryFileContent();
    if (!content) return [];

    const entries = parseConversationStream(content);
    return entries.slice(-count);
  } catch (error) {
    console.error('[Memory] Error getting recent memories:', error);
    return [];
  }
}

/**
 * Get memories filtered by role
 * @param {string} role - Role to filter by (User, Assistant, Tool, Context)
 * @param {number} count - Maximum number of entries to return
 * @returns {Promise<Array<{role: string, content: string, timestamp: string}>>}
 */
export async function getMemoriesByRole(role, count = 10) {
  try {
    const content = await getMemoryFileContent();
    if (!content) return [];

    const entries = parseConversationStream(content);
    return entries.filter(e => e.role.toLowerCase() === role.toLowerCase()).slice(-count);
  } catch (error) {
    console.error('[Memory] Error getting memories by role:', error);
    return [];
  }
}

/**
 * Search memories by term (simple substring match on content)
 * @param {string} term - Search term
 * @param {number} count - Maximum number of results
 * @returns {Promise<Array<{role: string, content: string, timestamp: string}>>}
 */
export async function searchMemories(term, count = 10) {
  try {
    const content = await getMemoryFileContent();
    if (!content) return [];

    const entries = parseConversationStream(content);
    const lowerTerm = term.toLowerCase();
    return entries
      .filter(e => e.content.toLowerCase().includes(lowerTerm))
      .slice(-count);
  } catch (error) {
    console.error('[Memory] Error searching memories:', error);
    return [];
  }
}

/**
 * Clear all memory (resets the memory file to initial state)
 */
export async function clearMemory() {
  try {
    console.log('[Memory] Clearing all memory...');
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
  * Memory cleared and reinitialized.
</insights>

---
# CONVERSATION STREAM

`;
    await fs.writeFile(MEMORY_CONFIG.MEMORY_FILE_PATH, initialContent.trim() + '\n\n');
    console.log('[Memory] Memory cleared successfully.');
  } catch (error) {
    console.error('[Memory] Error clearing memory:', error);
    throw error;
  }
}

/**
 * Get a context window of memories fitting within a token budget
 * @param {number} maxTokens - Maximum token budget
 * @returns {Promise<{memories: Array, totalTokens: number}>}
 */
export async function getMemoryContextWindow(maxTokens = 2048) {
  try {
    const content = await getMemoryFileContent();
    if (!content) return { memories: [], totalTokens: 0 };

    const entries = parseConversationStream(content);
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    // Work backwards from most recent, fitting into budget
    const selected = [];
    let totalChars = 0;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entryChars = entries[i].content.length + entries[i].role.length + 10; // overhead
      if (totalChars + entryChars > maxChars) break;
      selected.unshift(entries[i]);
      totalChars += entryChars;
    }

    return {
      memories: selected,
      totalTokens: Math.ceil(totalChars / CHARS_PER_TOKEN)
    };
  } catch (error) {
    console.error('[Memory] Error getting memory context window:', error);
    return { memories: [], totalTokens: 0 };
  }
}

/**
 * Parse the conversation stream section of the memory file into structured entries
 * @param {string} fileContent - Raw memory file content
 * @returns {Array<{role: string, content: string, timestamp: string}>}
 */
function parseConversationStream(fileContent) {
  const streamMarker = '# CONVERSATION STREAM';
  const streamIndex = fileContent.indexOf(streamMarker);
  if (streamIndex === -1) return [];

  const streamBody = fileContent.substring(streamIndex + streamMarker.length);

  // Split on ## headers (role - timestamp)
  const blockRegex = /^## (\w+)\s*-\s*(\S+)/gm;
  const entries = [];
  let match;
  const positions = [];

  while ((match = blockRegex.exec(streamBody)) !== null) {
    positions.push({
      role: match[1],
      timestamp: match[2],
      start: match.index + match[0].length
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start - positions[i + 1].role.length - positions[i + 1].timestamp.length - 6 : streamBody.length;
    const content = streamBody.substring(positions[i].start, end).trim();
    entries.push({
      role: positions[i].role,
      content,
      timestamp: positions[i].timestamp
    });
  }

  // Also capture > [Context Search] and > [Tool Output] blocks
  const contextRegex = /^> \[(Context Search|Tool Output)\].*?\n([\s\S]*?)(?=\n##|\n>|\s*$)/gm;
  let ctxMatch;
  while ((ctxMatch = contextRegex.exec(streamBody)) !== null) {
    entries.push({
      role: ctxMatch[1] === 'Context Search' ? 'Context' : 'Tool',
      content: ctxMatch[2].trim(),
      timestamp: new Date().toISOString() // Context blocks don't have timestamps
    });
  }

  return entries;
}

// Re-exports (aliases for backward compatibility)
export async function addMemoryEntry(role, content) {
  return addToMemoryFile(role, content);
}