const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../server/routes/messages.js'), 'utf8');
function setup(rows = [{ id: 12 }]) {
  const routes = {}, calls = [];
  const router = { use() {} };
  for (const method of ['get', 'post', 'patch']) router[method] = (path, handler) => { routes[method + path] = handler; };
  vm.runInNewContext(source, { require(name) {
    if (name === 'express') return { Router: () => router };
    if (name === '../db') return { async query(sql, params) { calls.push({ sql, params }); return { rows }; } };
    if (name === '../safety-rules') return { safetyError: () => false };
    return () => {};
  }, module: {}, console });
  const req = { params: { id: '5' }, user: { id: 42 }, body: { body: 'Hello', reply_to_id: 7 } };
  const res = { code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
  return { routes, calls, req, res };
}
test('reply uses authenticated sender and requires parent in same conversation', async () => {
  const { routes, calls, req, res } = setup();
  await routes['post/conversations/:id'](req, res);
  assert.equal(res.code, 201);
  assert.deepEqual(Array.from(calls[0].params), [42, 5, 'Hello', 7]);
  assert.match(calls[0].sql, /parent\.conversation_id = c\.id/);
  assert.match(calls[0].sql, /c\.buyer_id = \$1 OR c\.seller_id = \$1/);
});
test('ordinary message is accepted without a reply target', async () => {
  const { routes, calls, req, res } = setup();
  delete req.body.reply_to_id;
  await routes['post/conversations/:id'](req, res);
  assert.equal(res.code, 201);
  assert.equal(calls[0].params[3], null);
});
test('invalid reply ID is rejected before database access', async () => {
  const { routes, calls, req, res } = setup();
  req.body.reply_to_id = 'invalid';
  await routes['post/conversations/:id'](req, res);
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
});
test('missing or unauthorised reply returns not found', async () => {
  const { routes, req, res } = setup([]);
  await routes['post/conversations/:id'](req, res);
  assert.equal(res.code, 404);
});
test('history returns quote only from same conversation', async () => {
  const { routes, calls, req, res } = setup();
  await routes['get/conversations/:id'](req, res);
  assert.match(calls[1].sql, /parent\.conversation_id = m\.conversation_id/);
  assert.match(calls[1].sql, /parent\.body AS reply_body/);
});
