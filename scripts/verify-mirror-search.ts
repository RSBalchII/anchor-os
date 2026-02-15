import * as fs from 'fs';
import * as path from 'path';

// Force temporary DB path for testing to avoid locks
const TEMP_DB = path.join(process.cwd(), 'temp_test_db_' + Date.now());
process.env.PGLITE_DB_PATH = TEMP_DB;

import { db } from '../packages/anchor-engine/engine/src/core/db.js';
import { executeSearch } from '../packages/anchor-engine/engine/src/services/search/search.js';

// Hardcode for script execution context - MATCHING ENGINE DEFAULT
const NOTEBOOK_DIR = path.resolve('C:/Users/rsbiiw/Projects/anchor-os/packages/notebook');

async function main() {
    console.log("🧪 Verifying Mirror-Brain Search Redirection...");

    // 1. Setup Test Data
    const dummyId = 'test_mirror_atom_' + Date.now();
    const relativePath = 'inbox/MirrorTest/doc.md';
    const mirrorPath = path.join(NOTEBOOK_DIR, 'mirrored_brain', '@inbox', 'MirrorTest', 'doc.md');

    // Ensure mirror dir exists
    const mirrorDir = path.dirname(mirrorPath);
    if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });

    // Initialize DB
    await db.init();

    // 2. Insert into DB (Old Content)
    console.log("   - Seeding DB with OLD content...");
    // Insert Atom
    await db.run(`INSERT INTO atoms (id, content, source_path, timestamp, provenance, buckets) 
                  VALUES ($1, $2, $3, $4, $5, $6) 
                  ON CONFLICT (id) DO UPDATE SET content=$2`,
        [dummyId, "This is the OLD DB content. MirrorTest keyword.", relativePath, Date.now(), 'internal', ['MirrorTest']]);

    // Insert Compound (Required for SEARCH)
    const compoundId = 'cmp_' + dummyId;
    await db.run(`INSERT INTO compounds (id, compound_body, path, timestamp, provenance)
                  VALUES ($1, $2, $3, $4, $5)`,
        [compoundId, "This is the OLD DB content. MirrorTest keyword.", relativePath, Date.now(), 'internal']);

    // Insert Molecule (Required for SEARCH)
    const moleculeId = 'mol_' + dummyId;
    await db.run(`INSERT INTO molecules (id, content, compound_id, sequence, start_byte, end_byte, type, timestamp)
                  VALUES ($1, $2, $3, 1, 0, 100, 'text', $4)`,
        [moleculeId, "This is the OLD DB content. MirrorTest keyword.", compoundId, Date.now()]);

    // DEBUG: Verify Insertion
    const check = await db.run("SELECT id, content, buckets FROM atoms WHERE id = $1", [dummyId]);
    console.log("   - DB Verification: Found?", check.rows.length > 0 ? "YES" : "NO");
    if (check.rows.length > 0) console.log("   - DB Row:", check.rows[0]);

    // DEBUG: Test FTS Directly
    const ftsCheck = await db.run("SELECT id FROM atoms WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', 'MirrorTest')");
    console.log("   - FTS Direct Check: Found?", ftsCheck.rows.length > 0 ? "YES" : "NO");

    // 3. Write to Mirror (New Content)
    console.log("   - Writing NEW content to Mirror...");
    const secretMessage = "This is the LIVE MIRROR content! " + Date.now();
    fs.writeFileSync(mirrorPath, secretMessage);

    try {
        // 4. Execute Search
        console.log("   - Executing Search...");
        // We need to initialize config first usually, but let's try direct
        // Signature: query, _bucket, buckets, maxChars, _deep, provenance
        // We pass undefined for _bucket, empty array for buckets (or specific bucket), default maxChars, false for deep, and 'all' for provenance
        const searchResponse = await executeSearch("MirrorTest", undefined, [], 4000, false, 'all');
        const results = searchResponse.results;

        console.log("   - Search returned", results.length, "results.");

        // 5. Verify Content
        const found = results.find(r => r.content && r.content.includes("LIVE MIRROR"));

        if (found) {
            console.log("✅ Test Passed: Found LATE-BINDING mirror content!");
            console.log("   - Content Preview:", found.content.substring(0, 50) + "...");
        } else {
            console.log("❌ Test Failed: Content was NOT hydrated from mirror.");
            console.log(`     Expected: "${secretMessage}"`);
            if (results.length > 0) {
                console.log(`     Actual:   "${results[0].content}"`);
                console.log(`     Source:   "${results[0].source}"`);
                console.log(`     Debug ID:   "${results[0].id}"`);
            } else {
                console.log("     Actual:   No results found.");
            }
        }
    } finally {
        // Cleanup
        console.log("   - Cleaning up...");
        try {
            if (fs.existsSync(mirrorPath)) fs.unlinkSync(mirrorPath);
            if (fs.existsSync(mirrorDir)) fs.rmdirSync(mirrorDir);
            // Optional: Remove temp DB if needed, but PGlite might hold locks
        } catch (e) {
            console.warn("Cleanup warning:", e);
        }
    }
}

main().catch(console.error);
