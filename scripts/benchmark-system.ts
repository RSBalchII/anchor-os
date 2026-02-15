
import fs from 'fs';
import path from 'path';
import { db } from '../packages/anchor-engine/engine/src/core/db.js';
import { SearchService } from '../packages/anchor-engine/engine/src/services/search/search.js';
import { PhysicsTagWalker } from '../packages/anchor-engine/engine/src/services/search/physics-tag-walker.js';

// Configuration
const INGESTION_FILE = 'C:/Users/rsbiiw/Projects/Coding-Notes/Notebook/history/important-context/sessions/raws/2026-9-02-to-2026-14-02.yaml';

async function benchmark() {
    console.log("=== Anchor OS Performance Benchmark ===");
    console.log(`Target File: ${INGESTION_FILE}`);

    // 1. Setup
    console.log("\n[1] Initializing Database...");
    const initStart = performance.now();
    await db.init();
    const initTime = performance.now() - initStart;
    console.log(`    DB Init: ${initTime.toFixed(2)}ms`);

    // 2. Ingestion Benchmark
    console.log("\n[2] Benchmarking Ingestion...");
    if (!fs.existsSync(INGESTION_FILE)) {
        console.error(`    ERROR: File not found at ${INGESTION_FILE}`);
        // Skip ingestion if file missing, but proceed to search bench
    } else {
        console.log("    Reading file...");
        const fileContent = fs.readFileSync(INGESTION_FILE, 'utf-8');
        console.log(`    File Size: ${(fileContent.length / 1024).toFixed(2)} KB`);

        console.log("    Starting Ingestion (Note: This simulates ingestion logic)...");
        // Note: Actual ingestion logic is complex and usually handled by the 'ingest' service or 'ContextManager'.
        // For this benchmark, we'll verify the 'PhysicsTagWalker' performance specifically as requested,
        // and maybe run a query that *would* be part of ingestion (like checking existence).

        // Since I don't have the full Ingestion Service imported easily here without full env setup,
        // I will focus on the READER side heavily, which is what currently changed.
        // If the user wants to test WRITE speed, we can do a dummy bulk insert.

        const ingestStart = performance.now();

        // Simulate bulk insert of atoms (Mock Ingestion)
        // This tests the DB write speed with the new schema constraints if any.
        // We will create 1000 dummy atoms and tags.

        /*
        const batchSize = 1000;
        await db.run('BEGIN');
        for (let i = 0; i < batchSize; i++) {
            const id = `bench_${Date.now()}_${i}`;
            await db.run(`INSERT INTO atoms (id, content, timestamp, simhash) VALUES ($1, $2, $3, $4)`, 
                [id, `Benchmark Atom ${i}`, Date.now(), '0x1000']);
            await db.run(`INSERT INTO tags (atom_id, tag) VALUES ($1, $2)`, [id, 'benchmark']);
        }
        await db.run('COMMIT');
        */

        // Actual Ingestion might be too complex to mock perfectly here without importing the actual ingestor.
        // Let's defer full ingestion benchmark unless we can import the IngestService.
        console.log("    (Skipping full ingestion simulation to focus on Search/Walker performance)");
    }

    // 3. Search / Walker Benchmark (The New Feature)
    console.log("\n[3] Benchmarking SQL Tag-Walker (New Feature)...");
    const walker = new PhysicsTagWalker();

    // Find a valid anchor
    const anchorRes = await db.run(`
    SELECT a.* 
    FROM atoms a
    JOIN tags t ON a.id = t.atom_id
    GROUP BY a.id, a.content, a.timestamp, a.source_path, a.provenance, a.type, a.compound_id, a.start_byte, a.end_byte, a.embedding, a.vector_id, a.created_at, a.buckets, a.tags, a.epochs, a.sequence, a.hash, a.molecular_signature, a.numeric_value, a.numeric_unit, a.source_id, a.payload
    HAVING count(t.tag) > 0
    LIMIT 1
  `);

    if (anchorRes.rows && anchorRes.rows.length > 0) {
        const anchor = anchorRes.rows[0];
        const mockResult = {
            id: anchor.id,
            content: anchor.content,
            timestamp: anchor.timestamp,
            tags: [], // Mock
            molecular_signature: anchor.simhash || '0',
            frequency: 1,
            provenance: 'internal',
            score: 1.0,
            type: 'thought'
        };

        console.log(`    Anchor: ${anchor.id}`);

        // Warmup
        await walker.applyPhysicsWeighting([mockResult], 0.0);

        // Run 10 trials
        const trials = 10;
        let totalTime = 0;

        console.log(`    Running ${trials} trials...`);
        for (let i = 0; i < trials; i++) {
            const start = performance.now();
            await walker.applyPhysicsWeighting([mockResult], 0.0, {
                walk_radius: 1,
                max_per_hop: 50,
                temperature: 0.2,
                gravity_threshold: 0.001
            });
            const dur = performance.now() - start;
            totalTime += dur;
            // process.stdout.write(`.${Math.round(dur)}`);
        }

        const avg = totalTime / trials;
        console.log(`\n    Average Walk Time: ${avg.toFixed(2)}ms`);

        if (avg < 50) {
            console.log("    Result: EXCELLENT (<50ms)");
        } else if (avg < 100) {
            console.log("    Result: GOOD (<100ms)");
        } else {
            console.log("    Result: SLOW (>100ms)");
        }
    } else {
        console.warn("    No tagged atoms found to benchmark.");
    }

    console.log("\nDone.");
}

benchmark().catch(console.error);
