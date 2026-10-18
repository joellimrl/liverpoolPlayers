import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const root=new URL('../',import.meta.url);
const template=await readFile(new URL('src/index.template.html',root),'utf8');
const core=await readFile(new URL('src/core.js',root),'utf8');
const app=await readFile(new URL('src/app.js',root),'utf8');
const source={revisionUrl:'https://en.wikipedia.org/w/index.php?oldid=1'};
const players=[{name:'Álvaro Test',playerId:'a',playerUrl:'https://en.wikipedia.org/wiki/A',number:9,position:'FW',nation:'ESP',status:'First team',sourceId:'s'}, {name:'Keeper Test',playerId:'b',playerUrl:'https://en.wikipedia.org/wiki/B',number:1,position:'GK',nation:'ENG',status:'Loaned out',sourceId:'s'}];
const records=Array.from({length:31},(_,i)=>({id:String(i),name:`Player ${i}`,playerId:`t${i}`,playerUrl:'https://en.wikipedia.org/wiki/Test',position:i%2?'DF':'FW',season:'2025–26',date:`2025-07-${String(i+1).padStart(2,'0')}`,dateLabel:`${i+1} July 2025`,direction:i%2?'Out':'In',club:'Example FC',group:'First team',fee:`£${i}`,feeAmount:i,currency:'GBP',type:'Transfer',sourceId:'s'}));
function page(url='https://example.test/liverpool/') {
  for(const [i,record] of records.entries()) {record.birthDate=i===0?null:'2000-07-16';record.datePrecision='day';}
  players[0].birthDate='2000-01-01';
  players[1].birthDate='1990-01-01';
  const data={squad:players,transfers:records,sources:{s:source},lastChecked:new Date().toISOString(),generatedOn:'2026-10-18',license:{data:'CC-BY-SA-4.0'}};
  const html=template.replace('/* INLINE_DATA */',JSON.stringify(data)).replace('<!-- SEASON_OPTIONS -->','<option>2025–26</option>');
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.eval(core);w.eval(app);
  return dom;
}
test('initial render shows the squad, hiding the transfer panel',()=>{
  const dom=page(),d=dom.window.document;
  assert.equal(d.querySelectorAll('#squad-body tr').length,2);
  assert.equal(d.getElementById('transfers-panel').hidden,true);
  assert.match(d.getElementById('result-count').textContent,/2 players/);
  assert.equal(d.querySelector('#squad-body .player-link').textContent.includes('Keeper Test'),true);
  dom.window.close();
});
test('age column displays calculated years and sorts within role view',()=>{
  const dom=page(),w=dom.window,d=w.document;
  assert.equal(d.querySelector('#squad-body .age').textContent,String(new Date().getUTCFullYear()-1990));
  d.querySelector('[data-sort=age]').click();
  assert.match(d.querySelector('#squad-body tr').textContent,/Álvaro/);
  d.querySelector('[data-sort=age]').click();
  assert.match(d.querySelector('#squad-body tr').textContent,/Keeper/);
  const layout=d.querySelector('[name=layout]');layout.value='roles';layout.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelector('.role-heading th').colSpan,7);
  dom.window.close();
});
test('filters, empty state and reset work through real DOM events',()=>{
  const dom=page(),w=dom.window,d=w.document;
  const select=d.querySelector('[name=position]');select.value='GK';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('#squad-body tr').length,1);
  assert.match(d.querySelector('#squad-body').textContent,/Keeper Test/);
  select.value='DF';select.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.getElementById('empty').hidden,false);
  d.getElementById('empty-reset').click();assert.equal(d.querySelectorAll('#squad-body tr').length,2);
  dom.window.close();
});
test('transfer pagination and sorting run across all rows, not just the current page',()=>{
  const dom=page(),d=dom.window.document;
  d.getElementById('tab-transfers').click();
  assert.equal(d.querySelectorAll('#transfers-body tr').length,25);
  assert.match(d.querySelector('#transfers-body tr').textContent,/31 July/);
  d.getElementById('next').click();assert.equal(d.querySelectorAll('#transfers-body tr').length,6);
  d.querySelector('#transfers-panel [data-sort=date]').click();
  assert.equal(d.querySelectorAll('#transfers-body tr').length,25);
  assert.match(d.querySelector('#transfers-body tr').textContent,/1 July/);
  dom.window.close();
});
test('fee sorting is enabled only after choosing a currency',()=>{
  const dom=page(),w=dom.window,d=w.document;d.getElementById('tab-transfers').click();
  const button=d.querySelector('[data-sort=feeAmount]');assert.equal(button.disabled,true);
  const currency=d.querySelector('[name=currency]');currency.value='GBP';currency.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(button.disabled,false);button.click();assert.match(d.querySelector('#transfers-body tr .fee').textContent,/£0/);
  currency.value='';currency.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(button.disabled,true);
  dom.window.close();
});
test('transfer ages sort globally, unknowns stay last, and role headers span eight columns',()=>{
  const dom=page(),w=dom.window,d=w.document;d.getElementById('tab-transfers').click();
  const button=d.querySelector('#transfers-panel [data-sort=age]');button.click();
  assert.equal(d.querySelector('#transfers-body .age').textContent,'24');
  button.click();assert.equal(d.querySelector('#transfers-body .age').textContent,'25');
  d.getElementById('next').click();assert.equal(d.querySelector('#transfers-body tr:last-child .age').textContent,'—');
  const layout=d.querySelector('[name=layout]');layout.value='roles';layout.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelector('#transfers-body .role-heading th').colSpan,8);
  assert.equal(d.querySelectorAll('#transfers-body .age').length,31);
  dom.window.close();
});
test('player detail dialog opens and closes',()=>{
  const dom=page(),d=dom.window.document;d.querySelector('[data-player=a]').click();
  assert.equal(d.getElementById('player-dialog').hasAttribute('open'),true);
  assert.match(d.getElementById('player-title').textContent,/Álvaro/);
  d.getElementById('close-dialog').click();assert.equal(d.getElementById('player-dialog').hasAttribute('open'),false);
  dom.window.close();
});
test('URL state restores filters on a project path and local-file URL',()=>{
  for(const base of ['https://example.test/liverpool/','file:///tmp/index.html']) {
    const dom=page(`${base}#view=transfers&position=DF&season=2025%E2%80%9326&sort=name&order=asc`),d=dom.window.document;
    assert.equal(d.getElementById('squad-panel').hidden,true);
    assert.equal(d.querySelectorAll('#transfers-body tr').length,15);
    assert.equal(d.querySelector('[name=position]').value,'DF');
    dom.window.close();
  }
});
test('untrusted query strings do not produce HTML',()=>{
  const dom=page('https://example.test/#view=squad&q=%3Cimg%20src=x%20onerror=alert(1)%3E');
  assert.equal(dom.window.document.querySelectorAll('img').length,0);
  dom.window.close();
});
test('role view splits both lists and retains all matching rows',()=>{
  const dom=page(),w=dom.window,d=w.document;
  const layout=d.querySelector('[name=layout]');layout.value='roles';layout.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.deepEqual([...d.querySelectorAll('#squad-body .role-heading')].map(r=>r.textContent),['Goalkeepers 1','Forwards 1']);
  assert.equal(d.querySelector('.pagination').hidden,true);
  d.getElementById('tab-transfers').click();
  assert.equal(layout.value,'roles');
  assert.deepEqual([...d.querySelectorAll('#transfers-body .role-heading')].map(r=>r.textContent),['Defenders 15','Forwards 16']);
  assert.equal(d.querySelectorAll('#transfers-body tr:not(.role-heading)').length,31);
  d.querySelector('#transfers-panel [data-sort=date]').click();
  assert.match(d.querySelector('#transfers-body tr:not(.role-heading)').textContent,/2 July/);
  const position=d.querySelector('[name=position]');position.value='FW';position.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('#transfers-body .role-heading').length,1);
  assert.equal(d.querySelectorAll('#transfers-body tr:not(.role-heading)').length,16);
  d.getElementById('reset').click();assert.equal(layout.value,'roles');
  layout.value='list';layout.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('#transfers-body .role-heading').length,0);
  assert.equal(d.querySelectorAll('#transfers-body tr').length,25);
  assert.equal(d.querySelector('.pagination').hidden,false);
  dom.window.close();
});
test('role view restores from URL and invalid layouts fall back to list',()=>{
  const dom=page('file:///tmp/index.html#view=squad&layout=roles');
  assert.equal(dom.window.document.querySelectorAll('.role-heading').length,2);dom.window.close();
  const invalid=page('https://example.test/#view=squad&layout=garbage');
  assert.equal(invalid.window.document.querySelector('[name=layout]').value,'list');invalid.window.close();
});
