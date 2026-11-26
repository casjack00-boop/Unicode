(() => {
  const $ = id => document.getElementById(id);
  const listingId = new URLSearchParams(location.search).get('listing');
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
  function render() {
    const list=$('tx-list'); list.replaceChildren();
    const filter=$('tx-filter').value;
    const visible=deals.filter(d=>filter==='all'||(filter==='open'?['pending','reserved'].includes(d.status):d.status==='completed'));
    if(!visible.length) list.append(el('p','No transactions in this view.'));
    for(const d of visible) {
      const buyer=d.buyer_id===userId, ownProposal=d.proposed_by===userId;
      const card=el('article',null,'tx-card');
      card.append(el('h2',d.item_snapshot.title),el('p',(buyer?'Buying from ':'Selling to ')+d.other_name),el('p',labels[d.status]+' · '+money(d.price_cents),'tx-state'));
      const actions=el('div',null,'tx-actions');
      if(d.status==='pending') {
        card.append(el('p',ownProposal?'Waiting for the other student to respond.':'The other student proposed this price.'));
        if(!ownProposal) {
          actions.append(button('Accept & reserve',()=>{if(confirm('Accept '+money(d.price_cents)+' and reserve this item?'))act(d,'accept');}),button('Decline',()=>act(d,'decline')));
          const form=el('form'); const input=amount(form,'counter-'+d.id,d.price_cents); submit(form,'Send counteroffer',()=>act(d,'counter',{price_cents:priceOf(input)})); card.append(form);
        }
        actions.append(button('Cancel offer',()=>{if(confirm('Cancel this offer?'))act(d,'cancel');}));
      } else if(d.status==='reserved') {
        if(d.meetup_at) {
          const date=new Date(d.meetup_at);
          card.append(el('p',(d.meetup_confirmed?'Confirmed meetup: ':'Proposed meetup: ')+date.toLocaleString()+' · '+d.meetup_spot,'tx-meetup'));
          if(!d.meetup_confirmed && d.meetup_by!==userId && date.getTime()>Date.now()) actions.append(button('Confirm meetup',()=>act(d,'confirm_meetup')));
        }
        if(!d.buyer_confirmed&&!d.seller_confirmed) {
          const form=el('form');
          const spot=field(form,'Public meeting location','spot-'+d.id,'text',d.meetup_spot||d.item_snapshot.meeting_spot||''); spot.maxLength=120;
          const when=field(form,'Meeting date & time (your local time)','when-'+d.id,'datetime-local');
          submit(form,d.meetup_at?'Propose new meetup':'Propose meetup',()=>{const date=new Date(when.value);if(!Number.isFinite(date.getTime()))return status('Enter a valid meeting time.',true);act(d,'meetup',{spot:spot.value,at:date.toISOString()});});
          card.append(form,el('p','Choose a busy, well-lit public place. Inspect the item before paying.'));
        }
        const mine=buyer?d.buyer_confirmed:d.seller_confirmed;
        card.append(el('p','Buyer: '+(d.buyer_confirmed?'confirmed receipt':'not yet confirmed')+' · Seller: '+(d.seller_confirmed?'confirmed handover':'not yet confirmed')));
        if(d.meetup_confirmed&&!mine) actions.append(button(buyer?'Confirm item received':'Confirm item handed over',()=>{if(confirm('Confirm only after the physical exchange has actually happened. Continue?'))act(d,'complete');}));
        actions.append(button('Cancel reservation',()=>{if(confirm('Cancel this reservation and make the item available again? This does not refund any payment.'))act(d,'cancel');}));
      } else if(d.status==='completed') {
        card.append(el('p','Both students confirmed the exchange on '+new Date(d.completed_at).toLocaleDateString()+'.'));
        if(buyer) { const link=el('a','Relist this purchase'); link.href='/post.html?purchase='+encodeURIComponent(d.id); card.append(link); }
      }
      if(actions.childElementCount) card.append(actions);
      if(d.listing_status==='active'||d.listing_status==='reserved') { const link=el('a','View original listing');link.href='/item.html?id='+encodeURIComponent(d.listing_id);card.append(link); }
      list.append(card);
    }
  }
  async function load() {
    const data=await api('/api/transactions'); deals=data.deals; userId=data.user_id;
    $('tx-controls').hidden=false; render();
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
  load().then(()=>status('')).catch(e=>{status(e.message,true);$('tx-login').hidden=e.status!==401;});
})();
