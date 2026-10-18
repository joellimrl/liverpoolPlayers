import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export const compact = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
export const wikiUrl = title => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
export function safeWikiLink(href) {
  try {
    const u = new URL(href, 'https://en.wikipedia.org');
    return u.protocol === 'https:' && u.hostname === 'en.wikipedia.org' && u.pathname.startsWith('/wiki/') ? u.href.split('#')[0] : '';
  } catch { return ''; }
}
function text($, node) {
  const copy = $(node).clone();
  copy.find('sup,.sortkey,.sorttext,.mw-editsection,style,script').remove();
  copy.find('br').replaceWith(' ');
  return compact(copy.text());
}
function person($, cell, source) {
  const copy = $(cell).clone();
  copy.find('.flagicon,sup,small,i').remove();
  const anchor = copy.find('.fn a,a').filter((_, a) => safeWikiLink($(a).attr('href'))).first();
  const name = compact(anchor.length ? anchor.text() : copy.text()).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const url = anchor.length ? safeWikiLink(anchor.attr('href')) : '';
  return { name, playerId: url ? `wiki:${decodeURIComponent(new URL(url).pathname.slice(6))}` : `unlinked:${hash(`${source}|${name}`)}`, playerUrl: url };
}
export function position(raw) {
  const s = compact(raw).toUpperCase();
  if (/\b(GK|GOALKEEPER)\b/.test(s)) return 'GK';
  if (/\b(DF|DEFENDER|CB|LB|RB|LWB|RWB|SW)\b/.test(s)) return 'DF';
  if (/\b(MF|MIDFIELDER|CM|DM|AM|LM|RM|CDM|CAM)\b/.test(s)) return 'MF';
  if (/\b(FW|FORWARD|ST|CF|LW|RW|ATTACKER)\b/.test(s)) return 'FW';
  return 'Unknown';
}
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
export function parseDate(value) {
  const s = compact(value);
  let m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
  if (m && months.includes(m[2].toLowerCase())) {
    const iso = `${m[3]}-${String(months.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === iso) return { date: iso, datePrecision: 'day' };
  }
  m = s.match(/^([a-z]+)\s+(\d{4})$/i);
  if (m && months.includes(m[1].toLowerCase())) return { date: `${m[2]}-${String(months.indexOf(m[1].toLowerCase())+1).padStart(2,'0')}`, datePrecision:'month' };
  if (/^\d{4}$/.test(s)) return { date:s, datePrecision:'year' };
  return { date:null, datePrecision:'unknown' };
}
export function parseFee(value) {
  const fee = compact(value) || 'Not stated';
  // Only a simple single-currency amount is sortable. Preserve ranges, add-ons and mixed fees verbatim.
  const m = fee.match(/^([£€$])\s*([\d,]+(?:\.\d+)?)\s*(million|m|thousand|k)?$/i);
  let feeAmount = null, currency = null;
  if (m) {
    currency = ({'£':'GBP','€':'EUR','$':'USD'})[m[1]];
    feeAmount = Number(m[2].replaceAll(',', '')) * (/^(m|million)$/i.test(m[3]) ? 1e6 : /^(k|thousand)$/i.test(m[3]) ? 1e3 : 1);
  }
  if (/^free(?: transfer)?$/i.test(fee)) feeAmount = 0;
  return {fee, feeAmount, currency};
}

// Expand rowspans/colspans before mapping columns. Wikipedia layouts differ by season.
export function tableRows($, table) {
  const pending = new Map();
  const result = [];
  $(table).find('tr').filter((_, tr) => $(tr).closest('table')[0] === table).each((_, tr) => {
    const row = [];
    for (const [col, item] of pending) {
      row[col] = item.cell;
      if (--item.left === 0) pending.delete(col);
    }
    let col = 0;
    $(tr).children('th,td').each((_, cell) => {
      while (row[col]) col++;
      const span = Math.min(30, Number($(cell).attr('colspan')) || 1);
      const down = Math.min(200, Number($(cell).attr('rowspan')) || 1);
      for (let i=0; i<span; i++) {
        row[col+i] = cell;
        if (down > 1) pending.set(col+i, {cell, left:down-1});
      }
      col += span;
    });
    result.push(row);
  });
  return result;
}

export function parseSquad(html, sourceId) {
  const $ = load(html);
  const squad = [];
  let active = false, sourceAsOf = null;
  $('h2,h3,h4,p,table').each((_, el) => {
    const label = text($,el);
    if (/^h[234]$/.test(el.tagName)) {
      if (/^First.team squad$/i.test(label)) active = true;
      else if (active && /^h[23]$/.test(el.tagName)) active = false;
      return;
    }
    if (!active) return;
    if (el.tagName === 'p' && /As of/i.test(label)) sourceAsOf = label.match(/As of (\d{1,2} \w+ \d{4})/i)?.[1] ?? sourceAsOf;
    if (el.tagName !== 'table' || !$(el).hasClass('football-squad')) return;
    const rows = tableRows($,el);
    for (const row of rows.slice(1)) {
      if (row.length !== 4 || new Set(row).size !== 4) continue;
      const p = person($,row[3],sourceId);
      if (!p.name) throw new Error('Squad row is missing a name');
      const detail = text($,row[3]);
      const shirt = text($,row[0]);
      const status = /\(at .+ until|on loan to/i.test(detail) ? 'Loaned out' : /on loan from/i.test(detail) ? 'On loan' : 'First team';
      squad.push({...p, number:/^\d+$/.test(shirt) ? Number(shirt) : null, position:position(text($,row[1])), nation:text($,row[2]), status, notes:detail.replace(p.name,'').trim(), sourceId});
    }
  });
  if (squad.length < 15 || squad.length > 70) throw new Error(`Unexpected squad size: ${squad.length}; retaining last good snapshot`);
  if (new Set(squad.map(p=>p.playerId)).size !== squad.length) throw new Error('Duplicate squad identities');
  return {squad, sourceAsOf};
}

export function parseTransfers(html, season, sourceId) {
  const $ = load(html), transfers = [], warnings = [];
  let active = false, section = '', group = 'Unspecified', foundSection = false, transferLevel = 2;
  const headingPath = [];
  $('h2,h3,h4,h5,table').each((_, el) => {
    const label = text($,el);
    if (/^h/.test(el.tagName)) {
      const level = Number(el.tagName[1]);
      headingPath[level] = label; headingPath.length = level + 1;
      if (/^Transfers(?: and loans)?$/i.test(label) || /^(?:Transfers|Loans?) (?:in|out)$/i.test(label) && !active) {
        active = true; foundSection = true; transferLevel = level;
      } else if (active && level <= transferLevel) {
        active = /^(?:Transfers|Loans?) (?:in|out)$/i.test(label);
        if (active) transferLevel = level;
      }
      if (active) section = headingPath.slice(transferLevel).filter(s=>s && !/^Transfers(?: and loans)?$/i.test(s)).join(' / ');
      return;
    }
    if (!active || $(el).find('table').length) return;
    const rows = tableRows($,el);
    const clubHeader = /^(?:(?:(?:transferred|moving|loaned) )?(?:from|to)(?: club)?|club)$/i;
    const headerAt = rows.findIndex(row => row.some(c => /^(player|name)$/i.test(text($,c))) && row.some(c => clubHeader.test(text($,c))));
    if (headerAt < 0) {
      if (rows.some(row=>row.some(c=>/^(player|name)$/i.test(text($,c))))) warnings.push(`Unrecognised player table in ${section}`);
      return;
    }
    const headers = rows[headerAt].map(c=>text($,c).toLowerCase().replaceAll('.',''));
    const idx = regex => headers.findIndex(h=>regex.test(h));
    const pi = idx(/^(player|name)$/), ci = idx(clubHeader), di = idx(/^(?:(?:transfer|entry|exit|start) )?date$/), fi = idx(/^(?:transfer )?fee$/), posi = idx(/^(pos|position)$/), ti = idx(/^type$/);
    const direction = /\bfrom\b/.test(headers[ci]) ? 'In' : /\bto\b/.test(headers[ci]) ? 'Out' : /\bout\b|departures/i.test(section) ? 'Out' : /\bin\b|arrivals/i.test(section) ? 'In' : null;
    if (!direction) { warnings.push(`Unrecognised direction: ${section}`); return; }
    group = /academy|youth|reserve/i.test(section) ? 'Academy' : /first team/i.test(section) ? 'First team' : 'Unspecified';
    for (const row of rows.slice(headerAt+1)) {
      if (new Set(row).size === 1) {
        const heading = text($,row[0]);
        if (/first team/i.test(heading)) group = 'First team';
        else if (/academy|youth|reserve|under.?\d/i.test(heading)) group = 'Academy';
        continue;
      }
      if (!row[pi] || !row[ci]) { warnings.push(`Malformed row in ${section}`); continue; }
      if (/^(player|name|total|total expenditure|total income)$/i.test(text($,row[pi]))) continue;
      if (/^(total|expenditure|income)/i.test(row.map(c=>text($,c)).join(' '))) continue;
      const p = person($,row[pi],sourceId);
      if (!p.name) { warnings.push(`Unnamed player in ${section}`); continue; }
      const club = text($,row[ci]) || 'Not stated';
      const dateLabel = di >= 0 && row[di] ? text($,row[di]) : '';
      const fee = parseFee(fi >= 0 && row[fi] ? text($,row[fi]) : 'Not stated');
      const raw = `${section} ${ti>=0 && row[ti] ? text($,row[ti]) : ''} ${fee.fee} ${club}`;
      const type = /return|recall|end of loan|loan end/i.test(raw) ? 'Loan return' : /loan/i.test(raw) ? 'Loan' : /retir/i.test(raw) ? 'Retirement' : /released|release|without club|free agent/i.test(raw) ? 'Release' : /^free/i.test(fee.fee) ? 'Free transfer' : 'Transfer';
      const date = parseDate(dateLabel);
      const id = hash([date.datePrecision === 'day' ? '' : season,p.playerId,direction,club,dateLabel,type].join('|'));
      transfers.push({id,...p,season,...date,dateLabel:dateLabel || season,position:position(posi>=0 && row[posi] ? text($,row[posi]):''),direction,club,type,group,...fee,sourceId});
    }
  });
  return {transfers:[...new Map(transfers.map(t=>[t.id,t])).values()],warnings,foundSection};
}

export function validateArchive(data, previous) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.squad) || !Array.isArray(data.transfers)) throw new Error('Invalid data schema');
  if (data.squad.length < 15 || data.squad.length > 70) throw new Error('Invalid squad size');
  for (const source of Object.values(data.sources)) {
    if (!/^https:\/\/en\.wikipedia\.org\/w\/index\.php\?/.test(source.revisionUrl || '') || !Number.isSafeInteger(source.revision)) throw new Error('Invalid source revision');
  }
  for (const collection of [data.squad, data.transfers]) {
    for (const record of collection) {
      if (!record.name || !record.playerId || !data.sources[record.sourceId]) throw new Error('Record lacks identity/provenance');
      if (record.playerUrl && !safeWikiLink(record.playerUrl)) throw new Error('Unsafe player URL');
      if (record.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(record.birthDate) || !data.sources[record.birthSourceId])) throw new Error('Birth date lacks provenance');
      if (!['GK','DF','MF','FW','Unknown'].includes(record.position)) throw new Error('Invalid position');
    }
  }
  if (new Set(data.transfers.map(t=>t.id)).size !== data.transfers.length) throw new Error('Duplicate transfer IDs');
  if (previous && data.squad.length < previous.squad.length * 0.65) throw new Error('Suspicious squad shrinkage');
  for (const t of data.transfers) {
    if (!['In','Out'].includes(t.direction) || !t.id || !/^\d{4}–\d{2}$/.test(t.season)) throw new Error('Invalid transfer');
    if (t.feeAmount !== null && (!Number.isFinite(t.feeAmount) || t.feeAmount < 0)) throw new Error('Invalid fee');
  }
}
