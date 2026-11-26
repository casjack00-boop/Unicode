const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const student = { id: 7, display_name: 'Student', created_at: '2026-11-26', email: 'student@example.edu' };
function browser(search = '?id=7') {
  const elements = new Map(), requests = [], responses = [];
  const element = () => ({ hidden: true, textContent: '', value: '', dataset: {}, events: {}, open: false,
    addEventListener(key, fn) { this.events[key] = fn; }, setAttribute() {}, replaceChildren() {}, append() {},
    showModal() { this.open = true; }, close() { this.open = false; this.events.close?.(); }
  });
  const el = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const window = { events: {}, addEventListener(key, fn) { this.events[key] = fn; }, confirm: () => true };
  const context = vm.createContext({ document: { getElementById: el, createElement: element }, URLSearchParams, location: { search }, window,
    fetch: async (url, options) => { requests.push({ url, options }); assert.ok(responses.length, 'Unexpected request: '+url); const data = responses.shift(); return { ok: !data.error, status: data.status || 200, json: async () => data }; }
  });
  const run = code => vm.runInContext(code, context);
  run(read('public/profile.js').replace(/\nloadProfile\(\);/, '\n'));
  context.student = student;
  run('showUser(student)');
  return { el, run, requests, responses, window };
}
function profileRoute(id, viewer) {
  const routes = {}, calls = [];
  const router = {use(){}, get(url, fn){routes[url]=fn;}, patch(){}};
  vm.runInNewContext(read('server/routes/profiles.js'), {require(name){
    if(name==='express')return {Router:()=>router};
    if(name==='../db')return {async query(sql,params){calls.push({sql,params});return {rows:calls.length===1?[student]:[]};}};
    return ()=>{};
  },module:{},console});
  const res = {json(data){this.body=data;},status(){return this;}};
  return {calls,res,run:()=>routes['/:id']({params:{id:String(id)},user:{id:viewer}},res)};
}
test('profile ownership is determined by the authenticated session, including direct self-profile URLs',async()=>{
  for(const viewer of [7,9]){const r=profileRoute(7,viewer);await r.run();assert.equal(r.res.body.is_owner,viewer===7);assert.equal(/\bemail\b/.test(r.calls[0].sql),viewer===7);}
});
test('student ID is displayed for the owner and hidden for ordinary viewers',()=>{
  const b=browser('');assert.equal(b.el('own-student-id').textContent,'#7');assert.equal(b.el('own-student-id').hidden,false);
  b.run('ownProfile=false;showUser(student)');assert.equal(b.el('own-student-id').textContent,'');assert.equal(b.el('own-student-id').hidden,true);
  assert.match(read('public/profile.html'),/id="own-student-id"[^>]*hidden/);
});
test('only a verified moderator on another profile sees the shortcut; stale or denied responses cannot reveal it',async()=>{
  const b=browser();b.responses.push({allowed:false},{allowed:true},{allowed:true});
  await b.run('loadModerationAccess(0)');assert.equal(b.el('profile-moderation').hidden,true);assert.equal(b.el('own-student-id').hidden,true);assert.equal(b.el('own-student-id').textContent,'');
  await b.run('loadModerationAccess(0)');assert.equal(b.el('profile-moderation').hidden,false);assert.equal(b.el('own-student-id').hidden,false);assert.equal(b.el('own-student-id').textContent,'#7');
  b.run('clearModeration();profileGeneration++');await b.run('loadModerationAccess(0)');assert.equal(b.el('profile-moderation').hidden,true);assert.equal(b.el('own-student-id').hidden,true);assert.equal(b.el('own-student-id').textContent,'');
  b.run('ownProfile=true');await b.run('loadModerationAccess(1)');assert.equal(b.requests.length,3);
});
test('moderation shortcut loads the selected student and protected moderator accounts have no action form',async()=>{
  const b=browser();b.responses.push({allowed:true},{id:7,display_name:'Student',moderator:true});
  await b.run('loadModerationAccess(0)');b.el('profile-moderation').events.click();await flush();
  assert.equal(b.requests[1].url,'/api/support/moderation/accounts/7');assert.equal(b.el('profile-moderation-dialog').open,true);assert.equal(b.el('profile-moderation-form').hidden,true);
  assert.match(b.el('profile-moderation-status').textContent,/protected/);
});
test('suspension requires a reason and confirmation, targets the viewed account and refreshes to reinstatement',async()=>{
  const b=browser();b.responses.push({allowed:true},{id:7,display_name:'Student',moderator:false});
  await b.run('loadModerationAccess(0)');b.el('profile-moderation').events.click();await flush();
  const submit=()=>b.el('profile-moderation-form').events.submit({preventDefault(){}});
  await submit();assert.equal(b.requests.length,2);assert.match(b.el('profile-moderation-status').textContent,/Enter a reason/);
  b.el('profile-moderation-reason').value=' Test reason ';b.window.confirm=()=>false;await submit();assert.equal(b.requests.length,2);
  b.window.confirm=()=>true;b.responses.push({ok:true},{id:7,display_name:'Student',suspended_at:'2026-11-26',moderator:false},{listings:[]});await submit();
  assert.equal(b.requests[2].url,'/api/support/moderation/accounts/7');assert.equal(b.requests[2].options.method,'PATCH');assert.deepEqual(JSON.parse(b.requests[2].options.body),{action:'suspend',reason:'Test reason'});
  assert.equal(b.el('profile-moderation-submit').textContent,'Reinstate account');assert.equal(b.el('profile-moderation-status').textContent,'Account suspended.');
  b.el('profile-moderation-reason').value='Resolved';b.responses.push({ok:true},{id:7,display_name:'Student',moderator:false},{listings:[]});await submit();
  assert.deepEqual(JSON.parse(b.requests[5].options.body),{action:'reinstate',reason:'Resolved'});assert.equal(b.el('profile-moderation-submit').textContent,'Suspend account');
});
test('revoked permissions hide the action and the shortcut; pagehide clears owner ID and moderation state',async()=>{
  const b=browser();b.responses.push({allowed:true},{id:7,display_name:'Student',moderator:false});await b.run('loadModerationAccess(0)');b.el('profile-moderation').events.click();await flush();
  b.el('profile-moderation-reason').value='Reason';b.responses.push({error:'Moderator access required.',status:403});await b.el('profile-moderation-form').events.submit({preventDefault(){}});
  assert.equal(b.el('profile-moderation-form').hidden,true);assert.equal(b.el('profile-moderation').hidden,true);assert.equal(b.el('own-student-id').hidden,true);assert.equal(b.el('own-student-id').textContent,'');
  b.window.events.pagehide();assert.equal(b.el('profile-moderation-dialog').open,false);assert.equal(b.el('own-student-id').textContent,'');assert.equal(b.el('profile').hidden,true);
});
test('failed moderator permission refresh hides the account ID and moderation shortcut',async()=>{
  const b=browser();b.responses.push({allowed:true},{error:'Access denied',status:403});
  await b.run('loadModerationAccess(0)');assert.equal(b.el('own-student-id').textContent,'#7');
  await b.run('loadModerationAccess(0)');assert.equal(b.el('own-student-id').hidden,true);assert.equal(b.el('own-student-id').textContent,'');assert.equal(b.el('profile-moderation').hidden,true);
});
