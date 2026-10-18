/* Shared by the browser, static-page generator, and Node tests. No dependencies. */
globalThis.ArchiveCore = (() => {
  const positionNames = {GK:'Goalkeeper',DF:'Defender',MF:'Midfielder',FW:'Forward',Unknown:'Not recorded'};
  function age(birthDate, now=new Date()) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || ''))return null;
    const born=new Date(birthDate);
    if(!Number.isFinite(born.getTime()) || born.toISOString().slice(0,10)!==birthDate)return null;
    const years=now.getUTCFullYear()-born.getUTCFullYear()-(now.getUTCMonth()<born.getUTCMonth() || now.getUTCMonth()===born.getUTCMonth() && now.getUTCDate()<born.getUTCDate()?1:0);
    return years>=0 && years<120?years:null;
  }
  function transferAge(record) {
    if(record.datePrecision!=='day' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || ''))return null;
    const date=new Date(record.date);
    if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==record.date)return null;
    return age(record.birthDate,date);
  }
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const initials = name => name.split(/\s+/).filter(Boolean).filter(n=>!['van','de','den','da'].includes(n.toLowerCase())).map(n=>n[0]).filter(Boolean).slice(0,2).join('');
  function filter(records, state) {
    const words = fold(state.q).trim().split(/\s+/).filter(Boolean);
    return records.filter(r => (!state.position || r.position === state.position)
      && (!state.season || r.season === state.season)
      && (!state.direction || r.direction === state.direction)
      && (!state.type || r.type === state.type)
      && (!state.status || r.status === state.status)
      && (!state.group || r.group === state.group)
      && (!state.currency || r.currency === state.currency || r.feeAmount === 0)
      && words.every(w=>fold([r.name,r.club,r.nation,r.position,positionNames[r.position],r.notes,r.type,r.season].join(' ')).includes(w)));
  }
  function sort(records, key, order='asc') {
    return [...records].sort((a,b) => {
      const av=a[key], bv=b[key];
      const missing = v => v === null || v === undefined || v === '' || v === 'Unknown';
      if (missing(av) !== missing(bv)) return missing(av) ? 1 : -1;
      const cmp = key === 'position' ? ['GK','DF','MF','FW','Unknown'].indexOf(av)-['GK','DF','MF','FW','Unknown'].indexOf(bv) : typeof av === 'number' && typeof bv === 'number' ? av-bv : String(av ?? '').localeCompare(String(bv ?? ''),'en',{numeric:true,sensitivity:'base'});
      return (order === 'desc' ? -cmp : cmp) || a.name.localeCompare(b.name,'en',{sensitivity:'base'}) || (a.id || a.playerId).localeCompare(b.id || b.playerId);
    });
  }
  function person(r) {
    const href = r.playerUrl && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(r.playerUrl) ? r.playerUrl : '#';
    return `<a class="player-link" href="${escape(href)}" data-player="${escape(r.playerId)}"><span class="avatar" aria-hidden="true">${escape(initials(r.name))}</span><span>${escape(r.name)}</span></a>`;
  }
  const badge = p => `<span class="position position-${escape(p)}" title="${escape(positionNames[p])}">${escape(p === 'Unknown' ? '—' : p)}</span>`;
  function sourceLink(r, data) {
    const src = data.sources[r.sourceId];
    const href = /^https:\/\/en\.wikipedia\.org\//.test(src?.revisionUrl || '') ? src.revisionUrl : 'https://en.wikipedia.org/wiki/Liverpool_F.C.';
    return `<a class="source-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="Source for ${escape(r.name)}">↗</a>`;
  }
  function squadRow(r,data) {
    return `<tr><td class="shirt">${r.number ?? '—'}</td><td>${person(r)}</td><td>${badge(r.position)}<span class="position-name">${escape(positionNames[r.position])}</span></td><td class="age" title="${r.birthDate?'Born '+escape(r.birthDate):'Birth date unavailable'}">${age(r.birthDate) ?? '—'}</td><td>${escape(r.nation || '—')}</td><td><span class="status ${r.status==='Loaned out'?'away':''}">${escape(r.status)}</span></td><td>${sourceLink(r,data)}</td></tr>`;
  }
  function transferRow(r,data) {
    return `<tr><td class="date-cell">${escape(r.dateLabel)}<small>${escape(r.season)}</small></td><td>${person(r)}</td><td>${badge(r.position)}</td><td class="age" title="Age on the recorded transfer date">${transferAge(r) ?? '—'}</td><td><span class="direction ${r.direction.toLowerCase()}">${r.direction==='In'?'↙ In':'↗ Out'}</span><span class="club">${escape(r.club)}</span></td><td class="fee">${escape(r.fee)}</td><td><span class="type">${escape(r.type)}</span></td><td>${sourceLink(r,data)}</td></tr>`;
  }
  return {positionNames,age,transferAge,escape,fold,initials,filter,sort,squadRow,transferRow};
})();
