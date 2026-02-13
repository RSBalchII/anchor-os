
import { VectorIndex } from './dist/vector-index.js';
import fs from 'fs-extra';
import path from 'path';

const INDEX_PATH = path.resolve('test_index.usearch');

async function testNativeVector() {
    console.log('[NativeVector] Starting Test Suite...');

    // Cleanup Previous Test
    if (fs.existsSync(INDEX_PATH)) {
        fs.removeSync(INDEX_PATH);
    }

    // 1. Initialize Index
    console.log('[NativeVector] Initializing Index (2D, Cosine)...');
    const index = new VectorIndex({
        dimensions: 2,
        metric: 'cos',
        connectivity: 16
    });

    // 2. Add Vectors
    console.log('[NativeVector] Adding Vectors...');
    index.add(1, [1.0, 0.0]); // Vector A (X-axis)
    index.add(2, [0.0, 1.0]); // Vector B (Y-axis)
    index.add(3, [0.707, 0.707]); // Vector C (45 degrees)

    console.log(`[NativeVector] Index Size: ${index.size()}`);

    // 3. Search (In-Memory)
    console.log('[NativeVector] Searching In-Memory...');
    // Search for something close to Vector C
    const results = index.search([0.7, 0.7], 3);
    console.log('[NativeVector] Search Results for [0.7, 0.7]:');
    console.log(JSON.stringify(results, null, 2));

    // 4. Save to Disk
    console.log(`[NativeVector] Saving to disk: ${INDEX_PATH}`);
    index.save(INDEX_PATH);

    // 5. Load (Memory-Mapped View)
    console.log('[NativeVector] Testing mmap view...');
    const viewIndex = new VectorIndex({
        dimensions: 2,
        metric: 'cos'
    });

    viewIndex.view(INDEX_PATH); // Zero-Copy Load
    console.log(`[NativeVector] View Index Size: ${viewIndex.size()}`);

    const viewResults = viewIndex.search([0.7, 0.7], 3);
    console.log('[NativeVector] View Search Results:');
    console.log(JSON.stringify(viewResults, null, 2));

    // Cleanup
    if (fs.existsSync(INDEX_PATH)) {
        fs.removeSync(INDEX_PATH);
        console.log('[NativeVector] Cleanup Complete.');
    }

    console.log('[NativeVector] Test Suite PASSED.');
}

testNativeVector().catch(err => {
    console.error('[NativeVector] Test FAILED:', err);
    process.exit(1);
});
