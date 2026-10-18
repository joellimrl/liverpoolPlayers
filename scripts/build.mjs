import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateArchive} from './parser.mjs';
import '../src/core.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFile(path.join(root,p),'utf8');
const data=JSON.parse(await read('data/archive.json'));
validateArchive(data);
const C=globalThis.ArchiveCore,e=C.escape;
const seasons=[...new Set(data.transfers.map(t=>t.season))].sort().reverse();
const values={
  INLINE_STYLES:(await read('src/styles.css'))+'\n'+(await read('src/compact.css')),INLINE_CORE:await read('src/core.js'),INLINE_APP:await read('src/app.js'),
  INLINE_DATA:JSON.stringify(data).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029'),
  ACTIVE_COUNT:data.squad.filter(p=>p.status!=='Loaned out').length.toString(),SQUAD_COUNT:data.squad.length.toString(),TRANSFER_COUNT:data.transfers.length.toLocaleString('en'),SEASON_COUNT:seasons.length.toString(),
  UPDATED_DATE:new Date(data.lastChecked).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}),
  SQUAD_DATE:e(data.squadAsOf || 'date not stated by source'),SQUAD_SOURCE:e(data.sources.squad.revisionUrl),
  SQUAD_ROWS:C.sort(data.squad,'number','asc').map(r=>C.squadRow(r,data)).join('\n'),TRANSFER_ROWS:data.transfers.map(r=>C.transferRow(r,data)).join('\n'),
  SEASON_OPTIONS:seasons.map(s=>`<option>${e(s)}</option>`).join(''),
  SOURCE_LIST:Object.values(data.sources).sort((a,b)=>a.title.localeCompare(b.title)).map(s=>`<li><a href="${e(s.revisionUrl)}">${e(s.title)}</a> · Wikipedia contributors · CC BY-SA 4.0 · checked ${e(s.checkedAt.slice(0,10))}</li>`).join('\n')
};
let html=await read('src/index.template.html');
html=html.replace(/<!-- ([A-Z_]+) -->|\/\* ([A-Z_]+) \*\//g,(match,a,b)=>{const key=a||b;if(!(key in values))throw new Error(`Unknown template token ${key}`);return values[key];});
await writeFile(path.join(root,'index.html.tmp'),html);
await rename(path.join(root,'index.html.tmp'),path.join(root,'index.html'));
console.log(`Built standalone index.html (${(Buffer.byteLength(html)/1024).toFixed(0)} KB), ${data.transfers.length} transfers.`);
