import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../core/db.js';
import { SearchResult } from './search.js';
import { getMirrorPath, MIRRORED_BRAIN_PATH } from '../mirror/mirror.js';
import { NOTEBOOK_DIR } from '../../config/paths.js';

interface ContextWindow {
    compoundId: string;
    source: string;
    start: number;
    end: number;
    originalResults: SearchResult[];
}

export class ContextInflator {

    /**
     * Inflate search results into expanded Context Windows.
     * Supports "Dynamic Density": Scales window size based on available budget and result count.
     * Fetches content from compound_body in the database to ensure coordinate space alignment.
     */
    static async inflate(results: SearchResult[], totalBudget?: number, radius: number = 0): Promise<SearchResult[]> {
        if (results.length === 0) return [];

        // Process each result to potentially expand content from compound_body
        const processedResults: SearchResult[] = [];

        for (const res of results) {
            // Skip inflation if we don't have the necessary compound coordinates
            // We need compound_id to fetch the compound_body from the database
            if (!res.compound_id || res.start_byte === undefined || res.end_byte === undefined) {
                // If no compound coordinates, use the result as-is
                processedResults.push(res);
                continue;
            }

            try {
                // Skip inflation for virtual sources if they lack compound data
                if ((res.source === 'atom_source' || res.source === 'internal' || res.source === 'memory') && !res.compound_id) {
                    processedResults.push(res);
                    continue;
                }

                // Fetch the compound_body from the database (same coordinate space as offsets)
                const query = `SELECT compound_body FROM compounds WHERE id = $1`;
                const result = await db.run(query, [res.compound_id]);

                if (!result.rows || result.rows.length === 0) {
                    // Fallback to original result if compound not found
                    processedResults.push(res);
                    continue;
                }

                const compoundBody = result.rows[0][0] as string;

                // Extract the specific content based on byte coordinates
                // Convert to Buffer to handle byte offsets correctly (not string indices)
                const contentBuffer = Buffer.from(compoundBody, 'utf-8');

                // Apply Radial Expansion
                const start = Math.max(0, res.start_byte - radius);
                const end = Math.min(contentBuffer.length, (res.end_byte ?? contentBuffer.length) + radius);

                const sliceBuffer = contentBuffer.subarray(start, end);
                const extractedContent = sliceBuffer.toString('utf-8');

                // Create a new result with expanded content
                const expandedResult: SearchResult = {
                    ...res,
                    content: `...${extractedContent}...`,
                    is_inflated: true
                };

                processedResults.push(expandedResult);
            } catch (e) {
                console.error(`[ContextInflator] Failed to inflate result for ${res.source}`, e);
                // On error, use the original result
                processedResults.push(res);
            }
        }

        // If we have a total budget and our current results don't fill it, try to expand with less directly connected data
        // DISABLED: This was pulling irrelevant content (file headers, random atoms from same bucket)
        // User expects precise search results around keywords.
        /*
        if (totalBudget && totalBudget > 0) {
            const currentCharCount = processedResults.reduce((sum, result) => sum + (result.content?.length || 0), 0);

            if (currentCharCount < totalBudget) {
                console.log(`[ContextInflator] Current results (${currentCharCount} chars) don't fill budget (${totalBudget} chars). Attempting to expand with less directly connected data...`);

                // Fetch additional related content to fill the budget
                const additionalResults = await this.fetchAdditionalContext(processedResults, totalBudget - currentCharCount);

                if (additionalResults.length > 0) {
                    // Add additional results to fill the remaining budget
                    processedResults.push(...additionalResults);

                    // Sort by score to prioritize the most relevant content
                    processedResults.sort((a, b) => (b.score || 0) - (a.score || 0));
                }
            }
        }
        */

        return processedResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    /**
     * Get atom locations for Elastic Context sizing
     * Returns the raw positions so we can calculate density/hits BEFORE inflating
     */
    static async getAtomLocations(term: string, limit: number = 100, options: { buckets?: string[], provenance?: string } = {}): Promise<{ compoundId: string, byteOffset: number, filePath: string, timestamp: number, provenance: string }[]> {
        // Atoms are stored with # prefix, but we might search without
        const termWithHash = term.startsWith('#') ? term : `#${term}`;
        const termWithoutHash = term.startsWith('#') ? term.slice(1) : term;

        let query = `
            SELECT ap.compound_id, ap.byte_offset, c.path, c.timestamp, c.provenance
            FROM atom_positions ap
            JOIN compounds c ON ap.compound_id = c.id
            WHERE 
               (LOWER(ap.atom_label) = LOWER($1) 
               OR LOWER(ap.atom_label) = LOWER($2)
               OR ap.atom_label ILIKE $3)
        `;

        const params: any[] = [termWithHash, termWithoutHash, `${termWithoutHash}%`];

        // Apply Provenance Filter
        if (options.provenance && options.provenance !== 'all') {
            params.push(options.provenance);
            query += ` AND c.provenance = $${params.length}`;
        }

        // Apply Bucket Filter (Check if compound contains ANY atom with the bucket)
        if (options.buckets && options.buckets.length > 0) {
            params.push(options.buckets);
            // We join atoms to check if any atom in this compound has the bucket
            // optimize: use EXISTS instead of joining widely
            query += ` AND EXISTS (
                SELECT 1 FROM atoms a 
                WHERE a.compound_id = c.id 
                AND EXISTS (
                    SELECT 1 FROM unnest(a.buckets) as b WHERE b = ANY($${params.length})
                )
            )`;
        }

        query += ` ORDER BY c.timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        try {
            const result = await db.run(query, params);
            if (!result.rows) return [];

            return result.rows.map((row: any[]) => ({
                compoundId: row[0] as string,
                byteOffset: row[1] as number,
                filePath: row[2] as string,
                timestamp: row[3] as number,
                provenance: row[4] as string
            }));
        } catch (e) {
            console.error(`[ContextInflator] Check locations failed for ${term}`, e);
            return [];
        }
    }

    /**
     * Radial Inflation from Atom Positions (Lazy Molecule Architecture)
     * Searches atom_positions for keyword occurrences and expands radially
     * 
     * @param searchTerm - The atom/keyword to search for
     * @param radius - How many bytes to expand in each direction (default 500)
     * @param maxResults - Maximum results to return
     */
    static async inflateFromAtomPositions(
        searchTerm: string,
        radius: number = 500,
        maxResults: number = 20,
        maxWindowSize: number = radius * 3, // Default cap if not provided
        options: { buckets?: string[], provenance?: string } = {}
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];

        try {
            // Find all positions where this atom appears
            // Atoms are stored with # prefix (e.g. "#Rob") but search terms come without
            // So we search for both formats: "#Rob" and "Rob"
            const termWithHash = searchTerm.startsWith('#') ? searchTerm : `#${searchTerm}`;
            const termWithoutHash = searchTerm.startsWith('#') ? searchTerm.slice(1) : searchTerm;

            let query = `
                SELECT ap.compound_id, ap.byte_offset, c.path, c.timestamp, c.provenance
                FROM atom_positions ap
                JOIN compounds c ON ap.compound_id = c.id
                WHERE (LOWER(ap.atom_label) = LOWER($1) OR LOWER(ap.atom_label) = LOWER($2))
            `;

            const params: any[] = [termWithHash, termWithoutHash];

            // Apply Provenance Filter
            if (options.provenance && options.provenance !== 'all') {
                params.push(options.provenance);
                query += ` AND c.provenance = $${params.length}`;
            }

            // Apply Bucket Filter
            if (options.buckets && options.buckets.length > 0) {
                params.push(options.buckets);
                query += ` AND EXISTS (
                    SELECT 1 FROM atoms a 
                    WHERE a.compound_id = c.id 
                    AND EXISTS (
                        SELECT 1 FROM unnest(a.buckets) as b WHERE b = ANY($${params.length})
                    )
                )`;
            }

            query += ` ORDER BY c.timestamp DESC LIMIT $${params.length + 1}`;
            params.push(maxResults * 2);

            const positionsResult = await db.run(query, params);
            if (!positionsResult.rows || positionsResult.rows.length === 0) {
                return [];
            }

            // Group by compound to avoid duplicate reads
            const compoundPositions = new Map<string, { positions: number[], filePath: string, timestamp: number, provenance: string }>();

            for (const row of positionsResult.rows) {
                const compoundId = row[0] as string;
                const byteOffset = row[1] as number;
                const dbPath = row[2] as string;
                const timestamp = row[3] as number;
                const provenance = row[4] as string;

                if (!compoundPositions.has(compoundId)) {
                    compoundPositions.set(compoundId, {
                        positions: [],
                        filePath: dbPath,
                        timestamp,
                        provenance
                    });
                }
                compoundPositions.get(compoundId)!.positions.push(byteOffset);
            }

            // Radially inflate from each position, MERGING overlapping windows
            // Read content from MIRRORED FILES on disk, not from database
            for (const [compoundId, data] of compoundPositions) {
                // Resolve the file path - try mirrored file first, then original
                const mirrorPath = getMirrorPath(data.filePath, data.provenance);
                let absolutePath = mirrorPath;

                // If mirror doesn't exist, try original path
                if (!fs.existsSync(mirrorPath)) {
                    absolutePath = path.isAbsolute(data.filePath)
                        ? data.filePath
                        : path.join(NOTEBOOK_DIR, data.filePath);
                }

                // Skip if file doesn't exist
                if (!fs.existsSync(absolutePath)) {
                    console.warn(`[ContextInflator] File not found: ${absolutePath}`);
                    continue;
                }

                // Read file stats to get size for window clamping
                let fileSize = 0;
                try {
                    const stats = fs.statSync(absolutePath);
                    fileSize = stats.size;
                } catch (e) {
                    console.warn(`[ContextInflator] Failed to stat file: ${absolutePath}`);
                    continue;
                }

                // Calculate raw windows for all positions using file size
                const rawWindows = data.positions.map(byteOffset => ({
                    start: Math.max(0, byteOffset - radius),
                    end: Math.min(fileSize, byteOffset + radius),
                    offset: byteOffset
                }));

                // Sort by start position for merge algorithm
                rawWindows.sort((a, b) => a.start - b.start);

                // Merge overlapping windows (overlap = windows that touch or overlap)
                const mergedWindows: { start: number; end: number; offsets: number[] }[] = [];
                for (const window of rawWindows) {
                    const last = mergedWindows[mergedWindows.length - 1];
                    if (last && window.start <= last.end) {
                        // Check if merging would create a massive window based on scaling limit
                        // If so, break the merge to keep results granular
                        const newEnd = Math.max(last.end, window.end);
                        if ((newEnd - last.start) <= maxWindowSize) {
                            // Overlap or adjacent - merge by extending the end
                            last.end = newEnd;
                            last.offsets.push(window.offset);
                        } else {
                            // Too big, start new window even if overlapping
                            mergedWindows.push({
                                start: window.start,
                                end: window.end,
                                offsets: [window.offset]
                            });
                        }
                    } else {
                        // No overlap - start new window
                        mergedWindows.push({
                            start: window.start,
                            end: window.end,
                            offsets: [window.offset]
                        });
                    }
                }

                // Limit results if we already have enough
                if (results.length >= maxResults) break;

                // Read only the necessary chunks from disk
                let fd: number | null = null;
                try {
                    fd = fs.openSync(absolutePath, 'r');

                    for (const window of mergedWindows) {
                        if (results.length >= maxResults) break;

                        const chunkLength = window.end - window.start;
                        if (chunkLength <= 0) continue;

                        const buffer = Buffer.alloc(chunkLength);
                        fs.readSync(fd, buffer, 0, chunkLength, window.start);

                        let inflatedContent = buffer.toString('utf-8');

                        // Clean up partial words at boundaries
                        if (window.start > 0) {
                            const firstSpace = inflatedContent.indexOf(' ');
                            if (firstSpace !== -1 && firstSpace < 50) {
                                inflatedContent = inflatedContent.substring(firstSpace + 1);
                            }
                        }
                        if (window.end < fileSize) {
                            const lastSpace = inflatedContent.lastIndexOf(' ');
                            if (lastSpace > inflatedContent.length - 50) {
                                inflatedContent = inflatedContent.substring(0, lastSpace);
                            }
                        }

                        if (inflatedContent.trim().length === 0) continue;

                        results.push({
                            id: `virtual_${compoundId}_${window.start}_${window.end}`,
                            content: `...${inflatedContent}...`,
                            source: data.filePath,
                            timestamp: data.timestamp,
                            buckets: ['core'],
                            tags: [searchTerm],
                            epochs: '',
                            provenance: data.provenance,
                            score: 500 - results.length,
                            compound_id: compoundId,
                            start_byte: window.start,
                            end_byte: window.end,
                            is_inflated: true
                        });
                    }
                } catch (err) {
                    console.warn(`[ContextInflator] Error reading file ${absolutePath}:`, err);
                } finally {
                    if (fd !== null) {
                        fs.closeSync(fd);
                    }
                }
            }

            console.log(`[ContextInflator] Radially inflated ${results.length} merged virtual molecules for "${searchTerm}"`);
            return results;

        } catch (e) {
            console.error(`[ContextInflator] Failed to inflate from atom positions: `, e);
            return [];
        }
    }

    /**
     * Fetch additional context to fill the token budget with less directly connected but still relevant data
     */
    private static async fetchAdditionalContext(baseResults: SearchResult[], remainingBudget: number): Promise<SearchResult[]> {
        if (remainingBudget <= 0) return [];

        // Extract tags and buckets from base results to find related content
        const allTags = new Set<string>();
        const allBuckets = new Set<string>();

        for (const result of baseResults) {
            if (result.tags) {
                result.tags.forEach(tag => allTags.add(tag));
            }
            if (result.buckets) {
                result.buckets.forEach(bucket => allBuckets.add(bucket));
            }
        }

        // Convert sets to arrays for use in queries
        const tagsArray = Array.from(allTags);
        const bucketsArray = Array.from(allBuckets);

        // Query for related content that shares tags or buckets but wasn't in the original results
        let query = `
            SELECT id, content, source_path as source, timestamp,
    buckets, tags, epochs, provenance, simhash as molecular_signature,
    100 as score  --Lower score for less directly connected content
            FROM atoms
WHERE `;

        const params: any[] = [];
        const conditions: string[] = [];

        // Add conditions for tags if we have any
        if (tagsArray.length > 0) {
            conditions.push(`EXISTS(
    SELECT 1 FROM unnest(tags) as tag WHERE tag = ANY($${params.length + 1})
)`);
            params.push(tagsArray);
        }

        // Add conditions for buckets if we have any
        if (bucketsArray.length > 0) {
            const bucketParamIndex = params.length + 1;
            conditions.push(`EXISTS(
    SELECT 1 FROM unnest(buckets) as bucket WHERE bucket = ANY($${bucketParamIndex})
)`);
            params.push(bucketsArray);
        }

        // Combine conditions with OR (so we get content that matches either tags OR buckets)
        let queryConditions = '';
        if (conditions.length > 0) {
            queryConditions = `(${conditions.join(' OR ')})`;
        } else {
            // If no tags or buckets to match, just get some random content
            queryConditions = 'TRUE';
        }

        // Exclude original results
        const originalIds = baseResults.map(r => r.id);
        let fullQuery = query + queryConditions;
        if (originalIds.length > 0) {
            const excludeParamIndex = params.length + 1;
            fullQuery += ` AND id != ALL($${excludeParamIndex})`;
            params.push(originalIds);
        }

        // Limit to avoid fetching too much
        fullQuery += ` ORDER BY timestamp DESC LIMIT 20`;

        try {
            const result = await db.run(fullQuery, params);
            if (!result.rows) return [];

            // Convert rows to SearchResult objects
            const additionalResults: SearchResult[] = result.rows.map((row: any[]) => ({
                id: row[0],
                content: row[1],
                source: row[2],
                timestamp: row[3],
                buckets: row[4],
                tags: row[5],
                epochs: row[6],
                provenance: row[7],
                molecular_signature: row[8],
                score: row[9] || 100, // Default score if not provided
                is_inflated: true
            }));

            // Further filter and truncate content to fit the remaining budget
            let totalChars = 0;
            const filteredResults: SearchResult[] = [];

            for (const result of additionalResults) {
                if (!result.content) continue;

                const availableSpace = remainingBudget - totalChars;
                if (availableSpace <= 0) break;

                if (result.content.length <= availableSpace) {
                    // If the content fits entirely, add it
                    filteredResults.push(result);
                    totalChars += result.content.length;
                } else {
                    // If the content is too large, truncate it to fit
                    const truncatedContent = result.content.substring(0, availableSpace);
                    filteredResults.push({
                        ...result,
                        content: truncatedContent
                    });
                    totalChars += truncatedContent.length;
                    break; // Budget is filled
                }
            }

            console.log(`[ContextInflator] Fetched ${filteredResults.length} additional results to fill budget`);
            return filteredResults;
        } catch (e) {
            console.error(`[ContextInflator] Failed to fetch additional context: `, e);
            return [];
        }
    }
}