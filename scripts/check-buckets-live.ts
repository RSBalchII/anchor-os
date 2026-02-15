
import { db } from '../packages/anchor-engine/engine/src/core/db.js';

async function check() {
    await db.init();
    console.log("=== Live Bucket Check ===");

    const count = await db.run("SELECT count(*) as c FROM tags");
    console.log(`Total rows in 'tags': ${count.rows[0].c}`);

    const buckets = await db.run("SELECT DISTINCT bucket FROM tags");
    console.log("Buckets found in 'tags':", buckets.rows.map(r => r.bucket));

    const atoms = await db.run("SELECT count(*) as c FROM atoms");
    console.log(`Total atoms: ${atoms.rows[0].c}`);
}

check();
