/**
 * Search Orchestrator — "The Brain"
 *
 * Core search orchestration, Tag-Walker physics engine, engram lookup,
 * and result merging. All NLP parsing lives in query-parser.ts ("The Ears"),
 * utilities in search-utils.ts ("The Tools"), and graph reasoning in
 * bright-nodes.ts ("The Illuminator").
 *
 * Standard 086 Compliant.
 */

import { db } from '../../core/db.js';
import { createHash } from 'crypto';
import { config } from '../../config/index.js';
import { SemanticCategory } from '../../types/taxonomy.js';
import { ContextInflator } from './context-inflator.js';
import { Timer } from '../../utils/timer.js';

// --- Imports from extracted modules ---
import {
  nlp, isExpansionReady, semanticExpand,
  getGlobalTags, expandQuery, sanitizeFtsQuery,
  parseNaturalLanguage, extractKeyTermsFromConversation,
  extractTemporalContext, splitQueryIntoMolecules, parseQuery,
  expandConversationalQuery, getRelatedTagsForQuery
} from './query-parser.js';

import {
  SearchResult,
  getHammingDistance, getItems, formatResults, filterDisplayTags
} from './search-utils.js';

// Re-export everything that external consumers need
export { SearchResult, getGlobalTags, filterDisplayTags, parseQuery, splitQueryIntoMolecules };
export type { BrightNode, BrightNodeRelationship } from './bright-nodes.js';
export { getBrightNodes, getStructuredGraph } from './bright-nodes.js';

/**
 * Create or update an engram (lexical sidecar) for fast entity lookup
 */
export async function createEngram(key: string, memoryIds: string[]): Promise<void> {
  const normalizedKey = key.toLowerCase().trim();
  const engramId = createHash('md5').update(normalizedKey).digest('hex');

  const insertQuery = `INSERT INTO engrams (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await db.run(insertQuery, [engramId, JSON.stringify(memoryIds)]);
}

/**
 * Lookup memories by engram key (O(1) operation)
 */
export async function lookupByEngram(key: string): Promise<string[]> {
  const normalizedKey = key.toLowerCase().trim();
  const engramId = createHash('md5').update(normalizedKey).digest('hex');

  const query = `SELECT value FROM engrams WHERE key = $1`;
  const result = await db.run(query, [engramId]);

  if (result.rows && result.rows.length > 0) {
    return JSON.parse(result.rows[0][0] as string);
  }

  return [];
}

/**
 * Tag-Walker Associative Search (Replaces Vector Search)
 */
export async function tagWalkerSearch(
  query: string,
  buckets: string[] = [],
  tags: string[] = [],
  _maxChars: number = config.SEARCH.max_chars_default,
  provenance: 'internal' | 'external' | 'quarantine' | 'all' = 'all',
  filters?: { type?: string; minVal?: number; maxVal?: number; },
  fuzzy: boolean = false
): Promise<SearchResult[]> {
  try {
    const sanitizedQuery = sanitizeFtsQuery(query);
    if (!sanitizedQuery) return [];

    // 0. Dynamic Atom Scaling (Standard 069 update)
    // User Requirement: Scale atoms with token budget.
    // Heuristic: 2k tokens -> ~10 atoms. 4k -> ~20 atoms. Min 5.
    // Ratio: 70% Direct (Anchor), 30% Associative (Walk).
    const tokenBudget = Math.floor(_maxChars / 4);
    const avgTokensPerAtom = 200;
    const targetAtomCount = Math.max(5, Math.ceil(tokenBudget / avgTokensPerAtom));

    // Split 70/30
    const anchorLimit = Math.ceil(targetAtomCount * 0.70);
    const walkLimit = Math.max(2, Math.floor(targetAtomCount * 0.30)); // Ensure at least 2 for walk if possible

    console.log(`[Search] Dynamic Scaling: Budget=${tokenBudget}t -> Target=${targetAtomCount} atoms (Anchor: ${anchorLimit}, Walk: ${walkLimit})`);

    // 1. Dual-Strategy Anchor Search
    // Strategy A: Atom Positions (Radial Inflation) - Finds Entities/Tags
    // Strategy B: Molecules FTS (Content Search) - Finds general text (e.g. "limerance")

    // Construct Query String for FTS
    let tsQueryString = sanitizedQuery.trim();
    if (fuzzy) {
      tsQueryString = tsQueryString.split(/\s+/).join(' | ');
    } else {
      tsQueryString = tsQueryString.split(/\s+/).join(' & ');
    }

    // Check for chronological sort intent & temporal ranges (needed for both Molecule sort and Walk sort)
    const queryLower = sanitizedQuery.toLowerCase();
    const hasTemporalRange = /\b(from|between)\s+\d{4}\s+(to|and)\s+\d{4}\b/.test(queryLower);

    let anchors: SearchResult[] = [];

    // A. Atom Search (Radial Inflation)
    const terms = sanitizedQuery.split(/\s+/).filter(t => t.length > 2);
    const atomResults: SearchResult[] = [];

    // Quick check if query terms exist as atoms
    if (terms.length > 0) {
      // Use efficient parallel lookup
      const inflations = await Promise.all(
        terms.map(term => ContextInflator.inflateFromAtomPositions(term, 150, 5))
      );
      atomResults.push(...inflations.flat());
    }

    // B. Molecule Search (Full-Text)
    let moleculeQuery = `
        SELECT m.id, m.content, c.path as source, m.timestamp,
               '{}'::text[] as buckets, '{}'::text[] as tags, 'epoch_placeholder' as epochs, c.provenance,
               ts_rank(to_tsvector('simple', m.content), to_tsquery('simple', $1)) * 10 as score,
               m.sequence, m.molecular_signature,
               m.start_byte, m.end_byte, m.type, m.numeric_value, m.numeric_unit, m.compound_id
        FROM molecules m
        JOIN compounds c ON m.compound_id = c.id
        WHERE to_tsvector('simple', m.content) @@ to_tsquery('simple', $1)
    `;

    const moleculeParams: any[] = [tsQueryString];

    // Apply filters to molecules query
    if (provenance !== 'all' && provenance !== 'quarantine') {
      moleculeQuery += ` AND c.provenance = $${moleculeParams.length + 1}`;
      moleculeParams.push(provenance);
    } else if (provenance === 'all') {
      moleculeQuery += ` AND c.provenance != 'quarantine'`;
    }

    // Limit molecule results
    moleculeQuery += ` ORDER BY score DESC LIMIT 20`;

    try {
      const molResult = await db.run(moleculeQuery, moleculeParams);
      const molecules = (molResult.rows || []).map((row: any[]) => ({
        id: row[0],
        content: row[1],
        source: row[2],
        timestamp: row[3],
        buckets: row[4],
        tags: row[5],
        epochs: row[6],
        provenance: row[7],
        score: row[8],
        sequence: row[9],
        molecular_signature: row[10],
        start_byte: row[11],
        end_byte: row[12],
        type: row[13],
        numeric_value: row[14],
        numeric_unit: row[15],
        compound_id: row[16]
      }));

      anchors = [...atomResults, ...molecules];

      // Deduplicate anchors
      const seen = new Set<string>();
      anchors = anchors.filter(a => {
        const key = `${a.compound_id}_${a.start_byte}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`[Search] Anchors found: ${atomResults.length} Atoms, ${molecules.length} Molecules. Total Unique: ${anchors.length}`);

    } catch (e) {
      console.error('[Search] Molecule search failed:', e);
      anchors = atomResults;
    }

    if (anchors.length === 0) return [];

    // 2. The Walk (Associative Discovery)
    const validAnchorIds = anchors
      .filter(a => !a.id.startsWith('virtual_') && !a.id.startsWith('mol_') && !a.id.includes('_')) // basic heuristic for UUIDs
      .map(a => a.id);

    if (validAnchorIds.length === 0) return anchors;

    let walkQuery = `
        SELECT DISTINCT a.id, a.content, a.source_path as source, a.timestamp,
               a.buckets, a.tags, 'epoch_placeholder' as epochs, a.provenance,
               30.0 as score, a.sequence, a.simhash as molecular_signature
        FROM atoms a
        JOIN atoms anchor_a ON EXISTS (
          SELECT 1 FROM unnest(anchor_a.tags) as anchor_tag
          JOIN unnest(a.tags) as shared_tag ON anchor_tag = shared_tag
        )
        WHERE anchor_a.id = ANY($1)  -- Related to anchor atoms
          AND a.id != ALL($1)       -- Exclude anchor atoms themselves
    `;

    let walkParams: any[] = [validAnchorIds];

    if (provenance !== 'all' && provenance !== 'quarantine') {
      const provParamIdx = walkParams.length + 1;
      walkQuery += ` AND a.provenance = $${provParamIdx}`;
      walkParams.push(provenance);
    } else if (provenance === 'all') {
      walkQuery += ` AND a.provenance != 'quarantine'`;
    } else if (provenance === 'quarantine') {
      walkQuery += ` AND a.provenance = 'quarantine'`;
    }

    // Add tag filters
    if (tags.length > 0) {
      const walkParamCount = walkParams.length + 1;
      walkQuery += ` AND EXISTS (
        SELECT 1 FROM unnest(a.tags) as tag WHERE tag = ANY($${walkParamCount})
      )`;
      walkParams.push(tags);
    }

    // [SECURITY PATCH] Add bucket filters to Walk Phase
    if (buckets.length > 0) {
      const walkBucketParamIdx = walkParams.length + 1;
      walkQuery += ` AND EXISTS (
        SELECT 1 FROM unnest(a.buckets) as bucket WHERE bucket = ANY($${walkBucketParamIdx})
      )`;
      walkParams.push(buckets);
    }

    // Apply temporal range filtering to walk results if needed
    if (hasTemporalRange) {
      const yearMatches = queryLower.match(/\b(202[0-9]|203[0-9])\b/g);
      if (yearMatches && yearMatches.length >= 2) {
        const startYear = Math.min(...yearMatches.map(Number));
        const endYear = Math.max(...yearMatches.map(Number));
        const yearParamIdx = walkParams.length + 1;
        walkQuery += ` AND EXTRACT(YEAR FROM TO_TIMESTAMP(a.timestamp / 1000.0)) BETWEEN $${yearParamIdx} AND $${yearParamIdx + 1}`;
        walkParams.push(startYear, endYear);
      }
    }

    const walkLimitParamIdx = walkParams.length + 1;
    if (hasTemporalRange) {
      // For temporal range queries, sort walk results by timestamp to maintain chronological spread
      walkQuery += ` ORDER BY a.timestamp ASC LIMIT $${walkLimitParamIdx}`;
    } else {
      walkQuery += ` LIMIT $${walkLimitParamIdx}`;
    }
    walkParams.push(walkLimit);

    const walkResult = await db.run(walkQuery, walkParams);

    const neighbors = (walkResult.rows || []).map((row: any[]) => {
      const isAtomic = row.length > 11;
      return {
        id: row[0],
        content: row[1],
        source: row[2],
        timestamp: row[3],
        buckets: row[4],
        tags: row[5],
        epochs: row[6],
        provenance: row[7],
        score: row[8],
        sequence: row[9],
        molecular_signature: row[10],
        start_byte: isAtomic ? row[11] : undefined,
        end_byte: isAtomic ? row[12] : undefined,
        type: isAtomic ? row[13] : undefined,
        numeric_value: isAtomic ? row[14] : undefined,
        numeric_unit: isAtomic ? row[15] : undefined,
        compound_id: isAtomic ? row[16] : undefined
      };
    });

    return [...anchors, ...neighbors];

  } catch (e) {
    console.error('[Search] Tag-Walker failed:', e);
    return [];
  }
}

/**
 * Execute search with Intelligent Expansion and Tag-Walker Protocol
 */
export async function executeSearch(
  query: string,
  _bucket?: string,
  buckets?: string[],
  maxChars: number = config.SEARCH.max_chars_default,
  _deep: boolean = false,
  provenance: 'internal' | 'external' | 'quarantine' | 'all' = 'all',
  explicitTags: string[] = [],
  filters?: { type?: string; minVal?: number; maxVal?: number; }
): Promise<{ context: string; results: SearchResult[]; toAgentString: () => string; metadata?: any }> {
  console.log(`[Search] executeSearch (Semantic Shift Architecture) called with provenance: ${provenance}`);

  // Add additional logging to track the request flow
  const startTime = Date.now();
  console.log(`[Search] Starting search for query: "${query.substring(0, 100)}..." with ${maxChars} char limit`);

  // PRE-PROCESS: Extract semantic categories from query
  const scopeTags: string[] = [...explicitTags];
  const queryParts = query.split(/\s+/);
  const cleanQueryParts: string[] = [];
  const semanticCategories: SemanticCategory[] = [];
  const entityPairs: string[] = []; // For relationship detection
  const KNOWN_BUCKETS = ['notebook', 'inbox', 'codebase', 'journal', 'archive', 'memories', 'external'];

  for (const part of queryParts) {
    if (part.startsWith('#')) {
      const term = part.substring(1).toLowerCase();
      // Check if it's a semantic category
      const semanticCategory = Object.values(SemanticCategory).find(cat =>
        cat.toLowerCase().includes(term) || cat.toLowerCase().replace('#', '').includes(term)
      );

      if (semanticCategory) {
        semanticCategories.push(semanticCategory as SemanticCategory);
      } else if (KNOWN_BUCKETS.includes(term) || term.includes('inbox')) {
        if (!buckets) buckets = [];
        buckets.push(term);
      } else {
        scopeTags.push(term);
      }
    } else {
      cleanQueryParts.push(part);
    }
  }

  // Detect potential entity pairs for relationship search
  if (cleanQueryParts.length >= 2) {
    // Look for relationship indicators in the query
    const relationshipIndicators = ['and', 'with', 'met', 'told', 'said', 'visited', 'called', 'texted', 'about'];
    for (let i = 0; i < cleanQueryParts.length - 1; i++) {
      if (relationshipIndicators.includes(cleanQueryParts[i].toLowerCase())) {
        // Found a potential relationship: [person1] [indicator] [person2]
        if (i > 0 && i < cleanQueryParts.length - 1) {
          entityPairs.push(`${cleanQueryParts[i - 1]}_${cleanQueryParts[i + 1]}`);
          entityPairs.push(`${cleanQueryParts[i + 1]}_${cleanQueryParts[i - 1]}`); // Bidirectional
        }
      }
    }
  }

  const cleanQuery = cleanQueryParts.join(' ');
  const realBuckets = new Set(buckets || []);

  if (realBuckets.size === 0) {
    scopeTags.forEach(tag => {
      const name = tag.replace('#', '');
      realBuckets.add(name);
    });
  }

  console.log(`[Search] Query: "${cleanQuery}"`);
  console.log(`[Search] Filters -> Buckets: [${Array.from(realBuckets).join(', ')}] | Tags: [${scopeTags.join(', ')}] | Semantic Categories: [${semanticCategories.join(', ')}] | Entity Pairs: [${entityPairs.join(', ')}]`);

  const parsedQuery = parseNaturalLanguage(cleanQuery);
  if (parsedQuery !== cleanQuery) {
    console.log(`[Search] NLP Parsed Query: "${cleanQuery}" -> "${parsedQuery}"`);
  }

  // Apply Deterministic Semantic Expansion (Synonym Ring)
  const parsedWords = parsedQuery.split(/\s+/).filter((w: string) => w.length > 2);
  const semanticExpandedTerms = isExpansionReady() ? await semanticExpand(parsedWords) : parsedWords;
  const semanticExpandedQuery = semanticExpandedTerms.join(' ');
  if (semanticExpandedQuery !== parsedQuery) {
    console.log(`[Search] Semantic Expansion: "${parsedQuery}" -> "${semanticExpandedQuery}"`);
  }

  const expansionTags = await expandQuery(cleanQuery);
  const expandedQuery = expansionTags.length > 0 ? `${semanticExpandedQuery} ${expansionTags.join(' ')}` : semanticExpandedQuery;
  console.log(`[Search] Optimized Query: ${expandedQuery}`);

  // 1. ENGRAM LOOKUP
  const engramResults = await lookupByEngram(cleanQuery);
  let finalResults: SearchResult[] = [];
  const includedIds = new Set<string>();

  // Active Cleansing: Track existing SimHashes
  const includedHashes: string[] = [];
  // Track frequency of content occurrences
  const hashFrequencyMap = new Map<string, number>();
  const SIMHASH_THRESHOLD = 3; // Standard 074: < 3 bits difference = duplicate


  if (engramResults.length > 0) {
    console.log(`[Search] Found ${engramResults.length} via Engram lookup.`);

    let engramContextQuery = `SELECT id, content, source_path as source, timestamp, buckets, tags, epochs, provenance, simhash FROM atoms WHERE id = ANY($1)`;
    const engramParams: any[] = [engramResults];

    if (provenance !== 'all' && provenance !== 'quarantine') {
      engramContextQuery += ` AND provenance = $2`;
      engramParams.push(provenance);
    } else if (provenance === 'all') {
      engramContextQuery += ` AND provenance != 'quarantine'`;
    } else if (provenance === 'quarantine') {
      engramContextQuery += ` AND provenance = 'quarantine'`;
    }

    const engramContentResult = await db.run(engramContextQuery, engramParams);
    if (engramContentResult.rows) {
      const realBucketsArray = Array.from(realBuckets);
      engramContentResult.rows.forEach((row: any[]) => {
        if (!includedIds.has(row[0])) {
          const rowTags = row[5] as string[];
          const rowBuckets = row[4] as string[];

          // Tags are intersectional (AND): Must have ALL specified tags
          const matchesTags = scopeTags.every(t => rowTags.includes(t));
          // Buckets are categorical (OR): Must be in AT LEAST ONE of the specified buckets
          const matchesBuckets = realBucketsArray.some(b => rowBuckets.includes(b));

          // NEW: Check semantic category match
          const matchesSemanticCategory = semanticCategories.length === 0 ||
            semanticCategories.some(cat => rowTags.includes(cat.replace('#', '')));

          // NEW: Check for entity pair relationships in content
          const hasEntityPair = entityPairs.length > 0 &&
            entityPairs.some(pair => {
              const [entity1, entity2] = pair.split('_');
              const contentLower = (row[1] as string).toLowerCase();
              return contentLower.includes(entity1.toLowerCase()) && contentLower.includes(entity2.toLowerCase());
            });

          if ((scopeTags.length === 0 || matchesTags) &&
            (realBucketsArray.length === 0 || matchesBuckets) &&
            (semanticCategories.length === 0 || matchesSemanticCategory)) {

            // Boost score for entity pair matches
            let score = hasEntityPair ? 250 : 200; // Higher score for relationship matches

            // Active Cleansing
            const simhash = row[8] || "0";
            let isDuplicate = false;
            let existingItem: SearchResult | undefined;

            if (simhash !== "0") {
              for (const existingHash of includedHashes) {
                if (getHammingDistance(simhash, existingHash) < SIMHASH_THRESHOLD) {
                  isDuplicate = true;

                  // --- MERGE TAGS (Directive 3) ---
                  // Find the existing item and merge tags/buckets
                  existingItem = finalResults.find(r => r.molecular_signature === existingHash);
                  if (existingItem) {
                    const mergedTags = new Set([...existingItem.tags, ...rowTags]);
                    const mergedBuckets = new Set([...getItems(existingItem.buckets), ...rowBuckets]);
                    existingItem.tags = Array.from(mergedTags);
                    existingItem.buckets = Array.from(mergedBuckets);
                    // Update frequency count
                    const currentFreq = hashFrequencyMap.get(existingHash) || 1;
                    hashFrequencyMap.set(existingHash, currentFreq + 1);
                    existingItem.frequency = currentFreq + 1;
                    // console.log(`[Search] Merged tags for duplicate atom: ${row[0]} -> ${existingItem.id}`);
                  }
                  break;
                }
              }
            }

            if (!isDuplicate) {
              const newItem: SearchResult = {
                id: row[0],
                content: row[1],
                source: row[2],
                timestamp: row[3],
                buckets: row[4],
                tags: row[5],
                epochs: row[6],
                provenance: row[7],
                score: score,
                molecular_signature: simhash,
                frequency: 1, // Initialize frequency to 1 for new items
                // Add semantic information
                semanticCategories: semanticCategories,
                relatedEntities: hasEntityPair ? entityPairs : undefined
              };

              // Initialize frequency to 1 for new items
              if (simhash !== "0") {
                hashFrequencyMap.set(simhash, 1);
              }

              finalResults.push(newItem);
              includedIds.add(row[0]);
              if (simhash !== "0") includedHashes.push(simhash);
            } else if (existingItem) {
              // Update the existing item's frequency if we found a duplicate during merge
              const currentFreq = hashFrequencyMap.get(simhash) || 1;
              existingItem.frequency = currentFreq;
            }
          }
        }
      });
    }
  }

  // 2. TAG-WALKER SEARCH (Hybrid FTS + Graph)
  // Use parsedQuery (NLP-processed) for better FTS recall - removes stopwords and extracts meaningful terms
  let walkerResults = await tagWalkerSearch(parsedQuery, Array.from(realBuckets), scopeTags, maxChars, provenance, filters);

  // --- FUZZY FALLBACK (Standard 093) ---
  // If strict AND-search returns 0 results, retry with OR-logic
  // CRITICAL: Use parsedQuery (not cleanQuery) to prevent stopwords from polluting fuzzy OR search
  if ((engramResults.length === 0 && walkerResults.length === 0) || (walkerResults.length === 0 && finalResults.length === 0)) {
    console.log(`[Search] Strict search returned 0 results. Triggering Fuzzy Fallback for: "${parsedQuery}" (parsed from: "${cleanQuery}")`);
    walkerResults = await tagWalkerSearch(parsedQuery, Array.from(realBuckets), scopeTags, maxChars, provenance, filters, true); // Fuzzy = true
  }

  // Type-Based Scoring Multipliers (POML V4)
  const TYPE_SCORE_MULT: Record<string, number> = {
    'prose': 1.0,
    'code': 0.8,
    'data': 0.6,
    'log': 0.4  // Downweight logs heavily
  };

  // Merge and Apply Provenance Boosting + Type-Based Scoring with Active Cleansing
  walkerResults.forEach(r => {
    let score = r.score;

    // Provenance Boosting
    if (provenance === 'internal') {
      if (r.provenance === 'internal') score *= 3.0;
      else score *= 0.5;
    } else if (provenance === 'external') {
      if (r.provenance !== 'internal') score *= 1.5;
    } else {
      if (r.provenance === 'internal') score *= 2.0;
    }

    // Type-Based Scoring (POML V4)
    const typeMultiplier = TYPE_SCORE_MULT[r.type || 'prose'] || 1.0;
    score *= typeMultiplier;

    // NEW: Boost scores for semantic category matches
    if (semanticCategories.length > 0) {
      const hasSemanticMatch = semanticCategories.some(cat =>
        r.tags.includes(cat.replace('#', ''))
      );
      if (hasSemanticMatch) {
        score *= 1.5; // Boost for semantic category matches
      }
    }

    // NEW: Boost scores for entity pair relationships
    if (entityPairs.length > 0) {
      const hasEntityPairMatch = entityPairs.some(pair => {
        const [entity1, entity2] = pair.split('_');
        const contentLower = (r.content || '').toLowerCase();
        return contentLower.includes(entity1.toLowerCase()) && contentLower.includes(entity2.toLowerCase());
      });
      if (hasEntityPairMatch) {
        score *= 2.0; // Significant boost for relationship matches
      }
    }

    if (!includedIds.has(r.id)) {
      // Active Cleansing Check
      let isDuplicate = false;
      const simhash = r.molecular_signature || "0";
      let existingItem: SearchResult | undefined;

      if (simhash !== "0") {
        for (const existingHash of includedHashes) {
          if (getHammingDistance(simhash, existingHash) < SIMHASH_THRESHOLD) {
            isDuplicate = true;

            // --- MERGE TAGS (Directive 3) ---
            existingItem = finalResults.find(r => r.molecular_signature === existingHash);
            if (existingItem) {
              const mergedTags = new Set([...existingItem.tags, ...(r.tags || [])]);
              const mergedBuckets = new Set([...getItems(existingItem.buckets), ...getItems(r.buckets)]);
              existingItem.tags = Array.from(mergedTags);
              existingItem.buckets = Array.from(mergedBuckets);
              // Update frequency count
              const currentFreq = hashFrequencyMap.get(existingHash) || 1;
              hashFrequencyMap.set(existingHash, currentFreq + 1);
              existingItem.frequency = currentFreq + 1;
            }
            break;
          }
        }
      }

      if (!isDuplicate) {
        const newItem: SearchResult = {
          ...r,
          score,
          frequency: 1, // Initialize frequency to 1 for new items
          // Add semantic information
          semanticCategories: semanticCategories,
          relatedEntities: entityPairs.length > 0 ? entityPairs : undefined
        };

        // Initialize frequency to 1 for new items
        if (simhash !== "0") {
          hashFrequencyMap.set(simhash, 1);
        }

        finalResults.push(newItem);
        includedIds.add(r.id);
        if (simhash !== "0") includedHashes.push(simhash);
      } else if (existingItem) {
        // Update the existing item's frequency if we found a duplicate during merge
        const currentFreq = hashFrequencyMap.get(simhash) || 1;
        existingItem.frequency = currentFreq;
      }
    }
  });

  console.log(`[Search] Total Results (After Deduplication): ${finalResults.length}`);

  // Final Sort by Score
  finalResults.sort((a, b) => b.score - a.score);

  // 3. CONTEXT INFLATION (Standard 085)
  // Inflate separate molecules into coherent windows
  // ContextInflator.inflate() already handles budget-filling with additional related content
  const inflatedResults = await ContextInflator.inflate(finalResults, maxChars);

  console.log(`[Search] Inflated ${finalResults.length} atoms into ${inflatedResults.length} context windows.`);

  const result = await formatResults(inflatedResults, maxChars);
  console.log(`[Search] Search completed in ${Date.now() - startTime}ms`);
  return result;
}

/**
 * Execute molecule-based search - splits query into sentence-like chunks and searches each separately
 */
export async function executeMoleculeSearch(
  query: string,
  bucket?: string,
  buckets?: string[],
  maxChars: number = 2400, // 2400 tokens as specified
  deep: boolean = false,
  provenance: 'internal' | 'external' | 'quarantine' | 'all' = 'all',
  explicitTags: string[] = []
): Promise<{ context: string; results: SearchResult[]; toAgentString: () => string; metadata?: any }> {

  // Split the query into molecules (sentence-like chunks)
  const molecules = splitQueryIntoMolecules(query);
  console.log(`[MoleculeSearch] Split query into ${molecules.length} molecules:`, molecules);

  // Search each molecule separately
  const allResults: SearchResult[] = [];
  const includedIds = new Set<string>();

  for (const [index, molecule] of molecules.entries()) {
    console.log(`[MoleculeSearch] Searching molecule ${index + 1}/${molecules.length}: "${molecule}"`);

    try {
      // Execute search for this specific molecule
      const result = await executeSearch(
        molecule,
        bucket,
        buckets,
        maxChars,
        deep,
        provenance,
        explicitTags
      );

      // Add unique results to our collection
      for (const item of result.results) {
        if (!includedIds.has(item.id)) {
          allResults.push(item);
          includedIds.add(item.id);
        }
      }
    } catch (error) {
      console.error(`[MoleculeSearch] Error searching molecule:`, molecule, error);
      // Continue with other molecules even if one fails
    }
  }

  // Sort results by score
  allResults.sort((a, b) => b.score - a.score);

  console.log(`[MoleculeSearch] Combined results from ${molecules.length} molecules: ${allResults.length} total results`);

  return await formatResults(allResults, maxChars); // Use original maxChars to maintain token budget
}

/**
 * Traditional FTS fallback
 */
export async function runTraditionalSearch(query: string, buckets: string[]): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeFtsQuery(query);
  if (!sanitizedQuery) return [];

  let querySql = `
    SELECT a.id,
           ts_rank(to_tsvector('simple', a.content), plainto_tsquery('simple', $1)) as score,
           a.content, a.source_path as source, a.timestamp,
           a.buckets, a.tags, 'epoch_placeholder' as epochs, a.provenance
    FROM atoms a
    WHERE to_tsvector('simple', a.content) @@ plainto_tsquery('simple', $1)
  `;

  if (buckets.length > 0) {
    querySql += ` AND EXISTS (
      SELECT 1 FROM unnest(a.buckets) as bucket WHERE bucket = ANY($2)
    )`;
  }

  querySql += ` ORDER BY score DESC`;

  try {
    const result = await db.run(querySql, buckets.length > 0 ? [sanitizedQuery, buckets] : [sanitizedQuery]);
    if (!result.rows) return [];

    return result.rows.map((row: any[]) => ({
      id: row[0],
      score: row[1],
      content: row[2],
      source: row[3],
      timestamp: row[4],
      buckets: row[5],
      tags: row[6],
      epochs: row[7],
      provenance: row[8]
    }));
  } catch (e) {
    console.error('[Search] FTS failed', e);
    return [];
  }
}

/**
 * Iterative Search with Back-off Strategy
 * Attempts to retrieve results by progressively simplifying the query.
 */
export async function iterativeSearch(
  query: string,
  buckets: string[] = [],
  maxChars: number = 20000,
  tags: string[] = []
): Promise<{ context: string; results: SearchResult[]; attempt: number; metadata?: any }> {

  // 0. Extract Scope Tags (Hashtags) to preserve them across strategies
  // We want to make sure if user typed "#work", it stays even if we strip adjectives.
  const scopeTags: string[] = [...tags];
  const queryParts = query.split(/\s+/);
  queryParts.forEach(part => {
    if (part.startsWith('#')) scopeTags.push(part);
  });
  const tagsString = scopeTags.join(' ');

  // Strategy 1: Standard Expanded Search (All Nouns, Verbs, Dates + Expansion)
  console.log(`[IterativeSearch] Strategy 1: Standard Execution`);
  let results = await executeSearch(query, undefined, buckets, maxChars, false, 'all', tags);
  if (results.results.length > 0) return { ...results, attempt: 1 };

  // Strategy 2: Strict "Subjects & Time" (Strip Verbs/Adjectives, keep Nouns + Dates)
  console.log(`[IterativeSearch] Strategy 2: Strict Nouns/Dates`);
  const temporalContext = extractTemporalContext(query);
  const doc = nlp.readDoc(query);
  const nouns = doc.tokens().filter((t: any) => {
    const tag = t.out(nlp.its.pos);
    return tag === 'NOUN' || tag === 'PROPN';
  }).out((nlp as any).its.text);

  const uniqueTokens = new Set([...nouns, ...temporalContext]);
  if (uniqueTokens.size > 0) {
    // Re-inject scope tags
    const strictQuery = Array.from(uniqueTokens).join(' ') + ' ' + tagsString;
    console.log(`[IterativeSearch] Fallback Query 1: "${strictQuery.trim()}"`);
    results = await executeSearch(strictQuery, undefined, buckets, maxChars, false, 'all', tags);
    if (results.results.length > 0) return { ...results, attempt: 2 };
  }

  // Strategy 3: "Just the Dates" (If query heavily implies time)
  // Sometimes "2025" is the only anchor we have if keywords fail.
  // Or maybe just "Proper Nouns" (Entities).
  const propNouns = doc.tokens().filter((t: any) => t.out(nlp.its.pos) === 'PROPN').out((nlp as any).its.text);

  // Re-inject scope tags
  const entityQuery = [...new Set([...propNouns, ...temporalContext])].join(' ') + ' ' + tagsString;

  if (entityQuery.trim().length > 0 && entityQuery.trim() !== (Array.from(uniqueTokens).join(' ') + ' ' + tagsString).trim()) {
    console.log(`[IterativeSearch] Fallback Query 2: "${entityQuery.trim()}"`);
    results = await executeSearch(entityQuery, undefined, buckets, maxChars, false, 'all', tags);
    if (results.results.length > 0) return { ...results, attempt: 3 };
  }

  return { ...results, attempt: 4 }; // Return empty result if all fail
}

/**
 * Smart Chat Search (The "Markovian" Context Gatherer)
 * Logic:
 * 1. Try standard Iterative Search.
 * 2. If Recall is Low (< 10 atoms), TRIGGER SPLIT.
 * 3. Split Query into Top Entities (Alice, Bob, etc.).
 * 4. Run Parallel Searches for each entity.
 * 5. Aggregate & Deduplicate.
 */
export async function smartChatSearch(
  query: string,
  buckets: string[] = [],
  maxChars: number = 20000,
  tags: string[] = []
): Promise<{ context: string; results: SearchResult[]; strategy: string; splitQueries?: string[]; metadata?: any }> {
  // 1. Initial Attempt
  const initial = await iterativeSearch(query, buckets, maxChars, tags);

  // If we have enough results, returns immediately
  if (initial.results.length >= 10) {
    return { ...initial, strategy: 'standard' };
  }

  console.log(`[SmartSearch] Low Recall (${initial.results.length} results). Triggering Multi-Query Split...`);

  // 2. Extract Entities for Split Search
  const doc = nlp.readDoc(query);
  // Get Proper Nouns (Entities) and regular Nouns
  // We prioritize PROPN (High Value)
  const entities = doc.tokens()
    .filter((t: any) => t.out(nlp.its.pos) === 'PROPN')
    .out(nlp.its.normal, nlp.as.freqTable)
    .map((e: any) => e[0])
    .slice(0, 3); // Top 3 Entities

  // If no entities, try Nouns
  if (entities.length === 0) {
    const nouns = doc.tokens()
      .filter((t: any) => t.out(nlp.its.pos) === 'NOUN')
      .out(nlp.its.normal, nlp.as.freqTable)
      .map((e: any) => e[0])
      .slice(0, 3);
    entities.push(...nouns);
  }

  if (entities.length === 0) {
    // No entities to split on, return what we have
    return { ...initial, strategy: 'shallow', splitQueries: [] };
  }

  console.log(`[SmartSearch] Split Entities: ${JSON.stringify(entities)}`);

  // 3. Parallel Execution
  // We run executeSearch for each entity independently
  const parallelPromises = entities.map((entity: string) =>
    executeSearch(entity, undefined, buckets, maxChars / entities.length, false, 'all', tags) // Split budget? Or full budget?
    // Let's iterate search? No, simple executeSearch is simpler.
    // Use full budget per search, we will truncate at merge time.
  );

  const parallelResults = await Promise.all(parallelPromises);

  // 4. Merge & Deduplicate
  const mergedMap = new Map<string, SearchResult>();

  // Add initial results first
  initial.results.forEach(r => mergedMap.set(r.id, r));

  // Add split results
  parallelResults.forEach((res) => {
    res.results.forEach(r => {
      if (!mergedMap.has(r.id)) {
        // Boost score slightly for multi-path discovery?
        // Or keep as is.
        mergedMap.set(r.id, r);
      }
    });
  });

  const mergedResults = Array.from(mergedMap.values());
  console.log(`[SmartSearch] Merged Total: ${mergedResults.length} atoms.`);

  // 5. Re-Format
  const formatted = await formatResults(mergedResults, maxChars * 1.5);
  return { ...formatted, strategy: 'split_merge', splitQueries: entities };
}

