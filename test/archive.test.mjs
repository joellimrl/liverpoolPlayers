import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {parseDate,parseFee,parseTransfers,parseSquad,tableRows,safeWikiLink,validateArchive} from '../scripts/parser.mjs';
import '../src/core.js';
const C=globalThis.ArchiveCore;
const table=(header,rows)=>`<h2>Transfers</h2><h3>In</h3><table><tr>${header.map(h=>`<th>${h}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
test('date precision is preserved; invalid dates are not invented',()=>{
  assert.deepEqual(parseDate('1 July 2025'),{date:'2025-07-01',datePrecision:'day'});
  assert.deepEqual(parseDate('July 2025'),{date:'2025-07',datePrecision:'month'});
  assert.deepEqual(parseDate('2025'),{date:'2025',datePrecision:'year'});
  assert.equal(parseDate('31 February 2025').date,null);
  assert.equal(parseDate('99 July 2025').date,null);
  assert.equal(parseDate('Summer 2025').date,null);
});
test('undisclosed is not free, complex fees are not misleading numbers',()=>{
  assert.equal(parseFee('Undisclosed').feeAmount,null);
  assert.equal(parseFee('Not stated').feeAmount,null);
  assert.equal(parseFee('Free transfer').feeAmount,0);
  assert.equal(parseFee('£1.5m').feeAmount,1500000);
  assert.equal(parseFee('€4,000,000').currency,'EUR');
  assert.equal(parseFee('£10m + £2m add-ons').feeAmount,null);
  assert.equal(parseFee('£5m / €6m').feeAmount,null);
});
test('source HTML annotations are stripped and nationality flags are not player identities',()=>{
  const html=table(['Date','Player','Transferred from','Fee','Pos.'],[['1 July 2025<sup>[1]</sup>','<span class="flagicon"><a href="/wiki/Spain">Spain</a></span><a href="/wiki/Example_player">Example player</a>','Example FC','Undisclosed','MF']]);
  const {transfers}=parseTransfers(html,'2025–26','s');
  assert.equal(transfers.length,1);assert.equal(transfers[0].name,'Example player');
  assert.equal(transfers[0].playerId,'wiki:Example_player');assert.equal(transfers[0].date,'2025-07-01');
  assert.equal(transfers[0].feeAmount,null);
});
test('alternate headers and start dates are supported',()=>{
  const html=table(['Start date','End date','Player','To club','Fee'],[['1 July 2025','30 June 2026','<a href="/wiki/Example">Example</a>','Example FC','Loan']]);
  const t=parseTransfers(html,'2025–26','s').transfers[0];assert.equal(t.direction,'Out');assert.equal(t.type,'Loan');assert.equal(t.date,'2025-07-01');
});
test('generic Transfers and loans heading does not label permanent transfers as loans',()=>{
  const html=table(['Date','Player','From','Fee'],[['1 July 2025','<a href="/wiki/A">A</a>','B','£100']]).replace('<h2>Transfers</h2>','<h2>Transfers and loans</h2>');
  assert.equal(parseTransfers(html,'2025–26','s').transfers[0].type,'Transfer');
});
test('line breaks in headers and explicit released type are understood',()=>{
  const html=table(['Name','Moving to','Type','Transfer<br>fee'],[['<a href="/wiki/A">A</a>','B','Released','']]);
  const t=parseTransfers(html,'2025–26','s').transfers[0];assert.equal(t.type,'Release');assert.equal(t.feeAmount,null);
});
test('rowspans preserve dates for every player',()=>{
  const html='<table><tr><th>Date</th><th>Player</th></tr><tr><td rowspan="2">1 July</td><td>A</td></tr><tr><td>B</td></tr></table>';
  const $=load(html), rows=tableRows($,$('table')[0]);
  assert.equal($(rows[2][0]).text(),'1 July');assert.equal($(rows[2][1]).text(),'B');
});
test('section group headers do not become transfers',()=>{
  const html='<h2>Transfers</h2><h3>In</h3><table><tr><th>Player</th><th>From</th></tr><tr><td colspan="2">Academy</td></tr><tr><td><a href="/wiki/A">A</a></td><td>B</td></tr><tr><td colspan="2">Total</td></tr></table>';
  const result=parseTransfers(html,'2025–26','s');assert.equal(result.transfers.length,1);assert.equal(result.transfers[0].group,'Academy');
});
test('same dated loan in adjacent season pages has the same event ID',()=>{
  const html=table(['Date','Player','To','Fee'],[['1 July 2024','<a href="/wiki/A">A</a>','B','Loan']]);
  assert.equal(parseTransfers(html,'2024–25','a').transfers[0].id,parseTransfers(html,'2025–26','b').transfers[0].id);
});
test('same-name players with different article identities are kept separate',()=>{
  const html=table(['Player','From'],[['<a href="/wiki/Smith_(1990)">Smith</a>','A'],['<a href="/wiki/Smith_(2000)">Smith</a>','A']]);
  assert.equal(parseTransfers(html,'2025–26','s').transfers.length,2);
});
test('retired and academy squad tables are excluded; active loans stay labelled',()=>{
  const rows=Array.from({length:16},(_,i)=>`<tr><td>${i+1}</td><td>MF</td><td>ENG</td><td><span class="fn"><a href="/wiki/P${i}">Player ${i}</a></span>${i===0?' (at Example until 30 June 2027)':''}</td></tr>`).join('');
  const html=`<h3>First-team squad</h3><p>As of 1 September 2026</p><table class="football-squad"><tr><th>No.</th><th>Pos.</th><th>Nation</th><th>Player</th></tr>${rows}</table><h3>Retired numbers</h3><table class="football-squad"><tr><td>Retired</td></tr></table>`;
  const result=parseSquad(html,'s');assert.equal(result.squad.length,16);assert.equal(result.squad[0].status,'Loaned out');assert.equal(result.sourceAsOf,'1 September 2026');
});
test('unknown values always sort last, in either direction',()=>{
  const rows=[{name:'A',id:'a',feeAmount:null},{name:'B',id:'b',feeAmount:10},{name:'C',id:'c',feeAmount:2}];
  assert.deepEqual(C.sort(rows,'feeAmount','asc').map(r=>r.name),['C','B','A']);
  assert.deepEqual(C.sort(rows,'feeAmount','desc').map(r=>r.name),['B','C','A']);
});
test('search handles accents and combined filters',()=>{
  const rows=[{name:'Álvaro Núñez',position:'DF',season:'2025–26',direction:'In',currency:'GBP'},{name:'Alvaro',position:'MF',season:'2024–25'}];
  assert.equal(C.filter(rows,{q:'alvaro nunez',position:'DF',direction:'In'}).length,1);
  assert.equal(C.filter(rows,{q:'alvaro',position:'FW'}).length,0);
});
test('positions sort in football order',()=>{
  const rows=['FW','Unknown','DF','MF','GK'].map((p,i)=>({name:String(i),id:String(i),position:p}));
  assert.deepEqual(C.sort(rows,'position','asc').map(r=>r.position),['GK','DF','MF','FW','Unknown']);
});
test('currency filters exclude unrelated and unknown amounts but include explicit free moves',()=>{
  const rows=[{currency:'GBP',feeAmount:1},{currency:'EUR',feeAmount:2},{currency:null,feeAmount:0},{currency:null,feeAmount:null}];
  assert.equal(C.filter(rows,{currency:'GBP'}).length,2);
});
test('source links cannot become executable URLs',()=>{
  assert.equal(safeWikiLink('javascript:alert(1)'),'');assert.equal(safeWikiLink('//evil.example/wiki/A'),'');
  assert.equal(safeWikiLink('/wiki/A'),'https://en.wikipedia.org/wiki/A');
  assert.equal(C.escape('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
test('a failed or empty current squad cannot replace the snapshot',()=>{
  assert.throws(()=>parseSquad('<h3>First-team squad</h3>','s'),/Unexpected squad size/);
  assert.throws(()=>validateArchive({schemaVersion:1,squad:[],transfers:[],sources:{}}),/Invalid squad size/);
});
