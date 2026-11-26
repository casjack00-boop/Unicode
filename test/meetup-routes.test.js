const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {startReservationExpiry}=require('../server/reservation-expiry');
function setup(results=[]){
  const routes={},calls=[],gate=()=>{},middleware=[];
  const router={use(...fns){middleware.push(...fns);}};
  for(const method of ['get','post','patch','put'])router[method]=(url,fn)=>{routes[method+url]=fn;};
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/routes/transactions'),'utf8'),{require(name){
    if(name==='express')return {Router:()=>router};if(name==='../requireUser')return gate;
    if(name==='../db')return {async query(sql,params){calls.push({sql,params:Array.from(params)});assert.ok(results.length);return results.shift();}};
    return require(name.replace('../','../server/'));
  },module:{},console});
  const req={user:{id:7},body:{},query:{user_id:99}};
  const res={code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;},setHeader(k,v){this[k]=v;}};
  return {routes,calls,req,res,middleware,gate};
}
test('availability routes require authentication and no-store',()=>{
  const {middleware,gate,req,res}=setup();assert.equal(middleware[0],gate);middleware[1](req,res,()=>{});assert.equal(res['Cache-Control'],'private, no-store');
});
test('availability reads and saves only the authenticated account',async()=>{
  const availability=[{day:3,start:'17:00',end:'21:00'}];const {routes,calls,req,res}=setup([{rows:[{meetup_availability:availability}]},{rows:[{meetup_availability:availability}]}]);
  await routes['get/availability'](req,res);assert.deepEqual(res.body.availability,availability);assert.deepEqual(calls[0].params,[7]);
  req.body={availability,user_id:99};await routes['put/availability'](req,res);assert.equal(res.code,200);assert.deepEqual(calls[1].params,[7,JSON.stringify(availability)]);
});
test('invalid availability does not reach database',async()=>{
  const {routes,calls,req,res}=setup();req.body={availability:[{day:3,start:'20:00',end:'10:00'}]};await routes['put/availability'](req,res);assert.equal(res.code,400);assert.equal(calls.length,0);
});
test('deal schedule query is participant scoped, open only, and block aware',async()=>{
  const {routes,calls,req,res}=setup([{rows:[]}]);await routes['get/'](req,res);assert.deepEqual(calls[0].params,[7]);assert.match(calls[0].sql,/d.buyer_id=\$1 OR d.seller_id=\$1/);assert.match(calls[0].sql,/NOT uni_contact_blocked/);assert.match(calls[0].sql,/d.status IN \('pending','reserved'\)/);
});
test('expiry worker runs immediately and prevents overlapping sweeps',async()=>{
  let calls=0,release;const stop=startReservationExpiry({query(sql){assert.match(sql,/uni_expire_reservations/);calls++;return new Promise(resolve=>{release=resolve;});}},{interval:5});
  try{await new Promise(r=>setTimeout(r,25));assert.equal(calls,1);release();await new Promise(r=>setTimeout(r,15));assert.equal(calls,2);release();}finally{stop();}
});
