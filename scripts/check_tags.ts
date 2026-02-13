
import { db } from '../packages/anchor-engine/engine/src/core/db.js';

async function checkTags() {
    await db.init();
    console.log('--- Checking Tags ---');

    const atoms = await db.run('SELECT count(*) as count FROM atoms');
    const tags = await db.run('SELECT count(*) as count FROM tags');

    const parseCount = (res: any) => {
        if (Array.isArray(res) && res.length > 0) {
            const row = res[0];
            return Array.isArray(row) ? Number(row[0]) : Number(row.count);
        } else if (res && res.rows) {
            const row = res.rows[0];
            return Array.isArray(row) ? Number(row[0]) : Number(row.count);
        }
        return 0;
    };

    const aCount = parseCount(atoms);
    const tCount = parseCount(tags);

    console.log(`Atoms: ${aCount}`);
    console.log(`Tags: ${tCount}`);

    if (tCount === 0 && aCount > 0) {
        console.log('CRITICAL: Atoms exist but Tags are empty.');
        const sample = await db.run('SELECT id, buckets, tags FROM atoms LIMIT 1');
        console.log('Sample Atom:', JSON.stringify(sample, null, 2));
    } else if (tCount > 0) {
        const sample = await db.run('SELECT * FROM tags LIMIT 5');
        console.log('Sample Tags:', JSON.stringify(sample, null, 2));
    }

    process.exit(0);
}

checkTags().catch(console.error);
