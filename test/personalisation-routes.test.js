const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(route, results = []) {
  const handlers = {}, calls = [], registration = [];
  const gate = () => {};
  const router = { use(...fns) { registration.push({type:'use', fns}); } };
  for (const verb of ['get','post','put','patch','delete']) {
    router[verb] = (url, ...fns) => { handlers[verb+url] = fns; registration.push({type:verb+url, fns}); };
  }
  const source = fs.readFileSync(path.join(__dirname,'../server/routes',route+'.js'),'utf8');
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '../requireUser') return gate;
      if (name === '../db') return {async query(sql,params) {
        calls.push({sql, params: Array.from(params)});
        assert.ok(results.length, 'Unexpected database call');
        return results.shift();
      }};
      return {};
    }, module: {}, console
  });
  const req = {user:{id:9},params:{id:'7'},body:{},query:{user_id:99}};
  const res = {code:200,headers:{},status(n){this.code=n;return this;},json(data){this.body=data;return this;},setHeader(k,v){this.headers[k]=v;}};
  return {handlers,calls,registration,gate,req,res};
}

test('recommendation routes follow authentication and private no-store middleware', () => {
  const {registration,gate,req,res} = setup('discovery');
  const index = registration.findIndex(r => r.type === 'use' && r.fns[0] === gate);
  assert.ok(index >= 0);
  for (const type of ['get/recommendations','get/recommendation-preferences','put/recommendation-preferences']) {
    assert.ok(registration.findIndex(r=>r.type===type) > index);
  }
  let advanced = false;
  registration[index].fns[1](req,res,()=>{advanced=true;});
  assert.equal(res.headers['Cache-Control'],'private, no-store');
  assert.equal(advanced,true);
});
test('disabled consent returns no personalised results using the authenticated account', async () => {
  const {handlers,calls,req,res} = setup('discovery',[{rows:[{enabled:false,listings:[]}]}]);
  await handlers['get/recommendations'][0](req,res);
  assert.deepEqual(res.body,{enabled:false,listings:[]});
  assert.deepEqual(calls[0].params,[9]);
  assert.match(calls[0].sql,/CASE WHEN u\.personalised_recommendations/);
  assert.match(calls[0].sql,/uni_personal_recommendations\(u.id\)/);
});
test('enabled recommendations return only the scoped query result', async () => {
  const result = {enabled:true,listings:[{id:11,title:'Office chair'}]};
  const {handlers,calls,req,res} = setup('discovery',[{rows:[result]}]);
  await handlers['get/recommendations'][0](req,res);
  assert.deepEqual(res.body,result);
  assert.deepEqual(calls[0].params,[9]);
  assert.match(calls[0].sql,/u.id=\$1 AND u.verified/);
});
test('consent lookup ignores caller-supplied account ID', async () => {
  const {handlers,calls,req,res} = setup('discovery',[{rows:[{enabled:true}]}]);
  await handlers['get/recommendation-preferences'][0](req,res);
  assert.equal(res.body.enabled,true);
  assert.deepEqual(calls[0].params,[9]);
});
test('consent mutation is scoped to session and accepts true and false', async () => {
  for (const enabled of [true,false]) {
    const {handlers,calls,req,res} = setup('discovery',[{rows:[{enabled}]}]);
    req.body={enabled,user_id:99};
    await handlers['put/recommendation-preferences'][0](req,res);
    assert.equal(res.body.enabled,enabled);
    assert.deepEqual(calls[0].params,[9,enabled]);
    assert.match(calls[0].sql,/WHERE id=\$1 AND verified/);
  }
});
test('nonboolean or absent consent is rejected without a database call', async () => {
  for (const body of [{enabled:'false'},{enabled:1},{enabled:null},{}]) {
    const {handlers,calls,req,res} = setup('discovery');
    req.body=body;
    await handlers['put/recommendation-preferences'][0](req,res);
    assert.equal(res.code,400);
    assert.equal(calls.length,0);
  }
});
test('missing verified student yields 404 for all personalisation routes', async () => {
  for (const key of ['get/recommendations','get/recommendation-preferences','put/recommendation-preferences']) {
    const {handlers,req,res}=setup('discovery',[{rows:[]}]);
    req.body={enabled:true};
    await handlers[key][0](req,res);
    assert.equal(res.code,404);
  }
});
test('profile biography is trimmed, passed as a parameter and owner scoped', async () => {
  const {handlers,calls,req,res} = setup('profiles',[{rows:[{biography:'Hello <world>'}]}]);
  req.body={display_name:' Student ',housing:null,biography:'  Hello <world>  ',user_id:99};
  await handlers['patch/me'][0](req,res);
  assert.deepEqual(calls[0].params,['Student',null,'Hello <world>',9]);
  assert.match(calls[0].sql,/WHERE id = \$4 AND verified = TRUE/);
  assert.equal(res.body.user.biography,'Hello <world>');
});
test('empty biography clears it and omitted field preserves legacy biography', async () => {
  for (const [bio,expected] of [['   ',''],[undefined,null]]) {
    const {handlers,calls,req,res}=setup('profiles',[{rows:[{id:9}]}]);
    req.body={display_name:'Student',housing:null,biography:bio};
    await handlers['patch/me'][0](req,res);
    assert.equal(res.code,200);
    assert.equal(calls[0].params[2],expected);
    assert.match(calls[0].sql,/COALESCE\(\$3, biography\)/);
  }
});
test('invalid biography types or length fail before database access', async () => {
  for (const biography of [null,5,{},'x\u0000y','x'.repeat(501)]) {
    const {handlers,calls,req,res}=setup('profiles');
    req.body={display_name:'Student',housing:null,biography};
    await handlers['patch/me'][0](req,res);
    assert.equal(res.code,400);
    assert.equal(calls.length,0);
  }
});
test('500 characters are accepted',async()=>{
  const {handlers,calls,req,res}=setup('profiles',[{rows:[{id:9}]}]);
  req.body={display_name:'Student',housing:null,biography:'x'.repeat(500)};
  await handlers['patch/me'][0](req,res);
  assert.equal(res.code,200);
  assert.equal(calls[0].params[2].length,500);
});
test('public profile selects biography without email or consent; own profile includes email', async () => {
  for (const [route,id,own] of [['get/:id',7,false],['get/me',9,true]]) {
    const {handlers,calls,req,res}=setup('profiles',[{rows:[{id,biography:'Hi'}]},{rows:[]}]);
    await handlers[route][0](req,res);
    assert.equal(res.body.user.biography,'Hi');
    assert.deepEqual(calls[0].params,[id]);
    assert.match(calls[0].sql,/biography/);
    assert.equal(/\bemail\b/.test(calls[0].sql),own);
    assert.doesNotMatch(calls[0].sql,/personalised_recommendations/);
  }
});
test('biography is rendered as text and the form explicitly describes visibility', () => {
  const js=fs.readFileSync(path.join(__dirname,'../public/profile.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../public/profile.html'),'utf8');
  assert.match(js,/el\('profile-biography'\)\.textContent/);
  assert.match(html,/Biography \(optional, visible to other students\)/);
  assert.match(html,/<textarea id="biography"[^>]*maxlength="500"/);
});
