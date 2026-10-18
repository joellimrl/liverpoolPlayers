(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('archive-data').textContent);
  const C = globalThis.ArchiveCore, e=C.escape;
  const form = document.getElementById('filters');
  const keys = ['q','position','layout','status','season','direction','type','group','currency'];
  const defaults = {tab:'squad',q:'',position:'',layout:'list',status:'',season:'',direction:'',type:'',group:'',currency:'',sort:'number',order:'asc',page:1};
  const sorts = {squad:['number','name','position','age','nation','status'],transfers:['date','name','position','age','club','feeAmount','type']};
  const PAGE_SIZE = 25;
  let state = {...defaults};
  let visible = [], timer;
  const dialog = document.getElementById('player-dialog');
  function readLocation() {
    if (!location.hash.startsWith('#view=')) return {...defaults};
    const params = new URLSearchParams(location.hash.slice(1));
    const next = {...defaults,tab:params.get('view')==='transfers'?'transfers':'squad'};
    for (const key of keys) {
      const input = form.elements.namedItem(key), val = params.get(key) ?? defaults[key];
      if (input.tagName === 'SELECT') next[key] = [...input.options].some(o=>o.value===val) ? val : defaults[key];
      else next[key] = val.slice(0,200);
    }
    next.sort = sorts[next.tab].includes(params.get('sort')) ? params.get('sort') : next.tab==='squad'?'number':'date';
    next.order = ['asc','desc'].includes(params.get('order')) ? params.get('order') : next.tab==='squad'?'asc':'desc';
    next.page = Math.max(1,Math.min(10000,Number.parseInt(params.get('page'),10) || 1));
    return next;
  }
  function writeLocation() {
    const params = new URLSearchParams({view:state.tab});
    for (const key of keys) if (state[key]) params.set(key,state[key]);
    params.set('sort',state.sort);params.set('order',state.order);
    if (state.page>1) params.set('page',state.page);
    // Hash state works on file:// as well as GitHub project Pages, without route rewrites.
    try { history.replaceState(null,'',`#${params}`); } catch { /* Read-only local browser context: filtering still works. */ }
  }
  function render(save=true) {
    const isSquad = state.tab==='squad';
    if (state.sort==='feeAmount' && !state.currency) {state.sort='date';state.order='desc';}
    for (const key of keys) form.elements.namedItem(key).value = state[key];
    document.querySelectorAll('[data-tab]').forEach(button=>{
      const active=button.dataset.tab===state.tab;
      button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
    });
    document.getElementById('squad-panel').hidden=!isSquad;
    document.getElementById('transfers-panel').hidden=isSquad;
    document.querySelectorAll('[data-transfer-filter]').forEach(el=>{el.hidden=isSquad;el.querySelector('select').disabled=isSquad;});
    document.querySelectorAll('[data-squad-filter]').forEach(el=>{el.hidden=!isSquad;el.querySelector('select').disabled=!isSquad;});
    const filters = {...state};
    if (isSquad) for (const key of ['season','direction','type','group','currency']) filters[key]='';
    else filters.status='';
    visible = C.sort(C.filter(isSquad?data.squad.map(p=>({...p,age:C.age(p.birthDate)})):data.transfers.map(t=>({...t,age:C.transferAge(t)})),filters),state.sort,state.order);
    const grouped=state.layout==='roles';
    const roles=[['GK','Goalkeepers'],['DF','Defenders'],['MF','Midfielders'],['FW','Forwards'],['Unknown','Not recorded']];
    const groups=roles.map(([role,label])=>({label,records:visible.filter(r=>(r.position||'Unknown')===role)})).filter(g=>g.records.length);
    if(grouped)visible=groups.flatMap(g=>g.records);
    const pages=grouped?1:Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
    state.page=Math.min(state.page,pages);
    const start=(state.page-1)*PAGE_SIZE;
    const tbody=document.getElementById(isSquad?'squad-body':'transfers-body');
    const rows=records=>records.map(r=>isSquad?C.squadRow(r,data):C.transferRow(r,data)).join('');
    tbody.innerHTML=grouped?groups.map(g=>`<tr class="role-heading"><th colspan="${isSquad?7:8}">${e(g.label)} <span>${g.records.length}</span></th></tr>${rows(g.records)}`).join(''):rows(visible.slice(start,start+PAGE_SIZE));
    document.getElementById('empty').hidden=visible.length>0;
    document.querySelector(`#${state.tab}-panel .table-scroll`).hidden=visible.length===0;
    document.getElementById('result-count').textContent=`${visible.length.toLocaleString('en')} ${isSquad?'players':'moves'}`;
    document.querySelector('.pagination').hidden=grouped || pages===1;
    document.getElementById('page-info').textContent=visible.length?`Showing ${start+1}–${Math.min(start+PAGE_SIZE,visible.length)} of ${visible.length.toLocaleString('en')}`:'No records to display';
    document.getElementById('previous').disabled=state.page<=1;
    document.getElementById('next').disabled=state.page>=pages;
    document.querySelectorAll('[data-sort]').forEach(button=>{
      const selected=button.dataset.sort===state.sort && button.closest('[role=tabpanel]').id===`${state.tab}-panel`;
      button.closest('th').setAttribute('aria-sort',selected?(state.order==='asc'?'ascending':'descending'):'none');
      button.querySelector('span').textContent=selected?(state.order==='asc'?'↑':'↓'):'↕';
      if (button.dataset.sort==='feeAmount') button.disabled=!state.currency;
    });
    if(save)writeLocation();
  }
  function switchTab(tab) {
    state={...defaults,tab,q:state.q,position:state.position,layout:state.layout,sort:tab==='squad'?'number':'date',order:tab==='squad'?'asc':'desc'};
    render();
  }
  function reset() {const tab=state.tab;state={...defaults,tab,layout:state.layout,sort:tab==='squad'?'number':'date',order:tab==='squad'?'asc':'desc'};render();}
  document.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>switchTab(button.dataset.tab));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const tab=event.key==='Home'?'squad':event.key==='End'?'transfers':state.tab==='squad'?'transfers':'squad';
      switchTab(tab);document.getElementById(`tab-${tab}`).focus();
    });
  });
  function applyFilters(){for(const key of keys)state[key]=form.elements.namedItem(key).value;state.page=1;render();}
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('input',event=>{if(event.target.name==='q'){clearTimeout(timer);timer=setTimeout(applyFilters,120);}});
  form.addEventListener('change',()=>{clearTimeout(timer);applyFilters();});
  document.getElementById('reset').addEventListener('click',reset);
  document.getElementById('empty-reset').addEventListener('click',reset);
  document.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.sort;
    state.order=state.sort===key && state.order==='asc'?'desc':'asc';state.sort=key;state.page=1;render();
  }));
  for(const [id,offset] of [['previous',-1],['next',1]])document.getElementById(id).addEventListener('click',()=>{state.page+=offset;render();document.getElementById(`${state.tab}-panel`).scrollIntoView({block:'start'});});
  document.getElementById('download').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({license:data.license,sources:data.sources,lastChecked:data.lastChecked,view:state.tab,records:visible},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`liverpool-${state.tab}-${data.generatedOn}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-player]');
    if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    const id=link.dataset.player,player=data.squad.find(p=>p.playerId===id)||data.transfers.find(p=>p.playerId===id);
    if(!player || typeof dialog.showModal!=='function')return;
    event.preventDefault();
    const moves=C.sort(data.transfers.filter(t=>t.playerId===id),'date','desc');
    document.getElementById('player-content').innerHTML=`<h2 id="player-title">${e(player.name)}</h2><p>${e(C.positionNames[player.position])}${player.status && player.birthDate && C.age(player.birthDate)!==null?' · Age '+C.age(player.birthDate):''}${player.nation?' · '+e(player.nation):''}${player.status?' · '+e(player.status):''}</p>${player.notes?'<p>'+e(player.notes)+'</p>':''}<p>${moves.length} recorded Liverpool moves</p>${moves.length?'<ul class="timeline">'+moves.map(t=>`<li><time>${e(t.dateLabel)}</time><div><strong>${t.direction==='In'?'From':'To'} ${e(t.club)}</strong><small>${e(t.type)} · ${e(t.fee)} · ${e(t.season)}${C.transferAge(t)!==null?' · Age '+C.transferAge(t):''}</small><a href="${e(data.sources[t.sourceId].revisionUrl)}" target="_blank" rel="noopener noreferrer">View source ↗</a></div></li>`).join('')+'</ul>':'<p>No transfer entries for this player in the imported records.</p>'}${player.playerUrl?'<p><a href="'+e(player.playerUrl)+'" target="_blank" rel="noopener noreferrer">Player on Wikipedia ↗</a></p>':''}`;
    dialog.showModal();
  });
  document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#view=')){state=readLocation();render(false);}});
  const ageDays=Math.floor((Date.now()-new Date(data.lastChecked).getTime())/86400000);
  if(ageDays>3){const el=document.getElementById('freshness-note');el.textContent=`Last checked ${ageDays} days ago`;el.classList.add('stale');}
  document.documentElement.classList.add('js');
  state=readLocation();render(false);
})();
