const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../server/routes/reputation.js'),'utf8');
function setup(results=[]){
  const handlers={},calls=[],router={use(){}};
  for(const verb of ['get','post','patch'])router[verb]=(url,...fn)=>{handlers[verb+url]=fn;};
  vm.runInNewContext(source,{require(n){if(n==='express')return{Router:()=>router};if(n==='../db')return{async query(sql,params){calls.push({sql,params});if(!results.length)throw new Error('Unexpected query');return results.shift();}};return()=>{};},module:{},console});
  const req={user:{id:9},params:{id:'7',type:'report'},body:{stars:5,comment:'Good',details:'Item not received',status:'reviewed'},query:{}};
  const res={code:200,status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
  return{handlers,calls,req,res};
}
test('nonparticipant or incomplete exchange cannot submit a review',async()=>{const{handlers,calls,req,res}=setup([{rows:[]}]);await handlers['post/deals/:id/review'][0](req,res);assert.equal(res.code,403);assert.match(calls[0].sql,/status='completed' AND \$2 IN\(buyer_id,seller_id\)/);assert.equal(calls[0].params[1],9);});
test('seller review of buyer uses completed deal identity',async()=>{const{handlers,calls,req,res}=setup([{rows:[{seller_id:9,buyer_id:3}]},{rowCount:1}]);await handlers['post/deals/:id/review'][0](req,res);assert.equal(res.body.ok,true);assert.match(calls[1].sql,/INSERT INTO buyer_reviews/);assert.deepEqual(Array.from(calls[1].params),[7,5,'Good']);});
test('buyer review of seller preserves existing pair rule and links deal',async()=>{const{handlers,calls,req,res}=setup([{rows:[{seller_id:3,buyer_id:9}]},{rowCount:1}]);await handlers['post/deals/:id/review'][0](req,res);assert.equal(res.body.ok,true);assert.match(calls[1].sql,/ON CONFLICT\(seller_id,rater_id\)/);assert.deepEqual(Array.from(calls[1].params),[3,9,5,'Good',7]);});
test('invalid rating rejected before query',async()=>{const{handlers,calls,req,res}=setup();req.body.stars=6;await handlers['post/deals/:id/review'][0](req,res);assert.equal(res.code,400);assert.equal(calls.length,0);});
test('dispute is scoped to participant and duplicate requests fail',async()=>{const{handlers,calls,req,res}=setup([{rowCount:0,rows:[]}]);await handlers['post/deals/:id/dispute'][0](req,res);assert.equal(res.code,409);assert.match(calls[0].sql,/\$2 IN\(buyer_id,seller_id\)/);assert.match(calls[0].sql,/ON CONFLICT\(deal_id,reporter_id\)/);});
test('ordinary students denied moderation list and mutation',async()=>{for(const name of ['get/moderation','patch/moderation/:type/:id']){const{handlers,calls,req,res}=setup([{rows:[]}]);let advanced=false;await handlers[name][0](req,res,()=>{advanced=true;});assert.equal(res.code,403);assert.equal(advanced,false);assert.equal(calls.length,1);}});
test('moderation update and audit are one statement with permission recheck',async()=>{const{handlers,calls,req,res}=setup([{rowCount:1,rows:[{id:1}]}]);await handlers['patch/moderation/:type/:id'][1](req,res);assert.equal(res.body.ok,true);assert.match(calls[0].sql,/WITH changed AS \(UPDATE safety_reports/);assert.match(calls[0].sql,/EXISTS\(SELECT 1 FROM moderation_admins/);assert.match(calls[0].sql,/INSERT INTO moderation_actions/);});
test('private deal review and dispute details denied to outsiders',async()=>{const{handlers,calls,req,res}=setup([{rows:[]}]);await handlers['get/deals/:id'][0](req,res);assert.equal(res.code,404);assert.match(calls[0].sql,/d.id=\$1 AND \$2 IN\(d.buyer_id,d.seller_id\)/);});

test('moderation overview denies ordinary students',async()=>{const{handlers,calls,req,res}=setup([{rows:[]}]);let next=false;await handlers['get/moderation/summary'][0](req,res,()=>next=true);assert.equal(res.code,403);assert.equal(next,false);assert.equal(calls.length,1);});
test('overview returns exact unresolved counts and latest case snapshots in one query',async()=>{const snapshot={tickets_count:121,reports_count:2,disputes_count:0,suspended_count:1,ticket_latest:{id:9},report_latest:null,dispute_latest:null,account_latest:null};const{handlers,calls,req,res}=setup([{rows:[snapshot]}]);await handlers['get/moderation/summary'][1](req,res);assert.equal(res.body,snapshot);assert.equal(calls.length,1);for(const table of ['support_tickets','safety_reports','transaction_disputes'])assert.match(calls[0].sql,new RegExp('count\\(\\*\\)::int FROM '+table+" WHERE status='open'"));assert.match(calls[0].sql,/count\(\*\)::int FROM users WHERE suspended_at IS NOT NULL/);assert.match(calls[0].sql,/ORDER BY created_at DESC,id DESC LIMIT 1/);assert.doesNotMatch(calls[0].sql,/\bevidence\b|\bdetails\b/);});
