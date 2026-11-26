'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {storePhotoBatch}=require('../server/photo-storage');
function mock({owner=7,positions=[],failAt=0}={}) {
  const calls=[];let inserts=0,released=false;
  const c={async query(sql,args){calls.push([sql,args]);if(sql.startsWith('SELECT seller'))return{rowCount:1,rows:[{seller_id:owner}]};if(sql.startsWith('SELECT position'))return{rows:positions.map(position=>({position}))};if(sql.startsWith('INSERT')){inserts++;if(inserts===failAt)throw Error('Insert failure');return{rows:[{id:inserts}]};}return{};},release(){released=true;}};
  return{pool:{connect:async()=>c},calls,released:()=>released};
}
test('photo batch fills available positions under row lock and commits once',async()=>{const m=mock({positions:[2]});assert.deepEqual(await storePhotoBatch(m.pool,2,7,['a','b']),[{id:1,url:'a'},{id:2,url:'b'}]);assert.match(m.calls[1][0],/FOR UPDATE/);assert.deepEqual(m.calls.filter(c=>c[0].startsWith('INSERT')).map(c=>c[1]),[[2,'a',1],[2,'b',3]]);assert.equal(m.calls.at(-1)[0],'COMMIT');assert.equal(m.released(),true);});
test('photo batch rejects full listing after acquiring lock',async()=>{const m=mock({positions:[1,2]});await assert.rejects(storePhotoBatch(m.pool,2,7,['a','b']),{status:400});assert.equal(m.calls.at(-1)[0],'ROLLBACK');assert.equal(m.calls.some(c=>c[0].startsWith('INSERT')),false);});
test('photo batch rechecks ownership and rolls back on second insert failure',async()=>{const wrong=mock({owner:8});await assert.rejects(storePhotoBatch(wrong.pool,2,7,['a']),{status:403});assert.equal(wrong.calls.at(-1)[0],'ROLLBACK');const m=mock({failAt:2});await assert.rejects(storePhotoBatch(m.pool,2,7,['a','b']),/Insert failure/);assert.equal(m.calls.at(-1)[0],'ROLLBACK');assert.equal(m.released(),true);});
