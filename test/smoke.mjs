import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const cjs = require('@gravity-ui/sdk');
const esm = await import('@gravity-ui/sdk');

assert.equal(typeof cjs.default, 'function');
assert.equal(typeof esm.default, 'function');
assert.equal(cjs.Lang.Ru, 'ru');
assert.equal(esm.Lang.Ru, 'ru');

const requests = [];
const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
        requests.push({headers: req.headers, body});
        if (req.headers['x-csrf-token'] === 'new') {
            res.writeHead(200, {'content-type': 'application/json'}).end('"ok"');
        } else {
            res.writeHead(419, {'x-csrf-token': 'new'}).end();
        }
    });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
    // Only check of the ESM entry with the CJS axios inside axios-wrapper, jest runs everything as CJS
    const sdk = esm.default({
        endpoint: `http://127.0.0.1:${server.address().port}/api`,
        csrfToken: 'old',
        updateCsrfEnabled: true,
    });

    assert.equal(await sdk.service.action({a: 1}, {headers: {authorization: 'Bearer x'}}), 'ok');
    assert.equal(requests.length, 2);

    const [first, retry] = requests;
    assert.equal(first.headers['x-csrf-token'], 'old');
    assert.equal(retry.headers['x-csrf-token'], 'new');
    assert.equal(retry.headers.authorization, 'Bearer x');
    assert.match(retry.headers['content-type'], /^application\/json/);
    assert.equal(retry.body, '{"a":1}');
} finally {
    server.close();
}

console.log('package smoke test passed');
