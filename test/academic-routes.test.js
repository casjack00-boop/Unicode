const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const rules=require('../server/academic-rules');
function setup(result={rows:[],rowCount:0}){
  const calls=[],handlers={},router={use(){}};
  for(const verb of ['get','post','put','patch'])router[verb]=(url,fn)=>{handlers[verb+url]=fn;};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server/routes/academic.js'),'utf8'),{
    require(name){if(name==='express')return{Router:()=>router};if(name==='../db')return{async query(sql,params){calls.push({sql,params});return result;}};if(name==='../academic-rules')return rules;return ()=>{};},module:{},console
  });
  const req={user:{id:42},body:{major:'Computer Science',department:'csci',user_id:999},params:{id:'7'}};
  const res={code:200,status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
  return{calls,handlers,req,res};
}
test('preferences read and write only the session account',async()=>{
  const {calls,handlers,req,res}=setup();await handlers['get/preferences'](req,res);await handlers['put/preferences'](req,res);
  assert.deepEqual(Array.from(calls[0].params),[42]);assert.deepEqual(Array.from(calls[1].params),[42,'Computer Science','CSCI']);
});
test('closing another account request cannot succeed',async()=>{
  const {calls,handlers,req,res}=setup();await handlers['patch/requests/:id/close'](req,res);
  assert.match(calls[0].sql,/id=\$1 AND user_id=\$2 AND status='active'/);assert.deepEqual(Array.from(calls[0].params),['7',42]);assert.equal(res.code,404);
});
test('matches use request ID, current account and block filtering',async()=>{
  const {calls,handlers,req,res}=setup();await handlers['get/requests/:id/matches'](req,res);
  assert.match(calls[0].sql,/uni_textbook_match\(r,l\)/);assert.match(calls[0].sql,/user_blocks/);assert.deepEqual(Array.from(calls[0].params),[42,'7']);
});
test('trending counts recent saves only for active items',async()=>{
  const {calls,handlers,req,res}=setup();await handlers['get/trending'](req,res);
  assert.match(calls[0].sql,/interval '7 days'/);assert.match(calls[0].sql,/sl.user_id<>t.seller_id/);assert.match(calls[0].sql,/l.status='active'/);
});
