// Scanner glue (features/scanner.js): the public API the camera relies on must all be there, and the hand-set
// corners (Coins) must stay on screen. A missing function here once broke the whole camera screen at load.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={console,document:{currentScript:null},matchMedia:()=>({matches:false}),navigator:{}};ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const f of ['../features/scan-core.js','../features/scanner.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const Scanner=vm.runInContext('Scanner',ctx),has=n=>vm.runInContext(`typeof ${n}`,ctx);

test('the Scanner API used by the camera, the review and the photo editor is complete',()=>{
  for(const k of['prepare','start','stop','pause','setTilt','setManual','current','snap','detectBlob','detectImage','refineImage','refineBlob','subscribe'])
    assert.equal(typeof Scanner[k],'function',`Scanner.${k}`);
  assert.equal(Scanner.current(),null,'no live session: nothing to capture');
  assert.equal(Scanner.setManual(true),false,'corners by hand need a live scanner');
});

test('the functions that turn a capture into stored pages are there',()=>{
  for(const n of['scanEdit','scanFilterFor','rememberScanFilter','preciseScanEdit'])assert.equal(has(n),'function',n);
  assert.equal(has('scanRenderQueue'),'object');
});
