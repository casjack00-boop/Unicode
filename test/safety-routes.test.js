const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const rules=require('../server/safety-rules');
const source=fs.readFileSync(path.join(__dirname,'../server/routes/safety.js'),'utf8');
function setup(result){
  const routes={}, calls=[];
  const router={use(){}};
  for(const method of ['get','post','delete'])router[method]=(url,handler)=>{routes[method+url]=handler;};
  const pool={async query(sql,params){calls.push({sql,params});return result;}};
  vm.runInNewContext(source,{require(name){if(name==='express')return{Router:()=>router};if(name==='../db')return pool;if(name==='../safety-rules')return rules;return ()=>{};},module:{},console});
  const req={user:{id:42},body:{type:'message',id:7,reason:'spam',reported_user_id:999},params:{id:'7'}};
  const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  return {routes,calls,req,res};
}
test('message reporting derives target and evidence from participant-scoped database query',async()=>{
  const {routes,calls,req,res}=setup({rowCount:1,rows:[{id:10}]});
  await routes['post/reports'](req,res);
  assert.equal(res.code,201);assert.equal(res.body.id,10);
  assert.match(calls[0].sql,/\(\$2=c.buyer_id OR \$2=c.seller_id\) AND m.sender_id<>\$2/);
  assert.match(calls[0].sql,/m.body AS evidence/);
  assert.deepEqual(Array.from(calls[0].params),[7,42,'message','spam','']);
});
test('ineligible or missing report target returns 404',async()=>{
  const {routes,req,res}=setup({rowCount:0,rows:[]});await routes['post/reports'](req,res);assert.equal(res.code,404);
});
test('block list and unblock operations are scoped to the session account',async()=>{
  const {routes,calls,req,res}=setup({rowCount:0,rows:[]});
  await routes['get/blocks'](req,res);await routes['delete/blocks/:id'](req,res);
  assert.match(calls[0].sql,/b.blocker_id=\$1/);assert.deepEqual(Array.from(calls[0].params),[42]);
  assert.match(calls[1].sql,/blocker_id=\$1 AND blocked_id=\$2/);assert.deepEqual(Array.from(calls[1].params),[42,7]);
});
test('self-block is rejected before any database call',async()=>{
  const {routes,calls,req,res}=setup({});req.body={id:42};await routes['post/blocks'](req,res);assert.equal(res.code,400);assert.equal(calls.length,0);
});
