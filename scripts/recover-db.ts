
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve("packages/anchor-engine/engine/context_data");
const BACKUP_PATH = path.resolve("packages/anchor-engine/engine/context_data_backup_CRASH");

console.log(`Checking DB at: ${DB_PATH}`);

if (fs.existsSync(DB_PATH)) {
    console.log(`Found existing DB. Moving to backup: ${BACKUP_PATH}`);
    try {
        if (fs.existsSync(BACKUP_PATH)) {
            console.log("Removing previous crash backup...");
            fs.rmSync(BACKUP_PATH, { recursive: true, force: true });
        }
        fs.renameSync(DB_PATH, BACKUP_PATH);
        console.log("Database moved successfully.");
        console.log("The engine will now create a fresh database on next start.");
    } catch (e) {
        console.error("Failed to move database:", e);
        process.exit(1);
    }
} else {
    console.log("No database found at path. Nothing to do.");
}
