import {load} from 'cheerio';

export function parseBirthDate(html) {
  const value=load(html)('.infobox .bday').first().text().trim();
  const date=new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value ? value : null;
}

export async function enrichAges(data, previous, page, source, {full=false}={}) {
  const records=[...data.squad,...(data.transfers || [])];
  const known=new Map([...(previous?.transfers || []),...(previous?.squad || []),...records].filter(p=>p.birthDate).map(p=>[p.playerId,p]));
  const players=[...new Map(records.map(p=>[p.playerId,p])).values()];
  data.birthChecks ||= {};
  const pending=players.filter(p=>{
    const checked=data.birthChecks[p.playerId] || data.sources[`birth:${p.playerId}`]?.checkedAt;
    return p.playerUrl && (!checked || Date.now()-Date.parse(checked)>=30*86400000);
  }).sort((a,b)=>(data.birthChecks[a.playerId] || '').localeCompare(data.birthChecks[b.playerId] || ''));
  // Bound routine refresh work; full imports can backfill all historical identities.
  const queue=full?pending:pending.slice(0,40);
  let next=0;
  async function worker() {
    while(next<queue.length) {
      const player=queue[next++],sourceId=`birth:${player.playerId}`;
      try {
        const title=decodeURIComponent(new URL(player.playerUrl).pathname.slice(6));
        const result=await page(title);
        const birthDate=parseBirthDate(result.text);
        data.birthChecks[player.playerId]=new Date().toISOString();
        if(birthDate){known.set(player.playerId,{birthDate,birthSourceId:sourceId});data.sources[sourceId]=source(result);}
      } catch(error) {console.warn(`Age unavailable for ${player.name}: ${error.message}`);}
    }
  }
  await Promise.all(Array.from({length:3},worker));
  for(const record of records) {
    const found=known.get(record.playerId);
    if(found){record.birthDate=found.birthDate;record.birthSourceId=found.birthSourceId;}
  }
}
