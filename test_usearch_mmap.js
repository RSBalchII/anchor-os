
const usearch = require('usearch');

try {
    console.log('Creating index...');
    const index = new usearch.Index({ metric: 'cos', connectivity: 16, dimensions: 2 });

    console.log('Adding vector...');
    index.add(1, new Float32Array([0.2, 0.8]));

    console.log('Solving path...');
    const path = 'test.usearch';

    console.log('Saving index...');
    index.save(path);

    console.log('Checking for view() method...');
    if (typeof index.view === 'function') {
        console.log('SUCCESS: index.view() exists!');
        index.view(path);
        console.log('SUCCESS: index.view() called without error.');
    } else {
        console.log('FAILURE: index.view() does NOT exist.');
        console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(index)));
    }

} catch (e) {
    console.error('ERROR:', e);
}
