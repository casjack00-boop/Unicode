const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSearch,parsePreferences,validId}=require('../server/notification-rules');
test('saved searches normalize ISBN-10 and preserve price and category',()=>{
 assert.deepEqual(parseSearch({term:'0-13-235088-2',category:'textbooks',max_price_cents:4000}),{term:'0-13-235088-2',category:'textbooks',isbn:'9780132350884',max:4000});
 assert.deepEqual(parseSearch({term:'  office chair  '}),{term:'office chair',category:'all',isbn:null,max:null});
});
test('saved searches reject invalid category, price, and term',()=>{
 for(const value of [{term:'x'},{term:'x'.repeat(121)},{term:'desk',category:'invalid'},{term:'desk',max_price_cents:'12'},{term:'desk',max_price_cents:-1},{term:'desk',max_price_cents:1.5},{term:'desk',max_price_cents:2147483648},{term:'9780132350884',category:'furniture'},null])assert.equal(parseSearch(value),null);
});
test('all preferences require booleans; false is retained',()=>{
 assert.deepEqual(parsePreferences({messages:false,transactions:true,price_drops:false,saved_searches:true}),[false,true,false,true]);
 assert.equal(parsePreferences({messages:'false',transactions:true,price_drops:false,saved_searches:true}),null);
 assert.equal(parsePreferences({messages:true}),null);
});
test('notification ids accept bigint strings without rounding',()=>{
 assert.equal(validId('9223372036854775807'),true);
 for(const value of ['9223372036854775808','0','-1','1.1','1e2','1 OR 1=1',1,null])assert.equal(validId(value),false);
});
