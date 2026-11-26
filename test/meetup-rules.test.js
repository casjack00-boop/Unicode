const test=require('node:test');
const assert=require('node:assert/strict');
const {parseAvailability,reservationExpired}=require('../server/meetup-rules');
const {transition}=require('../server/deal-rules');
const slot={day:3,start:'17:00',end:'21:00'};
test('weekly availability is optional, canonical and sorted',()=>{
  assert.deepEqual(parseAvailability([]),[]);
  assert.deepEqual(parseAvailability([{...slot,extra:'ignored'},{day:1,start:'08:00',end:'09:00'}]),[{day:1,start:'08:00',end:'09:00'},slot]);
});
test('invalid, duplicate and overnight availability is rejected',()=>{
  for(const value of [null,{},[null],[slot,slot],[{...slot,day:7}],[{...slot,day:'3'}],[{...slot,start:'8:00'}],[{...slot,end:'24:00'}],[{...slot,end:'16:00'}],[{...slot,end:'17:00'}],Array(8).fill(slot)]) assert.equal(parseAvailability(value),null);
});
const now=Date.parse('2026-11-26T18:00:00Z');
const deal={buyer_id:1,seller_id:2,status:'reserved',revision:1,meetup_confirmed:true,meetup_at:'2026-11-26T15:00:00Z',reservation_expires_at:new Date(now).toISOString(),buyer_confirmed:false,seller_confirmed:false};
test('deadline is inclusive and only applies to unconfirmed reserved deals',()=>{
  assert.equal(reservationExpired(deal,now),true);
  assert.equal(reservationExpired(deal,now-1),false);
  for(const changes of [{status:'completed'},{buyer_confirmed:true},{seller_confirmed:true},{reservation_expires_at:null}])assert.equal(reservationExpired({...deal,...changes},now),false);
});
test('expired reservation cannot complete or extend, but can close',()=>{
  const listing={status:'reserved'};
  for(const action of ['complete','meetup','confirm_meetup'])assert.throws(()=>transition(deal,listing,1,{action,revision:1},now),{status:409});
  assert.equal(transition(deal,listing,1,{action:'cancel',revision:1},now).status,'cancelled');
});
test('handover started remains eligible for the other confirmation after deadline',()=>{
  assert.equal(transition({...deal,buyer_confirmed:true},{status:'reserved'},2,{action:'complete',revision:1},now).status,'completed');
});
