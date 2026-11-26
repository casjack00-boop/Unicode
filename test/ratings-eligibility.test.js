const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../server/routes/ratings.js'), 'utf8');
function setup(eligible) {
  const handlers = {}, calls = [];
  const router = { get(_, ...f) { handlers.get = f.at(-1); }, post(_, ...f) { handlers.post = f.at(-1); } };
  const pool = { async query(sql, params) {
    calls.push({sql, params});
    if (sql.includes('COUNT(*)')) return { rows: [{ count: 0, average: null }] };
    if (sql.includes('SELECT r.stars')) return { rows: [] };
    if (sql.includes('SELECT EXISTS')) return { rows: [{ eligible }] };
    if (sql.includes('SELECT stars, comment')) return { rows: [] };
    if (sql.includes('SELECT id FROM users')) return { rows: [{id: 7}] };
    if (sql.includes('INSERT INTO seller_ratings')) return { rowCount: eligible ? 1 : 0 };
    throw new Error('Unexpected query: ' + sql);
  }};
  vm.runInNewContext(source, { require(name) { if (name === 'express') return { Router: () => router }; if (name === '../db') return pool; return () => {}; }, module: {}, console });
  const req = { params: {id:'7'}, user: {id:9}, body: {stars:5,comment:'Great'} };
  const res = { code:200, setHeader(){}, status(code){this.code=code;return this;}, json(body){this.body=body;return this;} };
  return {handlers,calls,req,res};
}
test('non-purchaser cannot submit a seller rating', async () => {
  const {handlers,calls,req,res} = setup(false); await handlers.post(req,res);
  assert.equal(res.code,403);
  assert.match(calls.at(-1).sql,/WHERE EXISTS[\s\S]*seller_id=\$1 AND buyer_id=\$2 AND status='completed'/);
  assert.equal(calls.at(-1).params[1],9);
});
test('completed buyer can submit or update a seller rating', async () => {
  const {handlers,calls,req,res} = setup(true); await handlers.post(req,res);
  assert.equal(res.code,200); assert.equal(res.body.ok,true);
  assert.match(calls.at(-1).sql,/ON CONFLICT \(seller_id, rater_id\)/);
});
test('rating eligibility is returned and legacy unqualified reviews excluded by both read queries', async () => {
  for (const eligible of [false,true]) {
    const {handlers,calls,req,res} = setup(eligible); await handlers.get(req,res);
    assert.equal(res.body.canRate,eligible);
    for (const call of calls.slice(0,2)) assert.match(call.sql,/d\.buyer_id=r\.rater_id AND d\.status='completed'/);
  }
});
test('seller cannot rate their own account', async () => {
  const {handlers,calls,req,res} = setup(true); req.user.id=7; await handlers.post(req,res);
  assert.equal(res.code,400); assert.equal(calls.length,0);
});
