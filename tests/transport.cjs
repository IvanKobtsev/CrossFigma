const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = readFileSync('ui.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
assert.deepEqual(manifest.networkAccess.allowedDomains, ['http://localhost:38473']);
async function scenario(responses) {
  const elements = new Map();
  const calls = [];
  let collected = 0;
  const parent = { postMessage(msg) {
    collected++;
    queueMicrotask(() => context.window.onmessage({ source: parent, data: { pluginMessage: { type: 'collected', id: msg.pluginMessage.id, name: 'Test', document: { version: '2025.10' }, warnings: [] } } }));
  } };
  const context = vm.createContext({
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
    parent, window: {}, setTimeout, clearTimeout, AbortController, Error, navigator: {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { ok: next.status >= 200 && next.status < 300, status: next.status, statusText: '', text: async () => next.body };
    },
  });
  vm.runInContext(script, context);
  await vm.runInContext("run('send')", context);
  return { calls, collected, status: elements.get('status').textContent, copy: elements.get('copy') };
}
(async () => {
  const health = { status: 200, body: JSON.stringify({ service: 'CrossBreeze', protocolVersion: 1 }) };
  let result = await scenario([new Error('Offline')]);
  assert.equal(result.collected, 0); assert.equal(result.calls.length, 1); assert.match(result.status, /make sure/);
  result = await scenario([{ status: 200, body: '{}' }]);
  assert.equal(result.collected, 0);
  result = await scenario([health, { status: 204, body: '' }]);
  assert.equal(result.collected, 1); assert.equal(result.calls.length, 2); assert.match(result.status, /sent/);
  assert.equal(result.calls[0].url, 'http://localhost:38473/health');
  assert.equal(result.calls[1].url, 'http://localhost:38473/design-tokens');
  assert.equal(result.calls[1].options.headers['Content-Type'], 'application/json');
  result = await scenario([health, { status: 500, body: 'Importer failed' }]);
  assert.match(result.status, /500.*\nImporter failed/); assert.equal(result.copy.hidden, false); assert.equal(result.calls.length, 2);
  console.log('Transport workflow fixtures passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
