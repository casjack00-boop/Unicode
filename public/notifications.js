(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const kinds = {messages:'Message', transactions:'Transaction', price_drops:'Price drop', saved_searches:'Saved search'};
  const elem = (tag,text,cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
  const options = (method,body) => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  async function api(path='',opts={}) {
    const r=await fetch('/api/notifications'+path,{cache:'no-store',...opts});
    const data=await r.json(); if(!r.ok)throw Object.assign(new Error(data.error||'Notification request failed.'),{status:r.status}); return data;
  }
  const links = [...document.querySelectorAll('[data-notice-link]')];
  let polling=false;
  async function count() {
    if(!links.length||polling||document.hidden)return;
    polling=true;
    try { const {unread}=await api('/count'); for(const link of links){link.hidden=false;const badge=link.querySelector('span'); badge.hidden=unread===0;badge.textContent=unread>99?'99+':String(unread);link.setAttribute('aria-label',`Notifications, ${unread} unread`);} }
    catch(e){ if(e.status===401)for(const link of links)link.hidden=true; }
    finally{polling=false;}
  }
  if(links.length){count();setInterval(count,15000);document.addEventListener('visibilitychange',count);window.addEventListener('pageshow',()=>{for(const link of links)link.hidden=true;count();});}
  function destination(n){
    const id=encodeURIComponent(n.target_id);
    if(n.kind==='messages')return '/messages.html?id='+id;
    if(n.kind==='transactions')return '/transactions.html?deal='+id;
    return '/item.html?id='+id;
  }
  if($('notice-content')){
    let cursor=null,busy=false;
    const status = text => $('notice-status').textContent=text;
    function button(text,action){const b=elem('button',text);b.type='button';b.addEventListener('click',action);return b;}
    function failure(e){status(e.message);if(e.status===401){$('notice-content').hidden=true;$('notice-list').replaceChildren();$('notice-searches').replaceChildren();$('notice-login').hidden=false;}}
    async function run(action){if(busy)return;busy=true;try{await action();}catch(e){failure(e);}finally{busy=false;}}
    function card(n){
      const article=elem('article',undefined,'notice-entry');article.dataset.unread=String(!n.read_at);
      const heading=elem('h2',kinds[n.kind]||'Notification');const meta=elem('p',(n.read_at?'Read':'Unread')+' · '+new Date(n.created_at).toLocaleString(),'notice-meta');
      const link=elem('a','Open '+(n.kind==='messages'?'conversation':n.kind==='transactions'?'transaction':'listing'));link.href=destination(n);
      article.append(heading,meta,elem('p',n.body),link);
      if(!n.read_at)article.append(button('Mark as read',()=>run(async()=>{await api('/'+encodeURIComponent(n.id)+'/read',{method:'PATCH'});article.dataset.unread='false';meta.textContent='Read · '+new Date(n.created_at).toLocaleString();const readButton=article.querySelector('button');readButton.remove();link.focus();status('Notification marked as read.');count();})));
      return article;
    }
    async function load(older=false){const data=await api(older?'?before='+encodeURIComponent(cursor):'');const list=$('notice-list');if(!older)list.replaceChildren();for(const n of data.notifications)list.append(card(n));if(!list.childElementCount)list.append(elem('p','No notifications yet.'));cursor=data.next;$('notice-more').hidden=!cursor;$('notice-content').hidden=false;$('notice-login').hidden=true;status('Notifications up to date.');count();}
    async function searches(){const {searches}=await api('/searches');const list=$('notice-searches');list.replaceChildren();if(!searches.length)list.append(elem('p','No saved search alerts.'));for(const s of searches){const card=elem('div',undefined,'notice-entry');card.append(elem('p',s.term+' · '+s.category+(s.max_price_cents===null?'':' · Up to $'+(s.max_price_cents/100).toFixed(2))),button('Remove alert',()=>run(async()=>{await api('/searches/'+encodeURIComponent(s.id),{method:'DELETE'});await searches();$('notice-term').focus();status('Search alert removed.');})));list.append(card);}}
    $('notice-refresh').addEventListener('click',()=>run(()=>load()));
    $('notice-more').addEventListener('click',()=>run(()=>load(true)));
    $('notice-read-all').addEventListener('click',()=>run(async()=>{await api('/read-all',{method:'PATCH'});await load();status('All notifications marked as read.');}));
    $('notice-search-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const raw=$('notice-max').value;await api('/searches',options('POST',{term:$('notice-term').value,category:$('notice-category').value,max_price_cents:raw===''?null:Math.round(Number(raw)*100)}));e.target.reset();await searches();status('Search alert saved.');});});
    const prefill=new URLSearchParams(location.search);if(prefill.has('term'))$('notice-term').value=prefill.get('term').slice(0,120);
    if([...$('notice-category').options].some(o=>o.value===prefill.get('category')))$('notice-category').value=prefill.get('category');
    if(prefill.has('max'))$('notice-max').value=prefill.get('max');
    const start=()=>run(async()=>{await load();await searches();});start();
    window.addEventListener('pageshow',e=>{if(e.persisted){$('notice-content').hidden=true;start();}});
  }
  if($('notice-pref-form')){
    const form=$('notice-pref-form'), status=$('notice-pref-status');
    async function loadPrefs(){form.hidden=true;try{const data=await api('/preferences');for(const k of Object.keys(kinds))form.elements.namedItem(k).checked=data[k]===true;form.hidden=false;status.textContent='Preferences apply to new alerts on your account.';}catch(e){status.textContent=e.status===401?'Log in to change notification preferences.':e.message;}}
    form.addEventListener('submit',async e=>{e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;try{const data=Object.fromEntries(Object.keys(kinds).map(k=>[k,form.elements.namedItem(k).checked]));await api('/preferences',options('PUT',data));status.textContent='Notification preferences saved.';}catch(err){status.textContent=err.message;if(err.status===401)form.hidden=true;}finally{submit.disabled=false;}});
    loadPrefs();window.addEventListener('pageshow',e=>{if(e.persisted)loadPrefs();});
  }
})();
