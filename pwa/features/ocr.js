'use strict';
// Text recognition on the device (Tesseract.js, French + English), in the background.
// - Downloaded on first use (~7.5 MB), then works offline: the engine is kept by the service
//   worker, the language data by Tesseract itself (IndexedDB).
// - One page at a time, only while the app is visible; the engine is released when idle.
// - Nothing is read by itself for photos taken in Photo mode or imported from the gallery: the PDF export
//   calls Ocr.ensure() to read what is missing and waits, so a PDF has the same text on every device.
// - The text of each photo is stored in IndexedDB (kv store, key "ocr:<photo id>") with the
//   position of every word, for search and for searchable PDFs (features/pdf-export.js).

const OCR_JS='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const OCR_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';
const OCR_CORE='https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/';
const OCR_LANGS=['fra','eng'];

const Ocr=(()=>{
  const queue=[],listeners=new Set();
  let worker=null,workerPromise=null,running=false,idleTimer=null,current=null,failed=0,holds=0,engineError=false;   // holds: exports waiting for the engine; engineError: it could not start

  const emit=()=>{const s={pending:queue.length+(current?1:0),current};for(const fn of listeners)try{fn(s)}catch{}};

  // Files go through the page (and so through the service worker cache) and are handed to
  // Tesseract as blob URLs: this keeps them available offline on every browser.
  async function blobUrl(url,suffix=''){const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);return URL.createObjectURL(await r.blob())+suffix}
  const simd=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]))}catch{return false}};
  function loadScript(src){return new Promise((res,rej)=>{if(window.Tesseract)return res();const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';s.onload=res;s.onerror=()=>rej(new Error('Tesseract unavailable'));document.head.appendChild(s)})}

  function getWorker(){
    workerPromise??=(async()=>{
      await loadScript(OCR_JS);
      const workerPath=await blobUrl(OCR_WORKER);
      // Tesseract uses a core path ending in "js" as is.
      const corePath=await blobUrl(`${OCR_CORE}tesseract-core-${simd()?'simd-':''}lstm.wasm.js`,'#core.js');
      worker=await Tesseract.createWorker(OCR_LANGS,1,{workerPath,corePath,workerBlobURL:false});
      return worker;
    })();
    workerPromise.then(()=>{engineError=false},()=>{engineError=true});
    workerPromise.catch(()=>{workerPromise=null;worker=null});
    return workerPromise;
  }
  function scheduleRelease(){
    clearTimeout(idleTimer);
    idleTimer=setTimeout(async()=>{if(running||queue.length||!worker||holds)return;const w=worker;worker=null;workerPromise=null;try{await w.terminate()}catch{}},90000);
  }

  const key=id=>`ocr:${id}`;
  async function get(id){try{return await DB.get('kv',key(id))}catch{return null}}
  // Up to date = recognised on the current version of the photo (after the last edit).
  async function upToDate(id,row){const o=await get(id);return!!o&&(o.editedAt||null)===(row.editedAt||null)}

  function wordsOf(data){
    if(Array.isArray(data.words)&&data.words.length)return data.words;
    const out=[];for(const b of data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[])for(const w of l.words||[])out.push(w);return out;
  }

  async function recognise(id){
    const row=await DB.get('photos',id);if(!row?.blob)return;
    if(row.edit&&!row.rendered)return; // the clean page is still being made: it will come back here
    if(await upToDate(id,row))return;
    const img=photoBlob(row),bmp=await createImageBitmap(img),W=bmp.width,H=bmp.height;bmp.close?.();
    const w=await getWorker();
    const{data}=await w.recognize(img);
    const r4=v=>Math.round(v*1e4)/1e4;
    const words=wordsOf(data).filter(x=>x.text?.trim()&&x.confidence>30).map(x=>[x.text.trim(),r4(x.bbox.x0/W),r4(x.bbox.y0/H),r4(x.bbox.x1/W),r4(x.bbox.y1/H)]);
    const text=(data.text||'').replace(/[ \t]+\n/g,'\n').trim();
    const latest=await DB.get('photos',id);if(!latest)return;
    await DB.put('kv',{key:key(id),text,words,w:W,h:H,lang:OCR_LANGS.join('+'),editedAt:latest.editedAt===row.editedAt?(row.editedAt||null):'stale',at:new Date().toISOString()});
  }

  async function run(){
    if(running)return;running=true;
    try{
      while(queue.length){
        if(document.hidden){await new Promise(r=>document.addEventListener('visibilitychange',function f(){if(!document.hidden){document.removeEventListener('visibilitychange',f);r()}}))}
        current=queue.shift();emit();
        try{await recognise(current);failed=0}
        catch(e){console.warn('OCR',e?.message||e);if(++failed>=3){queue.length=0;break}}
        current=null;emit();
      }
    }finally{running=false;current=null;emit();scheduleRelease()}
  }

  // For an export: reads the photos whose text is missing or out of date (after an edit) and WAITS for it.
  // onProgress({total, done, failed}) after each photo. When the engine cannot start (first use while offline,
  // or a browser that cannot run it) every remaining photo counts as failed, so the caller can say so.
  async function ensure(ids,{onProgress}={}){
    const todo=[];
    for(const id of new Set([].concat(ids))){
      const row=await DB.get('photos',id);
      if(!row?.blob||(row.edit&&!row.rendered))continue;   // no photo here, or its clean page is still being made
      if(!(await upToDate(id,row)))todo.push(id);
    }
    const out={total:todo.length,done:0,failed:0};
    if(!todo.length)return out;
    holds++;
    try{
      onProgress?.({...out});
      for(let i=0;i<todo.length;i++){
        if(document.hidden)await new Promise(r=>document.addEventListener('visibilitychange',function f(){if(!document.hidden){document.removeEventListener('visibilitychange',f);r()}}));
        try{await recognise(todo[i]);out.done++}
        catch(e){
          console.warn('OCR',e?.message||e);out.failed++;
          if(engineError){out.failed+=todo.length-i-1;onProgress?.({...out});break}   // the engine could not start: do not try every photo
        }
        onProgress?.({...out});
      }
    }finally{holds--;scheduleRelease()}
    return out;
  }

  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  return{
    enqueue(ids){for(const id of[].concat(ids))if(id&&!queue.includes(id)&&current!==id)queue.push(id);emit();run()},
    get,ensure,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    pending:()=>queue.length+(current?1:0),
    // Photos whose recognised text contains every word of the query (accents and case ignored).
    async search(q,limit=30){
      const terms=norm(q).split(/\s+/).filter(t=>t.length>1);if(!terms.length)return[];
      const rows=(await DB.all('kv')).filter(r=>String(r.key).startsWith('ocr:')&&r.text);
      const out=[];
      for(const r of rows){
        const t=norm(r.text);if(!terms.every(x=>t.includes(x)))continue;
        const i=t.indexOf(terms[0]),a=Math.max(0,i-40),b=Math.min(r.text.length,i+terms[0].length+60);
        out.push({photoId:r.key.slice(4),snippet:(a?'…':'')+r.text.slice(a,b).replace(/\s+/g,' ')+(b<r.text.length?'…':'')});
        if(out.length>=limit)break;
      }
      return out;
    }
  };
})();
