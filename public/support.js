(()=>{
  const $=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const ticketAdmin=!!$('support-admin'),accountAdmin=!!$('account-admin'),admin=ticketAdmin||accountAdmin,status=$('support-status'),list=$('support-tickets');
  async function api(path,body,method='POST'){
    const r=await fetch('/api/support'+path,{cache:'no-store',...(body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed.');return data;
  }
  let generation=0,lookup=0;
  const date=value=>new Date(value).toLocaleString('en-GB',{timeZone:'America/Chicago'})+' CT';
  function renderAccounts(data){
    const directory=$('account-directory'),actions=$('account-actions');directory.replaceChildren();actions.replaceChildren();
    if(!data.suspended.length)directory.append(make('p','No suspended accounts.'));
    for(const u of data.suspended){const card=make('article'),button=make('button',`View student #${u.id}`);button.type='button';button.addEventListener('click',()=>{$('account-id').value=u.id;$('account-lookup').requestSubmit();$('account-id').focus();});card.append(make('p',u.display_name+' · Suspended '+date(u.suspended_at)),button);directory.append(card);}
    if(!data.actions.length)actions.append(make('p','No moderation actions recorded.'));
    for(const a of data.actions){const card=make('article');card.append(make('h3',`#${a.id} · ${a.action==='suspend'?'Suspended':'Reinstated'}`),make('p',`Student #${a.user_id} · ${a.display_name} · ${date(a.created_at)}`),make('p','Reason: '+a.reason));actions.append(card);}
  }
  async function loadAccounts(){const current=++generation;status.textContent='Loading accounts…';$('support-admin-content').hidden=true;try{const data=await api('/moderation/accounts');if(current!==generation)return;renderAccounts(data);$('support-admin-content').hidden=false;status.textContent='Showing up to 100 suspended accounts and 100 recent actions.';}catch(e){if(current===generation){$('account-directory').replaceChildren();$('account-actions').replaceChildren();$('account-result').replaceChildren();lookup++;status.textContent=e.message;}}}
  async function load(){if(accountAdmin)return loadAccounts();const current=++generation;list.replaceChildren();status.textContent='Loading tickets…';try{
    const data=await api(admin?'/moderation/tickets?status='+$('support-filter').value:'/tickets');if(current!==generation)return;
    if(admin)$('support-admin-content').hidden=false;else $('support-form').hidden=false;
    for(const t of data.tickets){const card=make('article');card.append(make('h3',`#${t.id} · ${t.subject}`),make('p',`${t.status} · ${date(t.created_at)}`));
      if(admin)card.append(make('p',`Student #${t.user_id} · ${t.display_name}`));card.append(make('p',t.details));if(t.reply)card.append(make('p','Support response: '+t.reply));
      if(admin&&t.status==='open'){const form=make('form'),label=make('label','Resolution response'),field=make('textarea'),button=make('button','Resolve ticket');field.required=true;field.maxLength=2000;field.rows=3;label.append(field);button.type='submit';form.append(label,button);form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await api('/moderation/tickets/'+t.id,{reply:field.value},'PATCH');await load();}catch(err){status.textContent=err.message;button.disabled=false;}});card.append(form);}
      list.append(card);
    }status.textContent=data.tickets.length?'Showing up to 100 of the most recent tickets.':'There are no tickets to display.';
  }catch(e){if(current===generation){status.textContent=e.message;if(admin)$('support-admin-content').hidden=true;else $('support-form').hidden=true;}}}
  $('support-refresh')?.addEventListener('click',load);
  $('account-refresh')?.addEventListener('click',load);
  if(ticketAdmin)$('support-filter').addEventListener('change',load);
  if(accountAdmin){const result=$('account-result');
    $('account-lookup').addEventListener('submit',async e=>{e.preventDefault();const current=++lookup;result.replaceChildren();try{const u=await api('/moderation/accounts/'+encodeURIComponent($('account-id').value));if(current!==lookup)return;result.append(make('p',`#${u.id} · ${u.display_name} · ${u.suspended_at?'Suspended':'Not suspended'}`));if(u.moderator){result.append(make('p','Moderator accounts are protected.'));return;}
      const form=make('form'),label=make('label','Reason'),reason=make('textarea'),action=u.suspended_at?'reinstate':'suspend',button=make('button',action==='suspend'?'Suspend account':'Reinstate account');reason.required=true;reason.maxLength=500;label.append(reason);button.type='submit';form.append(label,button);form.addEventListener('submit',async ev=>{ev.preventDefault();if(!confirm(`${button.textContent} #${u.id}?`))return;button.disabled=true;try{await api('/moderation/accounts/'+u.id,{action,reason:reason.value},'PATCH');if(current===lookup){result.replaceChildren(make('p','Account updated. Find the account again to confirm the change.'));await load();}}catch(err){status.textContent=err.message;button.disabled=false;}});result.append(form);
    }catch(err){if(current===lookup)status.textContent=err.message;}});
  }else if(!admin){$('support-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;try{await api('/tickets',{subject:form.elements.subject.value,details:form.elements.details.value});form.reset();await load();}catch(err){status.textContent=err.message;}finally{button.disabled=false;}});}
  window.addEventListener('pagehide',()=>{generation++;lookup++;list?.replaceChildren();if(admin){$('support-admin-content').hidden=true;$('account-result')?.replaceChildren();$('account-directory')?.replaceChildren();$('account-actions')?.replaceChildren();}else $('support-form').hidden=true;});window.addEventListener('pageshow',e=>{if(e.persisted)load();});load();
})();
