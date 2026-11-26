const test=require('node:test');
const assert=require('node:assert/strict');
const {validId,reportInput,safetyError}=require('../server/safety-rules');
test('accept valid report targets and trim details',()=>{
  for(const type of ['user','listing','message']) assert.deepEqual(reportInput({type,id:'42',reason:'scam',details:' text '}),{type,id:42,reason:'scam',details:'text'});
});
test('reject invalid or oversized report content',()=>{
  for(const input of [{type:'bad'},{id:'2 OR 1=1'},{reason:'bad'},{details:'x'.repeat(1001)},{details:'\0'},{details:123}]) assert.equal(reportInput({type:'message',id:1,reason:'spam',...input}),null);
});
test('validate IDs and translate contact failures without exposing database text',()=>{
  for(const id of [null,0,-1,1.5,true,'1e2',2147483648])assert.equal(validId(id),null);
  for(const [code,status] of [['UMB01',403],['UMB02',429],['UMB03',403]]){
    const res={status(n){this.code=n;return this;},json(body){this.body=body;}};
    assert.equal(safetyError({code,message:'private database detail'},res),true);assert.equal(res.code,status);assert.doesNotMatch(res.body.error,/private/);
  }
  assert.equal(safetyError({code:'other'},{}),false);
});
