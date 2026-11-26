(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const node=document.createElement(tag); if(text!=null)node.textContent=text; if(cls)node.className=cls; return node; };
  const price = cents => cents === 0 ? 'Free' : '$'+(cents/100).toFixed(2);
  async function api(path,method='GET',body) {
    const opts={method,cache:'no-store',credentials:'same-origin'};
    if(body!==undefined){opts.headers={'Content-Type':'application/json'};opts.body=JSON.stringify(body);}
    const response=await fetch('/api/academic'+path,opts);
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'Unable to complete the request.'),{status:response.status});
    return data;
  }
  function renderListings(container,listings,empty) {
    container.replaceChildren();
    if(!listings.length){container.append(el('p',empty));return;}
    for(const item of listings){
      const card=el('article',null,'discovery-card');
      const link=el('a',item.title);link.href='/item.html?id='+encodeURIComponent(item.id);
      if(item.photo_url){const img=el('img');img.src=item.photo_url;img.alt='';img.loading='lazy';img.onerror=()=>img.remove();card.append(img);}
      card.append(link,el('strong',price(item.price_cents)),el('p',[item.condition?.replaceAll('_',' '),item.department,item.course_number].filter(Boolean).join(' · ')));
      if(item.saves!=null)card.append(el('p',`${item.saves} recent ${item.saves===1?'save':'saves'}`));
      container.append(card);
    }
  }
  function button(text,action){const b=el('button',text,'discovery-button');b.type='button';b.addEventListener('click',action);return b;}
  async function loadRequests(){
    const data=await api('/requests');const container=$('request-list');container.replaceChildren();
    if(!data.requests.length)container.append(el('p','No textbook requests yet.'));
    for(const request of data.requests){
      const card=el('article',null,'academic-panel');
      card.append(el('h3',request.title),el('p',`${request.own?'Your request':request.display_name} · ${request.status==='active'?'Wanted':'Closed'}`));
      if(!request.own){const profile=el('a','View requester profile','discovery-link');profile.href='/profile.html?id='+encodeURIComponent(request.requester_id);card.append(profile);}
      if(request.isbn)card.append(el('p','ISBN: '+request.isbn));
      const course=[request.department,request.course].filter(Boolean).join(' ');if(course)card.append(el('p','Course: '+course));
      if(request.max_price_cents!=null)card.append(el('p','Budget: '+price(request.max_price_cents)));
      if(request.notes)card.append(el('p',request.notes));
      if(request.status==='active'){
        const controls=el('div',null,'discovery-links'),status=el('p'),matches=el('div',null,'discovery-list');status.setAttribute('role','status');
        controls.append(button('Find matching listings',async e=>{const b=e.currentTarget;b.disabled=true;status.textContent='Searching…';
          try{const data=await api('/requests/'+request.id+'/matches');renderListings(matches,data.listings,'No current matches.');status.textContent='';}
          catch(error){status.textContent=error.message;}finally{b.disabled=false;}}));
        if(request.own)controls.append(button('Close request',async e=>{if(!window.confirm('Close this textbook request?'))return;const b=e.currentTarget;b.disabled=true;
          try{await api('/requests/'+request.id+'/close','PATCH');await loadRequests();$('request-status').textContent='Request closed.';}
          catch(error){status.textContent=error.message;b.disabled=false;}}));
        else {const sell=el('a','List a textbook','discovery-link');sell.href='/post.html';controls.append(sell);}
        card.append(controls,status,matches);
      }
      container.append(card);
    }
  }
  async function initPage(){
    const status=$('academic-status');
    try{await api('/preferences');$('academic-content').hidden=false;status.textContent='';}
    catch(error){status.textContent=error.status===401?'Sign in to access student discovery.':error.message;if(error.status===401){const link=el('a','Sign in','discovery-link');link.href='/login.html';status.append(' ',link);}return;}
    const form=$('request-form');form.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(form);const submit=form.querySelector('button');submit.disabled=true;
      try{await api('/requests','POST',{title:f.get('title'),isbn:f.get('isbn'),department:f.get('department'),course:f.get('course'),notes:f.get('notes'),max_price_cents:f.get('budget')===''?null:Math.round(Number(f.get('budget'))*100)});
        form.reset();$('request-status').textContent='Request posted.';await loadRequests();}
      catch(error){$('request-status').textContent=error.message;}finally{submit.disabled=false;}});
    await Promise.all([
      loadRequests().catch(e=>{$('request-list').textContent=e.message;}),
      api('/recommendations').then(d=>renderListings($('academic-recommendations'),d.listings,'No matching textbooks. Choose a department in Settings or check back later.')).catch(e=>{$('academic-recommendations').textContent=e.message;}),
      api('/trending').then(d=>renderListings($('academic-trending'),d.listings,'No recent saves yet.')).catch(e=>{$('academic-trending').textContent=e.message;})
    ]);
  }
  async function initSettings(){
    const form=$('academic-form'),status=$('academic-pref-status');
    try{const prefs=await api('/preferences');form.elements.major.value=prefs.major||'';form.elements.department.value=prefs.department||'';$('academic-preferences').hidden=false;}
    catch(error){if(error.status!==401){$('academic-preferences').hidden=false;form.hidden=true;status.textContent=error.message;}return;}
    form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;
      try{await api('/preferences','PUT',{major:form.elements.major.value,department:form.elements.department.value});status.textContent='Academic preferences saved.';}
      catch(error){status.textContent=error.message;}finally{b.disabled=false;}});
  }
  if($('academic-page'))initPage();if($('academic-preferences'))initSettings();
})();
