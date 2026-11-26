// Read-only API smoke checks; the cross-origin write is expected to be rejected before routing.
'use strict';
const assert=require('node:assert/strict');
const base=process.env.UNIMARKET_TEST_ORIGIN||'http://localhost:3000';
async function check(path,status,options={}){
  const r=await fetch(new URL(path,base),{...options,signal:AbortSignal.timeout(10000),redirect:'manual'});
  assert.equal(r.status,status,`${path}: unexpected status`);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.match(r.headers.get('cache-control')||'',/no-store/);
  console.log(`PASS ${options.method||'GET'} ${path}: ${status}`);return r.json();
}
(async()=>{
  assert.equal((await check('/api/health',200)).database,'connected');
  assert.ok(Array.isArray(await check('/api/listings',200)));
  assert.ok(Array.isArray((await check('/api/roommates',200)).posts));
  await check('/api/auth/me',401);
  await check('/api/support/tickets',401);
  await check('/api/support/moderation/accounts',401);
  await check('/api/auth/logout',403,{method:'POST',headers:{Origin:'https://unrelated.example'}});
  console.log('7 HTTP smoke checks passed');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
