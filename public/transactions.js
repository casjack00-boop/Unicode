(() => {
  const $ = id => document.getElementById(id);
  const listingId = new URLSearchParams(location.search).get('listing');
  const targetDeal = new URLSearchParams(location.search).get('deal');
  let jumpToDeal = Boolean(targetDeal);
  if (targetDeal) $('tx-filter').value = 'all';
  let deals = [], userId, busy = false;
  const money = n => '$' + (n / 100).toFixed(2);
  const labels = { pending:'Offer pending', reserved:'Reserved', declined:'Declined / another offer accepted', cancelled:'Cancelled', completed:'Completed' };
  function el(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function status(text, error = false, focus = false) { $('tx-status').textContent = text; $('tx-status').classList.toggle('tx-error', error); if (focus) $('tx-status').focus(); }
  async function api(path, method = 'GET', body) {
    const res = await fetch(path, { method, cache:'no-store', credentials:'same-origin', ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}) });
    const data = await res.json();
    if (!res.ok) { const e = new Error(data.error || 'Request failed.'); e.status = res.status; throw e; }
    return data;
  }
  const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const campusSpots=['University Center — public entrance','Muntz Library — public entrance'];
  const campusTime=value=>new Date(value).toLocaleString(undefined,{timeZone:'America/Chicago',timeZoneName:'short'});
  const availabilityFields=[];
  async function initAvailability(){
    try {
      const {availability}=await api('/api/transactions/availability');
      const root=$('tx-availability-days'); root.replaceChildren(); availabilityFields.length=0;
      for(let day=0;day<7;day++){
        const current=availability.find(slot=>slot.day===day);
        const group=el('fieldset',null,'tx-availability-day');
        group.append(el('legend',weekdays[day]));
        const enabled=el('input');enabled.type='checkbox';enabled.id='available-'+day;enabled.checked=Boolean(current);
        const label=el('label','Available');label.htmlFor=enabled.id;
        const check=el('div',null,'tx-day-check');check.append(enabled,label);group.append(check);
        const start=field(group,'From','available-start-'+day,'time',current?.start||'09:00');
        const end=field(group,'Until','available-end-'+day,'time',current?.end||'17:00');
        function sync(){start.disabled=end.disabled=!enabled.checked;}
        enabled.addEventListener('change',sync);sync();root.append(group);
        availabilityFields.push({day,enabled,start,end});
      }
      $('tx-availability').hidden=false;
      $('tx-availability-form').querySelector('button').disabled=false;
    } catch(e){$('tx-availability').hidden=false;$('tx-availability-status').textContent=e.message;}
  }
  $('tx-availability-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.currentTarget.querySelector('button');if(button.disabled||busy)return;
    const availability=availabilityFields.filter(f=>f.enabled.checked).map(f=>({day:f.day,start:f.start.value,end:f.end.value}));
    if(availability.some(s=>s.start>=s.end)){ $('tx-availability-status').textContent='End time must be later than start time.';return; }
    button.disabled=true;
    try {await api('/api/transactions/availability','PUT',{availability});$('tx-availability-status').textContent='Weekly availability saved.';await load();}
    catch(e){$('tx-availability-status').textContent=e.message;}
    finally{button.disabled=false;}
  });
  function priceOf(input) { return Math.round(Number(input.value) * 100); }
  function button(text, fn) { const b=el('button',text); b.type='button'; b.addEventListener('click',fn); return b; }
  function field(form, text, id, type, value) {
    const label=el('label',text), input=el('input'); label.htmlFor=id; input.id=id; input.type=type; input.required=true;
    if (value != null) input.value=value; form.append(label,input); return input;
  }
  function amount(form,id,value) { const input=field(form,'Counteroffer ($)',id,'number',(value/100).toFixed(2)); input.min='0'; input.max='10000'; input.step='0.01'; return input; }
  function submit(form,text,fn) { const b=el('button',text); b.type='submit'; form.append(b); form.addEventListener('submit',e=>{e.preventDefault();if(form.reportValidity())fn();}); }
  async function mutate(path, method, body) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('.tx-main button')]; controls.forEach(b=>b.disabled=true);
    try { await api(path,method,body); await load(); status('Transaction updated.',false,true); }
    catch(e) { status(e.message,true,true); if(e.status===401) $('tx-login').hidden=false; }
    finally { busy=false; controls.forEach(b=>b.disabled=false); }
  }
  function act(d,action,extra={}) { return mutate('/api/transactions/'+d.id,'PATCH',{action,revision:d.revision,...extra}); }
  function reputationForm(d, card) {
    const root = el('div',null,'tx-reputation');
    const msg=el('p'); msg.setAttribute('role','status');
    const path='/api/reputation/deals/'+d.id;
    const toggle=button(d.status==='completed'?'Reviews & dispute':'Report a transaction problem', async()=>{
      if(!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');return;}
      toggle.disabled=true;
      try {
        const data=await api(path);
        if(review){stars.value=data.stars?String(data.stars):'';comment.value=data.comment||'';}
        dispute.hidden=Boolean(data.dispute_id);
        msg.textContent=data.dispute_id?'Your dispute #'+data.dispute_id+' · '+data.dispute_status:'';
        panel.hidden=false;toggle.setAttribute('aria-expanded','true');
        (review?stars:dispute.hidden?toggle:details).focus();
      } catch(e){msg.textContent=e.message;}
      finally{toggle.disabled=false;}
    });
    const panel=el('div'); panel.hidden=true; panel.id='reputation-'+d.id;
    toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');
    let review,stars,comment;
    if(d.status==='completed'){
      review=el('form'); const who=d.buyer_id===userId?'seller':'buyer';
      const label=el('label','Rate '+who);label.htmlFor='review-stars-'+d.id;
      stars=el('select');stars.id=label.htmlFor;stars.required=true;
      const empty=el('option','Choose 1–5 stars');empty.value='';stars.append(empty);
      for(let n=1;n<=5;n++){const opt=el('option',n+' / 5');opt.value=String(n);stars.append(opt);}
      const cl=el('label','Review (optional)');cl.htmlFor='review-comment-'+d.id;
      comment=el('textarea');comment.id=cl.htmlFor;comment.maxLength=300;comment.rows=3;
      const send=el('button','Save '+who+' rating');send.type='submit';review.append(label,stars,cl,comment,send);
      review.addEventListener('submit',async e=>{e.preventDefault();if(!review.reportValidity()||send.disabled)return;send.disabled=true;try{await api(path+'/review','POST',{stars:Number(stars.value),comment:comment.value});msg.textContent='Review saved.';}catch(e){msg.textContent=e.message;}finally{send.disabled=false;}});
      panel.append(review);
    }
    const dispute=el('form'),dl=el('label','Describe the transaction problem');dl.htmlFor='dispute-'+d.id;
    const details=el('textarea');details.id=dl.htmlFor;details.required=true;details.maxLength=1000;details.rows=4;
    const submitDispute=el('button','Submit dispute');submitDispute.type='submit';
    dispute.append(dl,details,el('p','This requests operator review. UniMarket cannot refund or recover payments.'),submitDispute);
    dispute.addEventListener('submit',async e=>{e.preventDefault();if(!dispute.reportValidity()||submitDispute.disabled||!confirm('Submit this problem for moderator review?'))return;submitDispute.disabled=true;try{const data=await api(path+'/dispute','POST',{details:details.value});dispute.hidden=true;msg.textContent='Dispute #'+data.id+' submitted.';}catch(e){msg.textContent=e.message;}finally{submitDispute.disabled=false;}});
    panel.append(dispute);root.append(toggle,panel,msg);card.append(root);
  }
  function render() {
    const list=$('tx-list'); list.replaceChildren();
    const filter=$('tx-filter').value;
    const visible=deals.filter(d=>filter==='all'||(filter==='open'?['pending','reserved'].includes(d.status):d.status==='completed'));
    if(!visible.length) list.append(el('p','No transactions in this view.'));
    for(const d of visible) {
      const buyer=d.buyer_id===userId, ownProposal=d.proposed_by===userId;
      const card=el('article',null,'tx-card');
      card.id='deal-'+d.id; card.tabIndex=-1;
      card.append(el('h2',d.item_snapshot.title),el('p',(buyer?'Buying from ':'Selling to ')+d.other_name),el('p',(d.expired_at?'Reservation expired':labels[d.status])+' · '+money(d.price_cents),'tx-state'));
      const actions=el('div',null,'tx-actions');
      if(buyer && ['pending','reserved'].includes(d.status) && d.seller_availability?.length){
        const times=el('div',null,'tx-meetup');times.append(el('p','Seller’s weekly availability (Central Time; not a confirmed meetup)'));
        const list=el('ul');for(const slot of d.seller_availability)list.append(el('li',weekdays[slot.day]+': '+slot.start+'–'+slot.end));times.append(list);card.append(times);
      }
      if(d.status==='pending') {
        card.append(el('p',ownProposal?'Waiting for the other student to respond.':'The other student proposed this price.'));
        if(!ownProposal) {
          actions.append(button('Accept & reserve',()=>{if(confirm('Accept '+money(d.price_cents)+' and reserve this item?'))act(d,'accept');}),button('Decline',()=>act(d,'decline')));
          const form=el('form'); const input=amount(form,'counter-'+d.id,d.price_cents); submit(form,'Send counteroffer',()=>act(d,'counter',{price_cents:priceOf(input)})); card.append(form);
        }
        actions.append(button('Cancel offer',()=>{if(confirm('Cancel this offer?'))act(d,'cancel');}));
      } else if(d.status==='reserved') {
        if(d.buyer_confirmed||d.seller_confirmed) card.append(el('p','Automatic expiration paused because handover confirmation has started.'));
        else if(d.reservation_expires_at) card.append(el('p','Reservation expires: '+campusTime(d.reservation_expires_at)+(d.meetup_confirmed?'. Confirm the exchange after handover.':'. Confirm a meetup before this deadline.')));
        if(d.meetup_at) {
          const date=new Date(d.meetup_at);
          card.append(el('p',(d.meetup_confirmed?'Confirmed meetup: ':'Proposed meetup: ')+campusTime(date)+' · '+d.meetup_spot,'tx-meetup'));
          if(!d.meetup_confirmed && d.meetup_by!==userId && date.getTime()>Date.now()) actions.append(button('Confirm meetup',()=>act(d,'confirm_meetup')));
        }
        if(!d.buyer_confirmed&&!d.seller_confirmed) {
          const form=el('form');
          const suggestionLabel=el('label','Suggested public campus locations'); suggestionLabel.htmlFor='campus-spot-'+d.id;
          const suggestion=el('select');suggestion.id=suggestionLabel.htmlFor;
          const placeholder=el('option','Select a suggestion or enter another public place');placeholder.value='';suggestion.append(placeholder);
          for(const name of campusSpots){const option=el('option',name);option.value=name;suggestion.append(option);}
          form.append(suggestionLabel,suggestion);
          const spot=field(form,'Public meeting location','spot-'+d.id,'text',d.meetup_spot||d.item_snapshot.meeting_spot||''); spot.maxLength=120;
          suggestion.addEventListener('change',()=>{if(suggestion.value)spot.value=suggestion.value;});
          const when=field(form,'Meeting date & time (your local time)','when-'+d.id,'datetime-local');
          submit(form,d.meetup_at?'Propose new meetup':'Propose meetup',()=>{const date=new Date(when.value);if(!Number.isFinite(date.getTime()))return status('Enter a valid meeting time.',true);act(d,'meetup',{spot:spot.value,at:date.toISOString()});});
          card.append(form,el('p','Suggestions are not university-designated exchange zones. Confirm opening hours, choose a busy well-lit public place, and inspect the item before paying.'));
        }
        const mine=buyer?d.buyer_confirmed:d.seller_confirmed;
        card.append(el('p','Buyer: '+(d.buyer_confirmed?'confirmed receipt':'not yet confirmed')+' · Seller: '+(d.seller_confirmed?'confirmed handover':'not yet confirmed')));
        if(d.meetup_confirmed&&!mine) actions.append(button(buyer?'Confirm item received':'Confirm item handed over',()=>{if(confirm('Confirm only after the physical exchange has actually happened. Continue?'))act(d,'complete');}));
        actions.append(button('Cancel reservation',()=>{if(confirm('Cancel this reservation and make the item available again? This does not refund any payment.'))act(d,'cancel');}));
      } else if(d.expired_at) {
        card.append(el('p','The reservation expired on '+campusTime(d.expired_at)+'. No payment was handled by UniMarket.'));
      } else if(d.status==='completed') {
        card.append(el('p','Both students confirmed the exchange on '+new Date(d.completed_at).toLocaleDateString()+'.'));
        if(buyer) { const link=el('a','Relist this purchase'); link.href='/post.html?purchase='+encodeURIComponent(d.id); card.append(link); }
      }
      if(['reserved','completed','cancelled'].includes(d.status)) reputationForm(d,card);
      if(actions.childElementCount) card.append(actions);
      if(d.listing_status==='active'||d.listing_status==='reserved') { const link=el('a','View original listing');link.href='/item.html?id='+encodeURIComponent(d.listing_id);card.append(link); }
      list.append(card);
    }
  }
  async function load() {
    const data=await api('/api/transactions'); deals=data.deals; userId=data.user_id;
    $('tx-controls').hidden=false; render();
    if(jumpToDeal){jumpToDeal=false;const target=$('deal-'+targetDeal);if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'start'});}}
    if(listingId && !deals.some(d=>String(d.listing_id)===listingId&&['pending','reserved'].includes(d.status))) {
      try { const {listing}=await api('/api/listings/'+encodeURIComponent(listingId));
        if(listing.status==='active'&&listing.seller_id!==userId) { $('tx-new').hidden=false; $('tx-item').textContent=listing.title+' · Asking '+money(listing.price_cents); if(!$('tx-price').value)$('tx-price').value=(listing.price_cents/100).toFixed(2); }
        else $('tx-new').hidden=true;
      } catch { $('tx-new').hidden=true; }
    } else $('tx-new').hidden=true;
  }
  $('tx-filter').addEventListener('change',render);
  $('tx-refresh').addEventListener('click',async()=>{if(busy)return;try{await load();status('Transactions refreshed.');}catch(e){status(e.message,true);}});
  $('tx-offer').addEventListener('submit',e=>{e.preventDefault();if(e.target.reportValidity())mutate('/api/transactions','POST',{listing_id:Number(listingId),price_cents:priceOf($('tx-price'))});});
  load().then(()=>{status('');void initAvailability();}).catch(e=>{status(e.message,true);$('tx-login').hidden=e.status!==401;});
})();
