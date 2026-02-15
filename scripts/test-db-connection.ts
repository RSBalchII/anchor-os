
import { PGlite } from "@electric-sql/pglite";
import path from "path";

async function testConnection() {
    const dbPath = path.resolve("packages/anchor-engine/engine/context_data");
    console.log(`Testing connection to: ${dbPath}`);

    try {
        const db = new PGlite(dbPath);
        console.log("PGlite instance created.");

        await db.waitReady;
        console.log("PGlite ready.");

        const res = await db.query("SELECT 1 as val");
        console.log("Query result:", res.rows);

        await db.close();
        console.log("Connection closed.");
    } catch (e) {
        console.error("Connection failed:", e);
    }
}

testConnection();
