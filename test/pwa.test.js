const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'public');
function worker({ online = true, fallback = true } = {}) {
  const listeners = {}, added = [], removed = [], network = [];
  const context = {
    self: { location: { origin: 'https://unimarket.example' }, clients: { claim: async () => {} }, addEventListener: (event, fn) => { listeners[event] = fn; } },
    URL, Response, Request: class { constructor(url, options) { this.url = url; this.options = options; } },
    caches: { open: async () => ({ addAll: async requests => added.push(...requests), match: async key => fallback && key === '/offline.html' ? 'offline-page' : undefined }), keys: async () => ['unimarket-offline-v0', 'unimarket-offline-v1', 'another-app'], delete: async key => removed.push(key) },
    fetch: async (request, options) => { network.push({ request, options }); if (!online) throw Error('offline'); return 'online-page'; }
  };
  vm.runInNewContext(readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
  function trigger(name, request) { let response; listeners[name]({ request, respondWith: value => { response = value; }, waitUntil: value => { response = value; } }); return response; }
  return { trigger, added, removed, network };
}
const req = (url, mode = 'navigate', method = 'GET') => ({ url: 'https://unimarket.example' + url, mode, method });
test('manifest uses standalone display, scope and existing icon files', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) {
    const file = readFileSync(path.join(root, icon.src.slice(1)));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(file.readUInt32BE(16), width); assert.equal(file.readUInt32BE(20), height);
  }
});
test('worker precaches only public fallback and icons without credentials', async () => {
  const w = worker(); await w.trigger('install');
  assert.equal(w.added.length, 5);
  assert.ok(w.added.every(r => r.url === '/offline.html' || r.url.startsWith('/icons/')));
  assert.ok(w.added.every(r => r.options.credentials === 'omit'));
});
test('online app navigation uses network without cache', async () => {
  const w = worker(); assert.equal(await w.trigger('fetch', req('/messages.html?id=42')), 'online-page');
  assert.equal(w.network[0].options.cache, 'no-store');
});
test('offline app navigation returns generic fallback, even for private URL', async () => {
  const w = worker({ online: false }); assert.equal(await w.trigger('fetch', req('/messages.html?id=42')), 'offline-page');
  const missing = worker({ online: false, fallback: false }); assert.equal((await missing.trigger('fetch', req('/'))).status, 503);
});
test('API, uploads, cross-origin and non-GET requests are never intercepted', () => {
  const w = worker();
  for (const r of [req('/api/messages'), req('/api/auth/me', 'cors'), req('/api/transactions', 'cors', 'POST'), req('/uploads/private.png', 'no-cors'), req('/browse.html', 'navigate', 'POST'), { ...req('/offline.html'), url: 'https://other.example/offline.html' }]) assert.equal(w.trigger('fetch', r), undefined);
  assert.equal(w.network.length, 0);
});
test('activation removes only obsolete UniMarket offline caches', async () => {
  const w = worker(); await w.trigger('activate'); assert.deepEqual(w.removed, ['unimarket-offline-v0']);
});
