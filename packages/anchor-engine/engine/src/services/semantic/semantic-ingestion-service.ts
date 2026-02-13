/**
 * Semantic Ingestion Service for ECE (Semantic Shift Refactor)
 * 
 * Replaces the old atomizer with semantic molecule processing
 * that creates high-level semantic tags and atomic entities.
 */

import { SemanticMoleculeProcessor } from './semantic-molecule-processor.js';
import { SemanticMolecule } from './types/semantic.js';
import { db } from '../../core/db.js';
import * as crypto from 'crypto';
import { NlpService } from '../../services/nlp/nlp-service.js';

export class SemanticIngestionService {
  private moleculeProcessor: SemanticMoleculeProcessor;

  constructor() {
    this.moleculeProcessor = new SemanticMoleculeProcessor();
  }

  /**
   * Ingest content using the new semantic architecture
   * Creates molecules with high-level semantic tags and atomic entities
   */
  public async ingestContent(
    content: string,
    source: string,
    type: string = 'text',
    bucket: string = 'default',
    buckets: string[] = [],
    tags: string[] = [] // These will be high-level semantic categories
  ): Promise<{ status: string; id: string; message: string }> {
    try {
      // Handle legacy single-bucket param
      const allBuckets = bucket ? [...buckets, bucket] : buckets;

      // Ensure explicit metadata tags exist (Fix for missing UI toggles when NER fails)
      // This ensures 'indexTags' never receives an empty list, so buckets are always indexed.
      const metadataTags = [`source:${source}`, `type:${type}`];
      const effectiveTags = [...new Set([...tags, ...metadataTags])];

      // Validate content length to prevent oversized atoms
      const MAX_CONTENT_LENGTH = 500 * 1024; // 500KB limit
      if (content.length > MAX_CONTENT_LENGTH) {
        console.warn(`[SemanticIngestionService] Content exceeds maximum length (${content.length} chars), performing automatic chunking...`);
        // Split the content into smaller chunks and process each separately
        return await this.ingestLargeContent(content, source, type, bucket, buckets, effectiveTags);
      }

      // Split content into text chunks (molecules)
      const textChunks = this.splitIntoMolecules(content);

      // Process each chunk into semantic molecules
      const chunksWithMetadata = textChunks.map((chunk, index) => ({
        content: chunk,
        source: `${source}_chunk_${index}`,
        timestamp: Date.now() + index, // Slightly offset timestamps
        provenance: 'external'
      }));

      const semanticMolecules = await this.moleculeProcessor.processTextChunks(chunksWithMetadata);

      // Store each semantic molecule in the database
      for (const molecule of semanticMolecules) {
        const id = `mol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = molecule.timestamp;
        const hash = crypto.createHash('sha256').update(molecule.content).digest('hex');

        // Insert the semantic molecule into the database
        await db.run(
          `INSERT INTO atoms (id, timestamp, content, source_path, source_id, sequence, type, hash, buckets, tags, epochs, provenance, simhash, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             timestamp = EXCLUDED.timestamp,
             source_path = EXCLUDED.source_path,
             source_id = EXCLUDED.source_id,
             sequence = EXCLUDED.sequence,
             type = EXCLUDED.type,
             hash = EXCLUDED.hash,
             buckets = EXCLUDED.buckets,
             tags = EXCLUDED.tags,
             epochs = EXCLUDED.epochs,
             provenance = EXCLUDED.provenance,
             simhash = EXCLUDED.simhash,
             embedding = EXCLUDED.embedding`,
          [
            id,
            timestamp,
            molecule.content,
            source,
            source, // source_id
            0, // sequence
            type || 'semantic_molecule',
            hash,
            allBuckets,
            [...effectiveTags, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))], // Convert semantic categories to tags
            [], // epochs
            molecule.provenance,
            "0", // simhash (default)
            JSON.stringify(new Array(768).fill(0.1)) // Zero-stub for now
          ]
        );

        // Also store the atomic entities separately if needed
        for (const entity of molecule.containedEntities) {
          // Fix for index size limit: Hash the entity for the ID instead of using raw text
          const entityHash = crypto.createHash('sha256').update(entity).digest('hex').substring(0, 16);
          const atomId = `atom_${id}_${entityHash}`;
          const atomHash = crypto.createHash('sha256').update(entity).digest('hex');

          // Truncate entity tag to avoid index size limits
          const entityTagRaw = `entity:${entity.toLowerCase()}`;
          const entityTag = entityTagRaw.length > 255 ? entityTagRaw.substring(0, 255) : entityTagRaw;

          await db.run(
            `INSERT INTO atoms (id, timestamp, content, source_path, source_id, sequence, type, hash, buckets, tags, epochs, provenance, simhash, embedding)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (id) DO UPDATE SET
               content = EXCLUDED.content,
               timestamp = EXCLUDED.timestamp,
               source_path = EXCLUDED.source_path,
               source_id = EXCLUDED.source_id,
               sequence = EXCLUDED.sequence,
               type = EXCLUDED.type,
               hash = EXCLUDED.hash,
               buckets = EXCLUDED.buckets,
               tags = EXCLUDED.tags,
               epochs = EXCLUDED.epochs,
               provenance = EXCLUDED.provenance,
               simhash = EXCLUDED.simhash,
               embedding = EXCLUDED.embedding`,
            [
              atomId,
              timestamp,
              entity, // The atomic entity value
              `${source}_entities`,
              id, // source_id points to the parent molecule
              0, // sequence
              'atomic_entity',
              atomHash,
              [...allBuckets, 'entities'], // Add to entities bucket
              [entityTag, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))], // Entity-specific and semantic tags
              [], // epochs
              'internal',
              "0", // simhash
              JSON.stringify(new Array(768).fill(0.1))
            ]
          );

          // Index Tags for Entity
          await this.indexTags(atomId, [entityTag, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))], [...allBuckets, 'entities']);
        }

        // Index Tags for Molecule
        await this.indexTags(id, [...effectiveTags, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))], allBuckets);
      }

      return {
        status: 'success',
        id: semanticMolecules[0]?.id || 'unknown',
        message: `Ingested ${semanticMolecules.length} semantic molecules with ${semanticMolecules.reduce((sum, mol) => sum + mol.containedEntities.length, 0)} atomic entities`
      };
    } catch (e: any) {
      console.error('[SemanticIngestionService] Ingest Error:', e);
      return { status: 'error', id: 'unknown', message: e.message };
    }
  }

  /**
   * Split content into semantic molecules (text chunks)
   * This replaces the old atomizer logic
   */
  private splitIntoMolecules(content: string): string[] {
    // Split by paragraphs or sentences, preserving semantic meaning
    // This is a simplified version - could be enhanced with more sophisticated NLP

    // First, try to split by paragraphs
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    // If paragraphs are too long, split further by sentences
    const chunks: string[] = [];
    for (const paragraph of paragraphs) {
      if (paragraph.length <= 500) { // Max length for a semantic molecule
        chunks.push(paragraph.trim());
      } else {
        // Split long paragraphs into sentences
        const sentences = this.splitIntoSentences(paragraph);
        let currentChunk = '';

        for (const sentence of sentences) {
          if ((currentChunk + ' ' + sentence).length > 500) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
      }
    }

    return chunks.filter(chunk => chunk.length > 10); // Filter out very short chunks
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - could be enhanced with NLP
    return text
      .split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s+/g)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Process a single text chunk into a semantic molecule
   */
  public async processSingleChunk(
    content: string,
    source: string,
    timestamp: number = Date.now()
  ): Promise<SemanticMolecule> {
    return await this.moleculeProcessor.processTextChunk(content, source, timestamp);
  }

  /**
   * Ingest large content by automatically chunking it into smaller pieces
   */
  private async ingestLargeContent(
    content: string,
    source: string,
    type: string = 'text',
    bucket: string = 'default',
    buckets: string[] = [],
    tags: string[] = []
  ): Promise<{ status: string; id: string; message: string }> {
    const allBuckets = bucket ? [...buckets, bucket] : buckets;
    const chunkSize = 50 * 1024; // Reduced to 50KB to prevent OOM on large files
    const overlapSize = 2 * 1024; // 2KB overlap to maintain context

    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      let end = start + chunkSize;

      // If we're near the end, just take the remainder
      if (end >= content.length) {
        end = content.length;
      } else {
        // Try to find a good break point (sentence or paragraph boundary)
        let breakPoint = end;
        const searchWindow = content.substring(end, Math.min(end + 5000, content.length));

        // Look for a good break point
        const sentenceBreak = searchWindow.lastIndexOf('. ');
        const paragraphBreak = searchWindow.lastIndexOf('\n\n');
        const newlineBreak = searchWindow.lastIndexOf('\n');

        // Choose the closest appropriate break point
        if (paragraphBreak !== -1) {
          breakPoint = end + paragraphBreak + 2; // +2 for \n\n
        } else if (sentenceBreak !== -1) {
          breakPoint = end + sentenceBreak + 2; // +2 for '. '
        } else if (newlineBreak !== -1) {
          breakPoint = end + newlineBreak + 1; // +1 for '\n'
        } else {
          // If no good break point found, just break at chunkSize
          breakPoint = end;
        }

        // Ensure we don't go beyond the content length
        breakPoint = Math.min(breakPoint, content.length);

        // If the break point is too close to start, just break at chunkSize
        if (breakPoint - start < chunkSize * 0.5) {
          breakPoint = Math.min(start + chunkSize, content.length);
        }

        end = breakPoint;
      }

      // Add overlap from previous chunk if not the first chunk
      const overlapStart = start > 0 ? Math.max(0, start - overlapSize) : start;
      const chunk = content.substring(overlapStart, end);

      chunks.push(chunk);
      start = end;
    }

    let totalMolecules = 0;
    let totalEntities = 0;

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkSource = `${source}_chunk_${i + 1}_of_${chunks.length}`;

      // Process the chunk as a separate ingestion using internal method that bypasses length validation
      const result = await this.ingestSingleChunk(chunk, chunkSource, type, bucket, buckets, [...tags, `chunk:${i + 1}`]);

      if (result.status === 'success') {
        // Extract numbers from the message
        const molMatch = result.message.match(/(\d+) semantic molecules/);
        const entMatch = result.message.match(/(\d+) atomic entities/);

        if (molMatch) totalMolecules += parseInt(molMatch[1]);
        if (entMatch) totalEntities += parseInt(entMatch[1]);
      }
    }

    return {
      status: 'success',
      id: `multi_chunk_${Date.now()}`,
      message: `Processed large content in ${chunks.length} chunks, ingested ${totalMolecules} semantic molecules with ${totalEntities} atomic entities`
    };
  }

  /**
   * Internal method to ingest a single chunk without length validation
   * Optimized for Big O performance using Batched Transactions
   */
  private async ingestSingleChunk(
    content: string,
    source: string,
    type: string = 'text',
    bucket: string = 'default',
    buckets: string[] = [],
    tags: string[] = []
  ): Promise<{ status: string; id: string; message: string }> {
    // This method bypasses the length validation to avoid recursion
    try {
      // Handle legacy single-bucket param
      const allBuckets = bucket ? [...buckets, bucket] : buckets;

      // Split content into text chunks (molecules)
      const textChunks = this.splitIntoMolecules(content);

      // Process each chunk into semantic molecules
      const chunksWithMetadata = textChunks.map((chunk, index) => ({
        content: chunk,
        source: `${source}_chunk_${index}`,
        timestamp: Date.now() + index, // Slightly offset timestamps
        provenance: 'external'
      }));

      const semanticMolecules = await this.moleculeProcessor.processTextChunks(chunksWithMetadata);

      // Batched Ingestion Logic
      const atomsToInsert: any[] = [];
      const tagsToInsert: { atomId: string, tags: string[], buckets: string[] }[] = [];
      const edgesToInsert: any[] = []; // For variant relationships

      // Initialize NLP Service for embeddings (uses static pipeline)
      const nlpService = new NlpService();

      // Import Vector Service dynamically to avoid circular deps if any
      const { vector } = await import('../../core/vector.js');
      // Ensure vector service is initialized
      if (!vector.isInitialized) await vector.init();

      for (const molecule of semanticMolecules) {
        const id = `mol_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const timestamp = molecule.timestamp;
        const hash = crypto.createHash('sha256').update(molecule.content).digest('hex');

        // 1. Generate Embedding
        let embedding: number[] = [];
        try {
          embedding = await nlpService.getEmbedding(molecule.content);
        } catch (err) {
          console.warn(`[Ingest] Failed to generate embedding for ${id}, using zero-stub.`, err);
          embedding = new Array(768).fill(0);
        }

        // 2. Gatekeeper: Check for Drift/Variants
        // Get next vector_id from DB sequence
        const seqRes = await db.run("SELECT nextval('vector_id_seq') as id");
        const vectorId = parseInt(seqRes.rows[0][0]); // PGlite row-mode array

        let isVariant = false;
        let parentAtomId: string | null = null;
        let driftDistance = 1.0;

        try {
          const searchRes = vector.search(embedding, 1);
          if (searchRes.ids.length > 0) {
            driftDistance = searchRes.distances[0];
            if (driftDistance < 0.05) {
              // It's a variant!
              isVariant = true;
              // Find the parent atom UUID from the vector_id
              const parentRes = await db.run('SELECT id FROM atoms WHERE vector_id = $1 LIMIT 1', [searchRes.ids[0]]);
              if (parentRes.rows.length > 0) {
                parentAtomId = parentRes.rows[0][0];
              }
            }
          }
        } catch (err) {
          console.warn(`[Ingest] Vector search failed during Gatekeeper check`, err);
        }

        // 3. Prepare Payload
        const atomType = isVariant ? 'semantic_variant' : (type || 'semantic_molecule');

        atomsToInsert.push({
          id,
          timestamp,
          content: molecule.content,
          source_path: source,
          source_id: source,
          sequence: 0,
          type: atomType,
          hash,
          buckets: allBuckets,
          tags: [...tags, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))],
          epochs: [],
          provenance: isVariant ? 'variant' : molecule.provenance,
          simhash: "0",
          embedding: JSON.stringify(embedding),
          vector_id: vectorId // Store the ID we reserved
        });

        // 4. Handle Vector Indexing vs Variant Linking
        if (isVariant && parentAtomId) {
          console.log(`[Gatekeeper] Drift < 0.05 (${driftDistance.toFixed(4)}). Marking ${id} as variant of ${parentAtomId}`);
          // Do NOT add to vector index (temporal collapse)
          // Add Edge: [Variant] --(is_variant_of)--> [Parent]
          edgesToInsert.push({
            source: id,
            target: parentAtomId,
            relation: 'is_variant_of',
            weight: 1.0 - driftDistance
          });
        } else {
          // New distinct thought - Add to Vector Index
          try {
            vector.add(vectorId, embedding);
          } catch (e) {
            console.error(`[Ingest] Failed to add vector to index`, e);
          }
        }

        // Prepare Tags for Molecule
        tagsToInsert.push({
          atomId: id,
          tags: [...tags, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))],
          buckets: allBuckets
        });

        // Also store the atomic entities separately if needed
        for (const entity of molecule.containedEntities) {
          // Fix for index size limit: Hash the entity for the ID
          const entityHash = crypto.createHash('sha256').update(entity).digest('hex').substring(0, 16);
          const atomId = `atom_${id}_${entityHash}`;
          const atomHash = crypto.createHash('sha256').update(entity).digest('hex');

          // Truncate entity tag
          const entityTagRaw = `entity:${entity.toLowerCase()}`;
          const entityTag = entityTagRaw.length > 255 ? entityTagRaw.substring(0, 255) : entityTagRaw;

          const entityTags = [entityTag, ...molecule.semanticTags.map((tag: string) => tag.replace('#', ''))];
          const entityBuckets = [...allBuckets, 'entities'];

          // Prepare Payload for Entity
          atomsToInsert.push({
            id: atomId,
            timestamp,
            content: entity,
            source_path: `${source}_entities`,
            source_id: id,
            sequence: 0,
            type: 'atomic_entity',
            hash: atomHash,
            buckets: entityBuckets,
            tags: entityTags,
            epochs: [],
            provenance: 'internal',
            simhash: "0",
            embedding: JSON.stringify(new Array(768).fill(0.0)), // Entities might not need vector search yet, or generate separate embeddings
            vector_id: null // Entities don't go into the main semantic vector index for now
          });

          // Prepare Tags for Entity
          tagsToInsert.push({
            atomId: atomId,
            tags: entityTags,
            buckets: entityBuckets
          });
        }
      }

      // Execute Batch Transaction
      if (atomsToInsert.length > 0) {
        await db.run('BEGIN');

        try {
          // 1. Bulk Insert Atoms
          const atomValues: any[] = [];
          const atomPlaceholders: string[] = [];
          let i = 1;

          for (const atom of atomsToInsert) {
            atomPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9}, $${i + 10}, $${i + 11}, $${i + 12}, $${i + 13})`);
            atomValues.push(
              atom.id, atom.timestamp, atom.content, atom.source_path, atom.source_id,
              atom.sequence, atom.type, atom.hash, atom.buckets, atom.tags,
              atom.epochs, atom.provenance, atom.simhash, atom.embedding
            );
            i += 14;
          }

          const atomQuery = `
            INSERT INTO atoms (id, timestamp, content, source_path, source_id, sequence, type, hash, buckets, tags, epochs, provenance, simhash, embedding)
            VALUES ${atomPlaceholders.join(', ')}
            ON CONFLICT (id) DO UPDATE SET
              content = EXCLUDED.content,
              timestamp = EXCLUDED.timestamp,
              source_path = EXCLUDED.source_path,
              source_id = EXCLUDED.source_id,
              sequence = EXCLUDED.sequence,
              type = EXCLUDED.type,
              hash = EXCLUDED.hash,
              buckets = EXCLUDED.buckets,
              tags = EXCLUDED.tags,
              epochs = EXCLUDED.epochs,
              provenance = EXCLUDED.provenance,
              simhash = EXCLUDED.simhash,
              embedding = EXCLUDED.embedding
          `;

          await db.run(atomQuery, atomValues);

          // 2. Bulk Insert Tags
          const tagValues: any[] = [];
          const tagPlaceholders: string[] = [];
          let j = 1;

          for (const item of tagsToInsert) {
            for (const bucket of item.buckets) {
              for (const tag of item.tags) {
                if (!tag || tag.length > 255) continue;
                tagPlaceholders.push(`($${j}, $${j + 1}, $${j + 2})`);
                tagValues.push(item.atomId, tag, bucket);
                j += 3;
              }
            }
          }

          if (tagValues.length > 0) {
            const tagQuery = `
              INSERT INTO tags (atom_id, tag, bucket)
              VALUES ${tagPlaceholders.join(', ')}
              ON CONFLICT (atom_id, tag, bucket) DO NOTHING
            `;
            await db.run(tagQuery, tagValues);
          }

          // 3. Bulk Insert Edges (Variants)
          if (edgesToInsert.length > 0) {
            const edgeValues: any[] = [];
            const edgePlaceholders: string[] = [];
            let k = 1;

            for (const edge of edgesToInsert) {
              edgePlaceholders.push(`($${k}, $${k + 1}, $${k + 2}, $${k + 3})`);
              edgeValues.push(edge.source, edge.target, edge.relation, edge.weight);
              k += 4;
            }

            const edgeQuery = `
                INSERT INTO edges (source_id, target_id, relation, weight)
                VALUES ${edgePlaceholders.join(', ')}
                ON CONFLICT (source_id, target_id, relation) DO NOTHING
            `;
            await db.run(edgeQuery, edgeValues);
          }

          await db.run('COMMIT');
        } catch (error) {
          await db.run('ROLLBACK');
          throw error;
        }
      }

      return {
        status: 'success',
        id: semanticMolecules[0]?.id || 'unknown',
        message: `Ingested ${semanticMolecules.length} semantic molecules with ${semanticMolecules.reduce((sum, mol) => sum + mol.containedEntities.length, 0)} atomic entities`
      };
    } catch (e: any) {
      console.error('[SemanticIngestionService] Single Chunk Ingest Error:', e);
      return { status: 'error', id: 'unknown', message: e.message };
    }
  }

  /**
   * Index tags in the separate tags table for efficient retrieval/filtering
   */
  private async indexTags(atomId: string, tags: string[], buckets: string[]): Promise<void> {
    if (!tags.length || !buckets.length) return;

    // Use a simple Set to deduplicate quickly
    const uniqueEntries = new Set<string>();
    const values: any[] = [];
    const placeholders: string[] = [];
    let i = 1;

    for (const bucket of buckets) {
      for (const tag of tags) {
        if (!tag) continue;
        if (tag.length > 255) continue; // Skip tags that are too long for the index

        const key = `${atomId}:${tag}:${bucket}`;
        if (uniqueEntries.has(key)) continue;
        uniqueEntries.add(key);

        placeholders.push(`($${i}, $${i + 1}, $${i + 2})`);
        values.push(atomId, tag, bucket);
        i += 3;
      }
    }

    if (values.length === 0) return;

    try {
      await db.run(
        `INSERT INTO tags (atom_id, tag, bucket) VALUES ${placeholders.join(', ')}
           ON CONFLICT (atom_id, tag, bucket) DO NOTHING`,
        values
      );
    } catch (e) {
      // Warn but don't fail ingestion
      console.warn(`[SemanticIngestionService] Failed to index tags`, e);
    }
  }
}