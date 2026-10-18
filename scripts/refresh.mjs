import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSquad, parseTransfers, validateArchive, wikiUrl } from './parser.mjs';
import { enrichAges } from './ages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = path.join(root, 'data/archive.json');
const full = process.argv.includes('--full');
const offline = process.argv.includes('--offline');
const today = new Date();
const seasonYear = today.getUTCFullYear() - (today.getUTCMonth() < 6 ? 1 : 0);
const stamp = today.toISOString();
const seasonOf = title => `${title.slice(0,4)}–${title.match(/^\d{4}–(\d{2,4})/)[1].slice(-2)}`;
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
let previous;
try { previous = JSON.parse(await readFile(file,'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir(path.join(root,'.cache'), {recursive:true});
const agent = `TheRedArchive/1.0 (https://github.com/${process.env.GITHUB_REPOSITORY || 'the-red-archive'}; static Wikipedia data mirror)`;
async function page(title, prop='text|revid') {
  const cachePath = path.join(root,'.cache',createHash('sha256').update(title+prop).digest('hex')+'.json');
  if (offline) return JSON.parse(await readFile(cachePath,'utf8'));
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({action:'parse',page:title,prop,format:'json',formatversion:'2',redirects:'1',maxlag:'5'});
  let last;
  for (let attempt=0;attempt<3;attempt++) {
    try {
      const r = await fetch(url,{headers:{'User-Agent':agent,'Accept':'application/json'},signal:AbortSignal.timeout(25000)});
      if (r.status === 429 || r.status >= 500) {
        const retry = Number(r.headers.get('retry-after'));
        if (Number.isFinite(retry) && retry > 30) throw new Error(`Source requested a ${retry}s pause; try later`);
        await sleep(Math.max(1000 * 2**attempt, (retry || 0)*1000));
        last = new Error(`HTTP ${r.status}`); continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (json.error?.code === 'maxlag') { await sleep(2000*2**attempt); last = new Error('Wikimedia replication lag'); continue; }
      if (!json.parse) throw new Error(json.error?.info || 'Missing parse response');
      await writeFile(cachePath,JSON.stringify(json.parse));
      await sleep(180);
      return json.parse;
    } catch(e) { last=e; if (/requested a|HTTP 4|does not exist/.test(e.message)) break; if (attempt<2) await sleep(1000*2**attempt); }
  }
  throw new Error(`${title}: ${last.message}`);
}
function source(p) {
  const prior = offline && Object.values(previous?.sources || {}).find(s=>s.title===p.title);
  return {title:p.title,url:wikiUrl(p.title),revision:p.revid,revisionUrl:`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(p.title)}&oldid=${p.revid}`,license:'CC-BY-SA-4.0',checkedAt:prior?.checkedAt || stamp};
}

// Work entirely in memory until all critical checks pass; a failed pull never empties the live snapshot.
const data = structuredClone(previous || {schemaVersion:1,squad:[],transfers:[],sources:{},seasonStatus:{}});
if(process.argv.includes('--ages-only')) {
  await enrichAges(data,previous,page,source,{full});
  validateArchive(data,previous);
  await writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n');
  await rename(file+'.tmp',file);
  console.log(`Birth dates: ${data.squad.filter(p=>p.birthDate).length}/${data.squad.length}`);
  process.exit(0);
}
const squadPage = await page('Liverpool F.C.');
const {squad, sourceAsOf} = parseSquad(squadPage.text,'squad');
data.squad = squad;
data.squadAsOf = sourceAsOf;
data.sources.squad = source(squadPage);
const seasonsPage = await page('List of Liverpool F.C. seasons','links|revid');
const discovered = (seasonsPage.links || []).map(l=>l.title || l['*']).filter(Boolean).filter(t=>/^\d{4}–\d{2,4} Liverpool F\.C\. season$/.test(t));
// Include the current season even if the season index has not yet linked it.
discovered.push(`${seasonYear}–${String(seasonYear+1).slice(-2)} Liverpool F.C. season`);
const titles = [...new Set(discovered)].filter(t=>Number(t.slice(0,4)) <= seasonYear).sort().reverse();
const old = titles.filter(t=>Number(t.slice(0,4)) < seasonYear-1);
const rotation = old.length ? Math.floor(today.getTime()/86400000)*3 % old.length : 0;
const rotating = new Set(Array.from({length:Math.min(3,old.length)},(_,i)=>old[(rotation+i)%old.length]));
const selected = titles.filter(t=>full || !data.seasonStatus[seasonOf(t)] || Number(t.slice(0,4)) >= seasonYear-1 || rotating.has(t));
const failures = [];
for (const [index,title] of selected.entries()) {
  const season = seasonOf(title), sourceId=`season:${season}`;
  try {
    const p = await page(title);
    const parsed = parseTransfers(p.text,season,sourceId);
    if (parsed.warnings.length) throw new Error(parsed.warnings.join('; '));
    const prior = data.transfers.filter(t=>t.season===season);
    if (prior.length && parsed.transfers.length < prior.length*0.8) throw new Error(`Unexpected transfer removal (${prior.length} → ${parsed.transfers.length})`);
    data.transfers = data.transfers.filter(t=>t.season!==season).concat(parsed.transfers);
    data.sources[sourceId] = source(p);
    data.seasonStatus[season] = {checkedAt:stamp,count:parsed.transfers.length,status:parsed.foundSection?'imported':'no transfer tables'};
    console.log(`[${index+1}/${selected.length}] ${season}: ${parsed.transfers.length} transfers`);
  } catch(e) {
    console.warn(e.message);
    failures.push({season,message:e.message});
    if (Number(season.slice(0,4)) >= seasonYear-1) throw e;
    // Historical gaps are non-blocking. Keep any prior records; retry failed seasons next run.
    if (data.seasonStatus[season]) delete data.seasonStatus[season];
  }
}
// Long loans can be repeated in several season articles. Keep one event in its earliest listed season.
const unique = new Map();
for (const transfer of data.transfers.sort((a,b)=>a.season.localeCompare(b.season))) {
  if (!unique.has(transfer.id)) unique.set(transfer.id,transfer);
}
data.transfers = [...unique.values()].sort((a,b)=>b.season.localeCompare(a.season) || (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
data.lastChecked = offline && previous ? previous.lastChecked : stamp;
data.generatedOn = data.lastChecked.slice(0,10);
data.refreshWarnings = failures;
data.license = {data:'CC-BY-SA-4.0',url:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'Adapted from Wikipedia articles by Wikipedia contributors. Tables have been extracted, normalised, combined and filtered. Linked article histories provide author attribution.'};
await enrichAges(data,previous,page,source,{full});
validateArchive(data,previous);
await mkdir(path.dirname(file),{recursive:true});
await writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n');
await rename(file+'.tmp',file);
console.log(`Saved ${squad.length} squad records and ${data.transfers.length} transfers. ${failures.length} historical sources retained/skipped.`);
