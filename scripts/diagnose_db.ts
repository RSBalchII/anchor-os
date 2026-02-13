
import { db } from '../packages/anchor-engine/engine/src/core/db.js';

async function diagnose() {
    try {
        await db.init();

        console.log("--- Diagnosis ---");

        const atomsCount = await db.run('SELECT count(*) FROM atoms');
        console.log(`Atoms Count: ${atomsCount.rows[0][0]}`);

        const tagsCount = await db.run('SELECT count(*) FROM tags');
        console.log(`Tags Count: ${tagsCount.rows[0][0]}`);

        if (tagsCount.rows[0][0] > 0) {
            const sample = await db.run('SELECT * FROM tags LIMIT 5');
            console.log('Sample Tags:', sample.rows);
        }

        const bucketSample = await db.run('SELECT DISTINCT bucket FROM tags');
        console.log('Distinct Buckets in Tags:', bucketSample.rows);

        // Check Atom sample to see if they have buckets/tags
        const atomSample = await db.run('SELECT id, buckets, tags FROM atoms LIMIT 5');
        console.log('Atom Sample:', atomSample.rows);

    } catch (e) {
        console.error(e);
    }
}

diagnose();
