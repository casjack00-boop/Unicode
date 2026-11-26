const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {mailMode,sendCode}=require('../server/mail');
const source=fs.readFileSync(path.join(__dirname,'../server/routes/support.js'),'utf8');
function setup(results=[]){
  const handlers={},calls=[],router={use(...args){handlers.use=args;}};
  for(const verb of ['get','post','patch'])router[verb]=(url,...fns)=>{handlers[verb+url]=fns;};
  const gate=()=>{};
  const client={async query(sql,params=[]){calls.push({sql,params:Array.from(params)});if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return{};assert.ok(results.length);return results.shift();},release(){}};
  vm.runInNewContext(source,{require(n){if(n==='express')return{Router:()=>router};if(n==='../db')return{query:client.query,connect:async()=>client};return gate;},module:{},console});
  const req={user:{id:9},params:{id:'7'},query:{user_id:99},body:{subject:'Help',details:'Issue',reply:'Resolved',action:'suspend',reason:'Verified report',user_id:99}};
  const res={code:200,status(n){this.code=n;return this;},json(data){this.body=data;return this;},setHeader(){}};
  return{handlers,calls,req,res,gate};
}
test('all support endpoints require login',()=>{const s=setup();assert.equal(s.handlers.use[0],s.gate);});
test('ticket history uses session user not caller supplied ID',async()=>{const s=setup([{rows:[]}]);await s.handlers['get/tickets'][0](s.req,s.res);assert.deepEqual(s.calls[0].params,[9]);assert.match(s.calls[0].sql,/WHERE user_id=\$1/);});
test('invalid ticket rejected before database query',async()=>{const s=setup();s.req.body.details=' ';await s.handlers['post/tickets'][0](s.req,s.res);assert.equal(s.res.code,400);assert.equal(s.calls.length,0);});
test('ticket creation serializes rate checks and scopes author',async()=>{const s=setup([{rowCount:1,rows:[{id:3}]}]);await s.handlers['post/tickets'][0](s.req,s.res);assert.equal(s.res.code,201);assert.match(s.calls[1].sql,/pg_advisory_xact_lock/);assert.deepEqual(s.calls[2].params,[9,'Help','Issue']);assert.match(s.calls[2].sql,/count\(\*\)/);});
test('ticket quota returns 429',async()=>{const s=setup([{rowCount:0,rows:[]}]);await s.handlers['post/tickets'][0](s.req,s.res);assert.equal(s.res.code,429);});
test('nonmoderators cannot access ticket or account administration',async()=>{for(const key of ['get/moderation/tickets','patch/moderation/tickets/:id','get/moderation/accounts','get/moderation/accounts/:id','patch/moderation/accounts/:id']){const s=setup([{rowCount:0}]);let next=false;await s.handlers[key][0](s.req,s.res,()=>next=true);assert.equal(next,false);assert.equal(s.res.code,403);}});
test('ticket resolution rechecks moderator privileges',async()=>{const s=setup([{rowCount:1}]);await s.handlers['patch/moderation/tickets/:id'][1](s.req,s.res);assert.match(s.calls[0].sql,/EXISTS\(SELECT 1 FROM moderation_admins/);assert.deepEqual(s.calls[0].params,[7,'Resolved',9]);});
test('self suspension refused',async()=>{const s=setup();s.req.params.id='9';await s.handlers['patch/moderation/accounts/:id'][1](s.req,s.res);assert.equal(s.res.code,400);assert.equal(s.calls.length,0);});
test('account action protects moderators and records audit atomically',async()=>{const s=setup([{rowCount:1}]);await s.handlers['patch/moderation/accounts/:id'][1](s.req,s.res);assert.match(s.calls[0].sql,/NOT EXISTS\(SELECT 1 FROM moderation_admins/);assert.match(s.calls[0].sql,/INSERT INTO account_moderation_actions/);assert.deepEqual(s.calls[0].params,[7,'suspend',9,'Verified report']);});
test('production disallows console and unconfigured mail',()=>{assert.throws(()=>mailMode({NODE_ENV:'production',UNIMARKET_MAIL_MODE:'console'}));assert.throws(()=>mailMode({NODE_ENV:'production'}));assert.equal(mailMode({}),'console');});
test('development code logs only in console mode',async()=>{const lines=[];assert.equal(await sendCode('test@uttyler.edu','123456',{env:{},logger:{log:v=>lines.push(v)}}),false);assert.match(lines[0],/123456/);});
test('configured email sends code using provider without logging it',async()=>{let request;const env={UNIMARKET_MAIL_MODE:'email',RESEND_API_KEY:'fake',UNIMARKET_MAIL_FROM:'sender@example.test'};const sent=await sendCode('test@uttyler.edu','123456',{env,fetcher:async(url,opts)=>{request={url,opts};return{ok:true};},logger:{log(){throw Error('Unexpected log');}}});assert.equal(sent,true);assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.opts.headers.Authorization,'Bearer fake');assert.deepEqual(JSON.parse(request.opts.body).to,['test@uttyler.edu']);});
test('email provider failure does not fall back to console',async()=>{await assert.rejects(sendCode('test@uttyler.edu','123456',{env:{UNIMARKET_MAIL_MODE:'email',RESEND_API_KEY:'fake',UNIMARKET_MAIL_FROM:'sender@example.test'},fetcher:async()=>({ok:false}),logger:{log(){throw Error('Unexpected log');}}}),/Email delivery failed/);});

test('account directory returns suspended students and recent audit actions',async()=>{const data={suspended:[{id:7}],actions:[{id:1}]};const s=setup([{rows:[data]}]);await s.handlers['get/moderation/accounts'][1](s.req,s.res);assert.equal(s.res.body,data);assert.match(s.calls[0].sql,/WHERE suspended_at IS NOT NULL/);assert.match(s.calls[0].sql,/FROM account_moderation_actions/);assert.match(s.calls[0].sql,/LIMIT 100/);});
