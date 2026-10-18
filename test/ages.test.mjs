import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBirthDate,enrichAges} from '../scripts/ages.mjs';
import '../src/core.js';
test('age uses completed years at UTC birthdays and rejects invalid dates',()=>{
  const age=globalThis.ArchiveCore.age;
  assert.equal(age('2000-10-19',new Date('2026-10-18T12:00:00Z')),25);
  assert.equal(age('2000-10-18',new Date('2026-10-18T00:00:00Z')),26);
  assert.equal(age('2000-02-29',new Date('2025-02-28T00:00:00Z')),24);
  assert.equal(age('2000-02-29',new Date('2025-03-01T00:00:00Z')),25);
  for(const value of [null,'','2000','2000-02-30','2100-01-01'])assert.equal(age(value),null);
});
test('birth parser requires an exact valid infobox birth date',()=>{
  assert.equal(parseBirthDate('<table class="infobox"><tr><td><span class="bday">1992-06-15</span></td></tr></table>'),'1992-06-15');
  assert.equal(parseBirthDate('<span class="bday">1992-06-15</span>'),null);
  assert.equal(parseBirthDate('<table class="infobox"><tr><td><span class="bday">1992-02-31</span></td></tr></table>'),null);
});
test('optional birth-date failure preserves previously sourced date',async()=>{
  const p={playerId:'wiki:A',name:'A',playerUrl:'https://en.wikipedia.org/wiki/A',birthDate:'2000-01-01',birthSourceId:'birth:wiki:A'};
  const previous={squad:[p]},data={squad:[{...p,birthDate:undefined}],sources:{}};
  await enrichAges(data,previous,async()=>{throw Error('offline');},()=>{});
  assert.equal(data.squad[0].birthDate,'2000-01-01');
});
test('transfer age uses the event date, not today, and requires precise dates',()=>{
  const record={birthDate:'1990-07-02',date:'2010-07-01',datePrecision:'day'};
  const age=globalThis.ArchiveCore.transferAge;
  assert.equal(age(record),19);
  assert.equal(age({...record,date:'2010-07-02'}),20);
  assert.equal(age({...record,date:'2015-07-02'}),25);
  for(const date of ['2010','2010-07',null,'2010-02-31'])assert.equal(age({...record,date}),null);
  assert.equal(age({...record,datePrecision:'month'}),null);
  assert.equal(age({...record,birthDate:null}),null);
});
test('one sourced birth date is reused across squad and repeated transfers',async()=>{
  const player={playerId:'wiki:A',name:'A',playerUrl:'https://en.wikipedia.org/wiki/A'};
  const data={squad:[{...player}],transfers:[{...player},{...player}],sources:{}};
  let calls=0;
  await enrichAges(data,null,async()=>{calls++;return {text:'<table class="infobox"><tr><td><span class="bday">1990-01-01</span></td></tr></table>'};},()=>({checkedAt:new Date().toISOString()}));
  assert.equal(calls,1);
  for(const p of [...data.squad,...data.transfers]){assert.equal(p.birthDate,'1990-01-01');assert.equal(p.birthSourceId,'birth:wiki:A');}
  await enrichAges(data,data,async()=>{throw Error('should be cached');},()=>{});
  assert.equal(calls,1);
});
test('refreshed transfer records recover cached birth dates by player identity',async()=>{
  const p={playerId:'wiki:Former',name:'Former',playerUrl:'https://en.wikipedia.org/wiki/Former'};
  const previous={squad:[],transfers:[{...p,birthDate:'1960-05-12',birthSourceId:'birth:wiki:Former'}]};
  const data={squad:[],transfers:[{...p}],sources:{'birth:wiki:Former':{checkedAt:new Date().toISOString()}}};
  await enrichAges(data,previous,async()=>{throw Error('must not fetch');},()=>{});
  assert.equal(data.transfers[0].birthDate,'1960-05-12');
});
