
import { db } from '../packages/anchor-engine/engine/src/core/db.js';

async function migrate() {
    try {
        console.log("[Migration] Connecting to DB...");
        // This will connect and potentially run init if first time, 
        // but we want to force re-creation of tags table.
        await db.init();

        console.log("[Migration] Dropping old tags table...");
        try {
            await db.run('DROP TABLE IF EXISTS tags');
            console.log("[Migration] Tags table dropped.");
        } catch (e: any) {
            console.warn("[Migration] Failed to drop tags table:", e.message);
        }

        // Re-run init logic for tags table manually or trigger db.init again?
        // db.init only runs if not initialized, or checks IF NOT EXISTS.
        // Since we dropped it, we can run the create statement manually here to be sure,
        // or rely on a new db instance/init call? db is singleton.
        // We will run the CREATE statement manually here to ensure it uses the NEW schema
        // and doesn't rely on cached state.

        console.log("[Migration] Creating new tags table with (atom_id, tag, bucket) PK...");
        await db.run(`
            CREATE TABLE IF NOT EXISTS tags (
              atom_id TEXT,
              tag TEXT,
              bucket TEXT,
              PRIMARY KEY (atom_id, tag, bucket)
            );
        `);

        // Re-create indexes
        try {
            await db.run('CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);');
            await db.run('CREATE INDEX IF NOT EXISTS idx_tags_bucket ON tags(bucket);');
        } catch (e) { console.warn("Index creation failed", e); }

        console.log("[Migration] Migrating data from atoms table...");
        const atoms = await db.run('SELECT id, tags, buckets FROM atoms');
        console.log(`[Migration] Found ${atoms.rows.length} atoms to process.`);

        let tagCount = 0;
        for (const row of atoms.rows) {
            const atomId = row[0];
            const tags = row[1]; // Text[] from PGlite comes as array
            const buckets = row[2];

            // PGlite might return null or empty array
            if (!tags || !Array.isArray(tags) || tags.length === 0) continue;
            if (!buckets || !Array.isArray(buckets) || buckets.length === 0) continue;

            // Generate values for batch insert could be faster, but let's do loop for safety
            for (const bucket of buckets) {
                if (!bucket) continue;
                for (const tag of tags) {
                    if (!tag) continue;
                    try {
                        await db.run(
                            `INSERT INTO tags (atom_id, tag, bucket) VALUES ($1, $2, $3)
                           ON CONFLICT (atom_id, tag, bucket) DO NOTHING`,
                            [atomId, tag, bucket]
                        );
                        tagCount++;
                    } catch (e) {
                        // ignore errors
                    }
                }
            }

            if (tagCount % 1000 === 0) process.stdout.write('.');
        }

        console.log(`\n[Migration] Completed. Inserted ${tagCount} tag entries.`);

        // Verify
        const count = await db.run('SELECT count(*) FROM tags');
        console.log(`[Migration] Final Tags Count: ${count.rows[0][0]}`);

    } catch (e: any) {
        console.error("[Migration] Fatal Error:", e);
    }
}

migrate();
