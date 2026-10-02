// Ocr.ensure (features/ocr.js): the PDF export reads the text that is missing and waits for it, so a PDF has the
// same text on every device. Photos taken in Photo mode or imported are never read in the background: before this,
// a PDF made on a tablet that had not read them held only images. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup({engineFails=false}={}){
  const kv=new Map(),photos=new Map(),calls={create:0,recognise:0};
  const DB={get:async(s,k)=>(s==='kv'?kv:photos).get(k),put:async(s,v)=>{(s==='kv'?kv:photos).set(v.key??v.id,v)},all:async s=>[...(s==='kv'?kv:photos).values()]};
  const ctx={console:{...console,warn(){}},DB,photoBlob:r=>r.blob,createImageBitmap:async()=>({width:1000,height:500,close(){}}),
    fetch:async()=>({ok:true,blob:async()=>new Blob(['x'])}),URL:{createObjectURL:()=>'blob:x'},WebAssembly:{validate:()=>false},
    document:{hidden:false,head:{appendChild(){}},addEventListener(){},removeEventListener(){}}};
  ctx.setTimeout=(f,ms)=>{const t=setTimeout(f,ms);t.unref?.();return t};ctx.clearTimeout=clearTimeout;   // the idle release must not keep the test alive
  ctx.window=ctx;ctx.self=ctx;
  ctx.Tesseract={createWorker:async()=>{calls.create++;if(engineFails)throw new Error('engine unavailable');
    return{recognize:async()=>{calls.recognise++;return{data:{text:'Bonjour Holioo',words:[{text:'Bonjour',confidence:90,bbox:{x0:10,y0:10,x1:200,y1:60}},{text:'Holioo',confidence:88,bbox:{x0:220,y0:10,x1:400,y1:60}}]}}},terminate:async()=>{}}}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../features/ocr.js',import.meta.url),'utf8'),ctx);
  const add=(id,extra={})=>photos.set(id,{id,blob:new Blob(['p']),...extra});
  return{Ocr:vm.runInContext('Ocr',ctx),kv,add,calls,photos};
}

test('photos without text are read, the result is stored, progress is reported',async()=>{
  const{Ocr,kv,add,calls}=setup();add('a');add('b');
  const steps=[];
  const r=await Ocr.ensure(['a','b'],{onProgress:s=>steps.push(`${s.done}/${s.total}`)});
  assert.deepEqual({...r},{total:2,done:2,failed:0});
  assert.deepEqual(steps,['0/2','1/2','2/2']);
  assert.equal(calls.recognise,2);
  const o=await Ocr.get('a');
  assert.equal(o.text,'Bonjour Holioo');assert.equal(o.words.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(o.words[0])),['Bonjour',.01,.02,.2,.12]);
  assert.ok(kv.has('ocr:b'));
});

test('text that is already there is not read again; a photo edited since is',async()=>{
  const{Ocr,add,calls,photos}=setup();add('a');
  await Ocr.ensure(['a']);assert.equal(calls.recognise,1);
  assert.equal((await Ocr.ensure(['a'])).total,0,'up to date: nothing to do');
  photos.set('a',{...photos.get('a'),editedAt:'2026-10-02T10:00:00Z'});
  const r=await Ocr.ensure(['a']);
  assert.equal(r.total,1);assert.equal(calls.recognise,2,'a photo edited after its text was read is read again');
});

test('photos that are not here, or whose clean page is still being made, are left out',async()=>{
  const{Ocr,add,calls}=setup();add('here');add('pending',{edit:{mode:'quad'},rendered:null});
  const r=await Ocr.ensure(['here','pending','gone','here']);
  assert.deepEqual({...r},{total:1,done:1,failed:0});assert.equal(calls.recognise,1);
});

test('when the engine cannot start every photo is reported as failed, after one try',async()=>{
  const{Ocr,add,calls}=setup({engineFails:true});add('a');add('b');add('c');
  const r=await Ocr.ensure(['a','b','c']);
  assert.deepEqual({...r},{total:3,done:0,failed:3});
  assert.equal(calls.create,1,'the engine is tried once, not once per photo');
});
