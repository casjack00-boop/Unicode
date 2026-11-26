'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sameOriginWrite,securityHeaders,noStore}=require('../server/http-security');
function run(method,headers={}) {
  const req={method,protocol:'http',get:key=>({...{'host':'localhost:3000'},...headers})[key]};
  const res={code:200,headers:{},status(n){this.code=n;return this;},json(body){this.body=body;},setHeader(k,v){this.headers[k]=v;}};
  let passed=false; sameOriginWrite(req,res,()=>passed=true); return {passed,res,req};
}
test('same-origin writes and non-browser clients pass origin gate',()=>{
  assert.equal(run('POST',{origin:'http://localhost:3000'}).passed,true);
  assert.equal(run('PATCH').passed,true);
});
test('cross-origin and opaque-origin mutations are rejected',()=>{
  for(const origin of ['http://evil.example','null','http://localhost:3001']) assert.equal(run('POST',{origin}).res.code,403);
  assert.equal(run('DELETE',{'sec-fetch-site':'cross-site'}).res.code,403);
});
test('read-only requests are unaffected by write gate',()=>assert.equal(run('GET',{origin:'http://evil.example'}).passed,true));
test('security and private API caching headers set',()=>{
  const {req,res}=run('GET');securityHeaders(req,res,()=>{});noStore(req,res,()=>{});
  assert.equal(res.headers['X-Content-Type-Options'],'nosniff');assert.equal(res.headers['X-Frame-Options'],'DENY');assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('configured public origin supports TLS termination',()=>{
  const prior=process.env.UNIMARKET_PUBLIC_ORIGIN;try{process.env.UNIMARKET_PUBLIC_ORIGIN='https://market.example';assert.equal(run('POST',{origin:'https://market.example'}).passed,true);assert.equal(run('POST',{origin:'http://localhost:3000'}).res.code,403);}finally{if(prior===undefined)delete process.env.UNIMARKET_PUBLIC_ORIGIN;else process.env.UNIMARKET_PUBLIC_ORIGIN=prior;}
});
