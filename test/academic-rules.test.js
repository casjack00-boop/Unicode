const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePreferences, parseRequest, validId } = require('../server/academic-rules');
test('academic preferences are optional and normalize department codes', () => {
  assert.deepEqual(parsePreferences({major:' Computer Science ',department:'csci'}),{major:'Computer Science',department:'CSCI'});
  assert.deepEqual(parsePreferences({major:'',department:''}),{major:null,department:null});
  assert.equal(parsePreferences({major:'x'.repeat(81)}),null);
  assert.equal(parsePreferences({department:'<script>'}),null);
});
test('textbook requests normalize ISBN and retain zero budget', () => {
  assert.deepEqual(parseRequest({title:' Clean Code ',isbn:'0-13-235088-2',department:'csci',course:' 3301 ',max_price_cents:0}),
    {title:'Clean Code',isbn:'9780132350884',department:'CSCI',course:'3301',notes:null,max:0});
  assert.deepEqual(parseRequest({title:'Calculus'}),{title:'Calculus',isbn:null,department:null,course:null,notes:null,max:null});
});
test('invalid requests are rejected rather than silently dropping constraints', () => {
  for(const body of [null,{title:' '},{title:'x'.repeat(121)},{title:'Book',isbn:'9780132350885'},{title:'Book',isbn:123},{title:'Book',course:'x'.repeat(17)},{title:'Book',notes:'x'.repeat(501)},{title:'Book',max_price_cents:-1},{title:'Book',max_price_cents:1.5},{title:'Book',max_price_cents:'300'},{title:'Book',max_price_cents:2147483648}]) assert.equal(parseRequest(body),null);
});
test('request ids require a valid positive PostgreSQL integer',()=>{
  assert.equal(validId('2147483647'),true);
  for(const id of ['0','-1','1.5','1e2','2147483648','1 OR 1=1',null,1])assert.equal(validId(id),false);
});
