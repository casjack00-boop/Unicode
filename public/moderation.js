(()=>{
  const $=id=>document.getElementById(id);
  const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  async function api(path,options={}){const r=await fetch('/api/reputation'+path,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed.');return data;}
  function render(list,rows,type){
    list.replaceChildren();if(!rows.length)list.append(make('p','No cases in this view.'));
    for(const r of rows){const card=make('article');card.className='tx-card';card.style.marginBlock='10px';card.append(make('h3',(type==='report'?'Report ':'Dispute ')+'#'+r.id),make('p','Filed '+new Date(r.created_at).toLocaleString()));
      if(type==='report')card.append(make('p','Target: '+r.target_type+' · Reason: '+r.reason),make('p','Reporter #'+r.reporter_id+' · Reported user #'+r.reported_user_id),make('p','Listing: '+(r.listing_id??'—')+' · Message: '+(r.message_id??'—')),make('p','Evidence: '+r.evidence));
      else card.append(make('p','Transaction #'+r.deal_id+' · '+r.title+' · '+r.deal_status),make('p','Reporter #'+r.reporter_id+' · Buyer #'+r.buyer_id+' · Seller #'+r.seller_id));
      card.append(make('p','Details: '+r.details));
      if(r.status==='open'){const controls=make('div');controls.className='tx-actions';for(const state of ['reviewed','dismissed']){const b=make('button',state==='reviewed'?'Mark reviewed':'Dismiss');b.type='button';b.addEventListener('click',async()=>{if(!confirm('Mark this case '+state+'?'))return;[...controls.children].forEach(x=>x.disabled=true);try{await api('/moderation/'+type+'/'+r.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:state})});await load();}catch(e){$('mod-status').textContent=e.message;[...controls.children].forEach(x=>x.disabled=false);}});controls.append(b);}card.append(controls);}
      list.append(card);
    }
  }
  const type=document.body.dataset.caseType;
  const list=$(type==='report'?'mod-reports':'mod-disputes');
  let sequence=0;
  async function load(){const current=++sequence;$('mod-content').hidden=true;$('mod-status').textContent='Loading cases…';try{const data=await api('/moderation?status='+encodeURIComponent($('mod-filter').value));if(current!==sequence)return;render(list,type==='report'?data.reports:data.disputes,type);$('mod-content').hidden=false;$('mod-status').textContent='Showing up to 100 recent cases in this view.';}catch(e){if(current===sequence){list.replaceChildren();$('mod-status').textContent=e.message;}}}
  $('mod-filter').addEventListener('change',load);$('mod-refresh').addEventListener('click',load);window.addEventListener('pagehide',()=>{sequence++;$('mod-content').hidden=true;list.replaceChildren();});window.addEventListener('pageshow',e=>{if(e.persisted)load();});load();
})();
