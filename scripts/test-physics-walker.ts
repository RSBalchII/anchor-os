
import { db } from '../packages/anchor-engine/engine/src/core/db.ts';
import { PhysicsTagWalker } from '../packages/anchor-engine/engine/src/services/search/physics-tag-walker.ts';
import { SearchResult } from '../packages/anchor-engine/engine/src/services/search/search.ts';

async function main() {
    console.log("Initializing DB...");
    await db.init();

    const walker = new PhysicsTagWalker();

    // Create a mock anchor (using a real term if possible, or just a dummy one)
    // We need an atom ID that actually exists to test the join.
    // Let's first fetch a random atom to use as anchor.

    console.log("Checking tags table...");
    const tagCount = await db.run(`SELECT count(*) as count FROM tags`);
    console.log(`Tags table has ${tagCount.rows[0].count} rows.`);

    if (parseInt(tagCount.rows[0].count) === 0) {
        console.log("Tags table is empty. Inserting dummy data for testing...");
        // Insert a dummy atom and tag
        const atomId1 = 'test_atom_1';
        const atomId2 = 'test_atom_2';
        const timestamp = Date.now();

        await db.run(`INSERT INTO atoms (id, content, timestamp, simhash) VALUES ($1, $2, $3, $4)`,
            [atomId1, 'Test Atom 1', timestamp, '0x1234567890abcdef']);
        await db.run(`INSERT INTO atoms (id, content, timestamp, simhash) VALUES ($1, $2, $3, $4)`,
            [atomId2, 'Test Atom 2', timestamp - 100000, '0x1234567890abcdee']); // Close simhash

        await db.run(`INSERT INTO tags (atom_id, tag, bucket) VALUES ($1, $2, $3)`, [atomId1, 'test_tag', 'test']);
        await db.run(`INSERT INTO tags (atom_id, tag, bucket) VALUES ($1, $2, $3)`, [atomId2, 'test_tag', 'test']);

        console.log("Dummy data inserted.");
    }

    console.log("Fetching an atom with tags to use as anchor...");
    const taggedAtom = await db.run(`
    SELECT a.* 
    FROM atoms a
    JOIN tags t ON a.id = t.atom_id
    GROUP BY a.id, a.content, a.timestamp, a.simhash, a.source_path, a.provenance, a.type, a.compound_id, a.start_byte, a.end_byte, a.embedding, a.vector_id, a.created_at, a.buckets, a.tags, a.epochs, a.sequence, a.hash, a.molecular_signature, a.numeric_value, a.numeric_unit, a.source_id, a.payload
    LIMIT 1
  `);
    // Note: Group By all columns is annoying in strict SQL.
    // Better: SELECT DISTINCT a.* FROM atoms a JOIN tags t ON a.id = t.atom_id LIMIT 1

    if (!taggedAtom.rows || taggedAtom.rows.length === 0) {
        console.error("No atoms with tags found. Cannot test walker.");
        return;
    }

    const anchorRow = taggedAtom.rows[0];
    console.log(`Using anchor: ${anchorRow.id} (${anchorRow.content.substring(0, 30)}...)`);

    const mockAnchor: SearchResult = {
        id: anchorRow.id,
        content: anchorRow.content,
        source: anchorRow.source_path,
        timestamp: anchorRow.timestamp,
        buckets: [],
        tags: [], // We rely on DB tags, not these
        epochs: '',
        provenance: 'internal',
        score: 1.0,
        molecular_signature: anchorRow.simhash || '0',
        frequency: 1,
        type: 'thought',
        temporal_state: {
            first_seen: anchorRow.timestamp,
            last_seen: anchorRow.timestamp,
            occurrence_count: 1,
            timestamps: [anchorRow.timestamp]
        }
    };

    console.log("\n--- Running Physics Walk (SQL) ---");
    const startTime = Date.now();

    const results = await walker.applyPhysicsWeighting([mockAnchor], 0.0, {
        walk_radius: 1,
        max_per_hop: 10,
        temperature: 0.2,
        gravity_threshold: 0.0 // See everything
    });

    const elapsed = Date.now() - startTime;
    console.log(`\nWalk complete in ${elapsed}ms`);
    console.log(`Found ${results.length} related nodes.`);

    results.forEach((r, i) => {
        console.log(`\n[${i + 1}] ${r.result.id} (Score: ${r.physics.gravity_score.toFixed(4)})`);
        console.log(`    Type: ${r.physics.connection_type}`);
        console.log(`    Reason: ${r.physics.link_reason}`);
        console.log(`    Content: ${r.result.content.substring(0, 50)}...`);
    });

    // Verify scoring
    if (results.length > 0 && results[0].physics.gravity_score === 0) {
        console.warn("\nWARNING: Top result has 0 score. Check math.");
    } else if (results.length > 0) {
        console.log("\nCheck: Scores look populated.");
    }

    console.log("\nDone.");
}

main().catch(console.error);
