(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const valid=value=>/^\d+$/.test(value || '') && Number(value)>0 && Number(value)<=2147483647;
  async function api(path,method='GET',body) {
    const response=await fetch('/api/safety'+path,{method,cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const data=await response.json();
    if(!response.ok){const e=new Error(data.error || 'Unable to complete request.');e.status=response.status;throw e;}
    return data;
  }
  async function initReport(){
    const targets=['user','listing','message'].filter(type=>valid(params.get(type)));
    if(targets.length!==1){if(targets.length>1)el('safety-status').textContent='Choose one report target.';return;}
    const type=targets[0],id=params.get(type);
    const back=el('safety-back');
    if(type==='user'){back.href='/profile.html?id='+encodeURIComponent(id);back.textContent='Back to profile';}
    if(type==='listing'){back.href='/item.html?id='+encodeURIComponent(id);back.textContent='Back to item';}
    if(type==='message'){back.href='/messages.html'+(valid(params.get('conversation'))?'?id='+encodeURIComponent(params.get('conversation')):'');back.textContent='Back to messages';}
    let blocks;
    try {blocks=(await api('/blocks')).blocks;} catch(e){el('safety-status').textContent=e.message;el('safety-login').hidden=e.status!==401;return;}
    el('report-panel').hidden=false;
    el('report-heading').textContent='Report '+(type==='user'?'student':type);
    el('message-evidence').hidden=type!=='message';
    const form=el('report-form'), submit=form.querySelector('button');
    form.addEventListener('submit',async e=>{
      e.preventDefault();submit.disabled=true;
      try {const data=await api('/reports','POST',{type,id,reason:el('report-reason').value,details:el('report-details').value});form.hidden=true;el('report-status').textContent='Report submitted. Reference #'+data.id+'.';}
      catch(e){el('report-status').textContent=e.message;submit.disabled=false;}
    });
    if(type==='user'){
      el('block-panel').hidden=false;
      const button=el('block-student');
      if(blocks.some(b=>String(b.id)===id)){button.disabled=true;el('block-status').textContent='This student is already blocked. Manage blocks in Settings.';}
      button.addEventListener('click',async()=>{
        if(!confirm('Block contact with this student?'))return;
        button.disabled=true;
        try{await api('/blocks','POST',{id});el('block-status').textContent='Student blocked. You can unblock them in Settings.';}
        catch(e){el('block-status').textContent=e.message;button.disabled=false;}
      });
    }
  }
  async function loadBlocks(){
    const section=el('blocked-accounts'),list=el('blocked-list'),status=el('blocked-status');
    section.hidden=true;list.replaceChildren();
    try{
      const {blocks}=await api('/blocks');section.hidden=false;status.textContent=blocks.length?'':'No blocked accounts.';
      for(const block of blocks){
        const row=document.createElement('div');row.className='safety-block-row';
        const name=document.createElement('span');name.textContent=block.display_name;
        const button=document.createElement('button');button.type='button';button.textContent='Unblock';button.setAttribute('aria-label','Unblock '+block.display_name);
        button.addEventListener('click',async()=>{button.disabled=true;try{await api('/blocks/'+encodeURIComponent(block.id),'DELETE');await loadBlocks();}catch(e){status.textContent=e.message;button.disabled=false;}});
        row.append(name,button);list.append(row);
      }
    }catch(e){if(e.status!==401){section.hidden=false;status.textContent=e.message;}}
  }
  if(el('report-panel'))initReport();
  if(el('blocked-accounts')){loadBlocks();window.addEventListener('pageshow',e=>{if(e.persisted)loadBlocks();});}
})();
