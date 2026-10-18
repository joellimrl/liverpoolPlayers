import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('an upstream failure leaves the last successful snapshot byte-for-byte intact',async()=>{
  const root=new URL('../',import.meta.url), file=new URL('data/archive.json',root);
  const before=await readFile(file,'utf8');
  const mock='data:text/javascript,'+encodeURIComponent('globalThis.fetch = async () => ({ok:false,status:403,headers:new Headers()});');
  const result=spawnSync(process.execPath,['--import',mock,'scripts/refresh.mjs'],{cwd:fileURLToPath(root),encoding:'utf8',timeout:10000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/HTTP 403/);
  assert.equal(await readFile(file,'utf8'),before);
});
