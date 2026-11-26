const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function setup(results = []) {
  const routes = {}, middleware = [], calls = [];
  const router = { use(...fns) { middleware.push(...fns); }, get(url, fn) { routes[url] = fn; }, patch() {} };
  const auth = () => {};
  vm.runInNewContext(read('server/routes/profiles.js'), {
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '../requireUser') return auth;
      if (name === '../db') return { async query(sql, params) { calls.push({ sql, params: Array.from(params) }); assert.ok(results.length); return results.shift(); } };
    }, module: {}, console
  });
  const req = { params: { id: '7', role: 'seller' }, query: {}, user: { id: 9 } };
  const res = { code: 200, headers: {}, status(n) { this.code = n; return this; }, json(data) { this.body = data; }, setHeader(k, v) { this.headers[k] = v; } };
  return { run: () => routes['/:id/reviews/:role'](req, res), req, res, calls, auth, middleware };
}
const verified = { rows: [{ id: 7 }] };
const rating = { stars: 4, comment: null, rater_name: 'Student', review_date: '2026-11-25T16:00:00Z', listing_title: 'Desk' };

test('profile review history uses verified-session middleware and private no-store responses', () => {
  const { auth, middleware, req, res } = setup();
  assert.equal(middleware[0], auth);
  let next = false;
  middleware[1](req, res, () => { next = true; });
  assert.equal(next, true);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});
test('seller history uses completed-purchase eligibility, validated explicit deal link and snapshot title', async () => {
  const { run, res, calls } = setup([verified, { rows: [rating, { ...rating, listing_title: null }] }]);
  await run();
  assert.equal(res.code, 200);
  assert.equal(res.body.reviews.length, 2);
  assert.equal(res.body.reviews[1].listing_title, null);
  assert.equal(res.body.next_offset, null);
  const { sql, params } = calls[1];
  assert.deepEqual(params, [7, 0]);
  assert.match(sql, /LEFT JOIN marketplace_deals d ON d.id = r.deal_id AND d.status = 'completed'/);
  assert.match(sql, /d.seller_id = r.seller_id AND d.buyer_id = r.rater_id/);
  assert.match(sql, /eligible.seller_id = r.seller_id AND eligible.buyer_id = r.rater_id AND eligible.status = 'completed'/);
  assert.match(sql, /r.created_at AS review_date/);
  assert.match(sql, /item_snapshot->>'title' AS listing_title/);
  assert.doesNotMatch(sql, /comment IS NOT NULL|\bu.email\b|meetup_spot/);
});
test('buyer history is separately scoped to completed buyer deals and uses review update date', async () => {
  const { run, req, res, calls } = setup([verified, { rows: [rating] }]);
  req.params.role = 'buyer';
  req.query.offset = '20';
  await run();
  assert.equal(res.body.reviews[0].listing_title, 'Desk');
  const { sql, params } = calls[1];
  assert.deepEqual(params, [7, 20]);
  assert.match(sql, /FROM buyer_reviews r JOIN marketplace_deals d ON d.id = r.deal_id/);
  assert.match(sql, /WHERE d.buyer_id = \$1 AND d.status = 'completed'/);
  assert.match(sql, /r.updated_at AS review_date/);
  assert.match(sql, /item_snapshot->>'title' AS listing_title/);
  assert.match(sql, /ORDER BY r.updated_at DESC, r.deal_id DESC LIMIT 21 OFFSET \$2/);
});
test('review pagination returns at most 20 rows and provides the next offset only when needed', async () => {
  for (const size of [0, 20, 21]) {
    const { run, req, res } = setup([verified, { rows: Array(size).fill(rating) }]);
    req.query.offset = '40';
    await run();
    assert.equal(res.body.reviews.length, Math.min(size, 20));
    assert.equal(res.body.next_offset, size > 20 ? 60 : null);
  }
});
test('invalid student IDs, roles and offsets are rejected before database access', async () => {
  for (const [id, role, offset] of [['abc','seller','0'],['0','buyer','0'],['2147483648','buyer','0'],['7','admin','0'],['7','buyer','-1'],['7','seller','1.5'],['7','seller',['1']],['7','seller','2147483648']]) {
    const { run, req, res, calls } = setup();
    req.params = { id, role }; req.query.offset = offset;
    await run();
    assert.equal(res.code, 400);
    assert.equal(calls.length, 0);
  }
});
test('unknown or unverified student profile has no accessible review history', async () => {
  const { run, res, calls } = setup([{ rows: [] }]);
  await run();
  assert.equal(res.code, 404);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /verified = TRUE/);
});

function browser() {
  const elements = new Map();
  const requests = [];
  const responses = [];
  const element = () => ({ textContent: '', children: [], attributes: {}, events: {}, open: false,
    setAttribute(k,v) { this.attributes[k]=v; }, addEventListener(k,fn) { this.events[k]=fn; },
    append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children=[]; },
    get childElementCount() { return this.children.length; },
    showModal() { this.open=true; }, close() { this.open=false; this.events.close?.(); }
  });
  const el = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const context = vm.createContext({ document: { getElementById: el, createElement: element }, URLSearchParams, location:{search:''}, window:{addEventListener(){}}, fetch: async (url) => {
    requests.push(url); const result = responses.shift(); if (result instanceof Error) throw result;
    return { ok: true, json: async () => result };
  } });
  // Prevent initial profile request; exercise the actual functions and event handlers in isolation.
  vm.runInContext(read('public/profile.js').replace(/\nloadProfile\(\);/, '\n') + '\ncurrentUser = {id: 7};', context);
  return { el, context, requests, responses, run: code => vm.runInContext(code, context) };
}
test('both clickable review counts exist and the old duplicate review panels are removed', () => {
  const html = read('public/profile.html');
  for (const role of ['seller','buyer']) assert.match(html, new RegExp(`<button[^>]+id="${role}-rating-count"[^>]+aria-haspopup="dialog"`));
  assert.match(html, /<dialog id="review-dialog"[^>]+aria-labelledby="review-title"/);
  assert.doesNotMatch(html, /id="(?:reviews|buyer-reviews)"/);
});
test('review cards safely render reviewer, stars, date, listing and optional comment', () => {
  const b = browser();
  const box = b.run(`renderReview({ stars: 5, rater_name: '<img>', review_date: '2026-11-25T16:00:00Z', listing_title: '<script>', comment: '<b>good</b>' })`);
  assert.equal(box.children[0].textContent, '<img>');
  assert.equal(box.children[1].attributes['aria-label'], '5 out of 5 stars');
  assert.match(box.children[2].textContent, /2026/);
  assert.equal(box.children[3].textContent, 'Listing: <script>');
  assert.equal(box.children[4].textContent, '<b>good</b>');
  const legacy = b.run(`renderReview({ stars: 3, rater_name: 'Student', comment: null, listing_title: null })`);
  assert.match(legacy.children[3].textContent, /Unavailable/);
  assert.equal(legacy.children[4].textContent, 'No written comment.');
});
test('clicking rating counts opens separate histories, loads additional pages and closes cleanly', async () => {
  const b = browser();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  b.responses.push({ reviews: [rating], next_offset: 20 });
  b.el('seller-rating-count').events.click();
  await flush();
  assert.equal(b.el('review-dialog').open, true);
  assert.equal(b.el('review-title').textContent, 'Seller reviews');
  assert.equal(b.requests[0], '/api/profiles/7/reviews/seller?offset=0');
  assert.equal(b.el('review-history').childElementCount, 1);
  b.responses.push({ reviews: [rating], next_offset: null });
  b.el('review-more').events.click();
  await flush();
  assert.equal(b.requests[1], '/api/profiles/7/reviews/seller?offset=20');
  assert.equal(b.el('review-history').childElementCount, 2);
  assert.equal(b.el('review-more').hidden, true);
  b.el('review-close').events.click();
  b.responses.push({ reviews: [], next_offset: null });
  b.el('buyer-rating-count').events.click();
  await flush();
  assert.equal(b.el('review-title').textContent, 'Buyer reviews');
  assert.equal(b.requests[2], '/api/profiles/7/reviews/buyer?offset=0');
  assert.equal(b.el('review-history').childElementCount, 0);
  assert.equal(b.el('review-status').textContent, 'No reviews yet.');
});
test('review loading failure offers retry without losing the selected role or offset', async () => {
  const b = browser();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  b.responses.push(new Error('offline'));
  b.el('buyer-rating-count').events.click();
  await flush();
  assert.equal(b.el('review-more').textContent, 'Retry');
  assert.equal(b.el('review-more').hidden, false);
  b.responses.push({ reviews: [rating], next_offset: null });
  b.el('review-more').events.click();
  await flush();
  assert.equal(b.requests[0], b.requests[1]);
  assert.equal(b.el('review-history').childElementCount, 1);
});
