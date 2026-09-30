'use strict';
// Document scanner inside the camera (modes Document, Tableau, Livre, Carte, QR).
// - Live detection: small frames (≤512 px) go to workers/scanner-worker.js (OpenCV.js) about
//   10 times a second; the page outline is smoothed (ScanCore tracker) and drawn at 60 fps.
// - Auto-capture when the page is held still ~1 s and sharp; manual shutter always works.
// - Each capture keeps the original photo and stores the crop/perspective + filter as an edit
//   (non-destructive, like the photo editor); the clean page is rendered in the background.

const SCAN_OPENCV_URL='https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
const SCAN_JSQR_URL='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const SCAN_WORKER_URL=`./workers/scanner-worker.js${document.currentScript?new URL(document.currentScript.src).search:''}`;
const SCAN_MODES=['photo','document','board','book','id','qr'];
const SCAN_DEFAULT_FILTER={document:'auto',board:'board',book:'auto',id:'auto'};
const SCAN_FILTERS=['original','auto','gray','bw','lighten','shadows','board','board-dark'];

const Scanner=(()=>{
  let worker=null,seq=0,cvState='idle',cvProgress=0;
  const calls=new Map(),listeners=new Set();
  let run=null; // live session

  const emit=()=>{for(const fn of listeners)try{fn(snapshot())}catch(e){console.warn(e)}};
  const snapshot=()=>({cvState,cvProgress,...(run?.status||{})});

  function ensureWorker(){
    if(worker)return worker;
    worker=new Worker(SCAN_WORKER_URL);
    worker.onmessage=({data})=>{
      if(data.type==='progress'){cvProgress=data.value;emit();return}
      const c=calls.get(data.id);if(!c)return;calls.delete(data.id);
      data.ok?c.resolve(data):c.reject(new Error(data.error));
    };
    worker.onerror=e=>{console.warn('Scanner worker error',e.message);for(const[,c] of calls)c.reject(new Error('worker'));calls.clear()};
    return worker;
  }
  function call(type,payload={},transfer=[]){
    const w=ensureWorker(),id=++seq;
    return new Promise((resolve,reject)=>{calls.set(id,{resolve,reject});w.postMessage({id,type,...payload},transfer)});
  }

  // OpenCV is downloaded on first use of a scan mode (then kept offline by the service worker).
  let initPromise=null;
  function prepare(){
    if(cvState==='ready')return Promise.resolve(true);
    initPromise??=(async()=>{
      cvState='loading';cvProgress=0;emit();
      try{await call('init',{opencvUrl:SCAN_OPENCV_URL});cvState='ready';emit();return true}
      catch(e){console.warn('Scanner detection unavailable',e);cvState='failed';emit();initPromise=null;return false}
    })();
    return initPromise;
  }

  // Frame region analysed and captured: the part of the video visible after digital zoom.
  function frameRegion(video,digitalZoom){
    const sw=video.videoWidth/digitalZoom,sh=video.videoHeight/digitalZoom;
    return{x:(video.videoWidth-sw)/2,y:(video.videoHeight-sh)/2,w:sw,h:sh};
  }
  function grab(video,region,maxSide){
    const k=Math.min(1,maxSide/Math.max(region.w,region.h)),w=Math.max(1,Math.round(region.w*k)),h=Math.max(1,Math.round(region.h*k));
    const c=grab.canvas||(grab.canvas=document.createElement('canvas'));c.width=w;c.height=h;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(video,region.x,region.y,region.w,region.h,0,0,w,h);
    return x.getImageData(0,0,w,h);
  }

  function detectFrame(image,mode){return call('detect',{image:{data:image.data.buffer,width:image.width,height:image.height},mode},[image.data.buffer])}

  // ---------- live session ----------
  function start({video,overlay,mode,getZoom,onAuto,onQr,onStatus}){
    stop();
    const r=run={video,overlay,mode,getZoom,onAuto,onQr,onStatus,alive:true,busy:false,
      tracker:ScanCore.createTracker(),auto:ScanCore.createAutoCapture(),
      shown:null,target:null,quality:null,gutter:.5,raw:null,status:{},lastQr:{text:null,at:0},tilt:null};
    if(mode!=='qr')prepare();
    const tick=async()=>{
      if(!r.alive)return;
      r.timer=setTimeout(tick,mode==='qr'?220:90);
      if(r.busy||document.hidden||!video.videoWidth)return;
      r.busy=true;
      try{
        const t=performance.now(),region=frameRegion(video,r.getZoom().digital);
        r.region=region;
        if(mode==='qr'){
          const img=grab(video,region,720);
          const res=await call('qr',{image:{data:img.data.buffer,width:img.width,height:img.height},jsqrUrl:SCAN_JSQR_URL},[img.data.buffer]);
          if(res.text&&(res.text!==r.lastQr.text||t-r.lastQr.at>4000)){r.lastQr={text:res.text,at:t};r.onQr?.(res.text)}
          r.raw=res.corners;r.target=res.corners;setStatus(r,{state:res.text?'qr':'search'});
        }else if(cvState==='ready'){
          const img=grab(video,region,512),res=await detectFrame(img,mode);
          if(!r.alive)return;
          r.quality=ScanCore.judgeFrame(res,mode);
          const st=r.tracker.update(res.quad,t);
          r.target=st.quad;r.raw=res.quad;if(res.gutter!=null)r.gutter=res.gutter;
          const autoOn=state.scanAuto!==false&&mode!=='id';
          const shoot=r.auto.decide({quad:st.quad,stable:st.stable,quality:r.quality,t,enabled:autoOn&&!r.paused});
          setStatus(r,{state:st.visible?(st.stable?'stable':'tracking'):'search',stableFor:st.stableFor,warn:st.visible?(r.quality.warn||tiltWarn(r)):tiltWarn(r),auto:autoOn});
          if(shoot)r.onAuto?.();
        }else setStatus(r,{state:cvState==='failed'?'manual':'loading',warn:tiltWarn(r)});
      }catch(e){if(r.alive)console.warn('Scanner frame',e.message)}
      finally{r.busy=false}
    };
    r.timer=setTimeout(tick,120);
    // Outline drawn every display frame, easing toward the latest smoothed detection.
    const paint=()=>{
      if(!r.alive)return;r.raf=requestAnimationFrame(paint);
      const tgt=r.target&&r.region?screenQuad(r,r.target):null;
      if(!tgt){r.shown=null;drawOverlay(r,null);return}
      r.shown=r.shown?r.shown.map((p,i)=>[p[0]+(tgt[i][0]-p[0])*.35,p[1]+(tgt[i][1]-p[1])*.35]):tgt;
      drawOverlay(r,r.shown);
    };
    r.raf=requestAnimationFrame(paint);
    return r;
  }
  function tiltWarn(r){return r.tilt&&ScanCore.tiltHint(r.tilt.beta,r.tilt.gamma,r.mode)?'tilt':null}
  function setStatus(r,s){
    const next={...s,mode:r.mode};const key=JSON.stringify({...next,stableFor:Math.round((s.stableFor||0)/250)});
    r.status=next;if(key===r.statusKey)return;r.statusKey=key;r.onStatus?.(next);emit();
  }
  function screenQuad(r,q){
    const el=r.video.getBoundingClientRect(),z=r.getZoom();
    return ScanCore.mapToScreen(q,{videoW:r.video.videoWidth,videoH:r.video.videoHeight,elW:el.width,elH:el.height,zoom:z.css,crop:r.region});
  }
  function drawOverlay(r,pts){
    const svg=r.overlay;if(!svg)return;
    if(!pts){if(svg.dataset.on){svg.innerHTML='';delete svg.dataset.on}return}
    const w=svg.clientWidth,h=svg.clientHeight,st=r.status.state;
    const cls=st==='stable'?'ok':st==='qr'?'qr':'';
    const progress=r.status.auto?Math.min(1,(r.status.stableFor||0)/1000):0;
    const d=pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ');
    let fold='';
    if(r.mode==='book'&&r.target){const[a,b]=ScanCore.splitSpread(r.target,r.gutter)[0].slice(1,3);const[p1,p2]=screenQuad(r,[a,b]);fold=`<line class="scan-fold" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}"/>`}
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    svg.innerHTML=`<path class="scan-dim" fill-rule="evenodd" d="M0 0H${w}V${h}H0Z M${pts.map(p=>p.join(' ')).join(' L')}Z"/><polygon class="scan-quad ${cls}" points="${d}"/>${fold}${pts.map(p=>`<circle class="scan-corner ${cls}" cx="${p[0]}" cy="${p[1]}" r="7"/>`).join('')}${progress>.15&&r.mode!=='qr'?`<circle class="scan-ring" cx="${(pts[0][0]+pts[2][0])/2}" cy="${(pts[0][1]+pts[2][1])/2}" r="22" style="stroke-dashoffset:${(1-progress)*138}"/>`:''}`;
    svg.dataset.on='1';
  }
  function stop(){
    if(!run)return;run.alive=false;clearTimeout(run.timer);cancelAnimationFrame(run.raf);
    if(run.overlay){run.overlay.innerHTML='';delete run.overlay.dataset.on}
    run=null;
  }
  function pause(on){if(run)run.paused=on}
  function setTilt(t){if(run)run.tilt=t}
  // What the capture needs: the smoothed outline (frame-normalised) and the book fold.
  const current=()=>run?{quad:run.target&&run.target.map(p=>p.slice()),gutter:run.gutter,region:run.region,quality:run.quality}:null;

  // Detection on an imported photo (gallery / fallback camera): same pipeline, one frame.
  async function detectBlob(blob,mode){
    if(!(await prepare()))return null;
    const bmp=await createImageBitmap(blob);
    try{
      const k=Math.min(1,640/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');
      c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
      const x=c.getContext('2d');x.drawImage(bmp,0,0,c.width,c.height);
      const img=x.getImageData(0,0,c.width,c.height),res=await detectFrame(img,mode);
      return{...res,width:bmp.width,height:bmp.height};
    }finally{bmp.close?.()}
  }

  // Detection on pixels already in memory (the photo editor's "Détecter les bords").
  async function detectImage(img,mode='document'){if(!(await prepare()))return null;return detectFrame(img,mode)}

  return{prepare,start,stop,pause,setTilt,current,detectBlob,detectImage,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},get state(){return cvState},get progress(){return cvProgress}};
})();

// ---------- turning a capture into stored pages ----------

// The edit stored with a scanned page: perspective crop (if a page was found) + the mode's filter.
function scanEdit(mode,quadFrame,w,h){
  const edit={...HoliooImage.defaultEdit(),filter:scanFilterFor(mode)};
  if(quadFrame){edit.mode='quad';edit.quad=ScanCore.toEditQuad(quadFrame,w,h);edit.aspect='free'}
  if(mode==='document')edit.snap='a4';
  return edit;
}
function scanFilterFor(mode){return state.scanFilters?.[mode]||SCAN_DEFAULT_FILTER[mode]||'auto'}
function rememberScanFilter(mode,filter){if(!SCAN_DEFAULT_FILTER[mode])return;state.scanFilters={...(state.scanFilters||{}),[mode]:filter};saveState()}

// Pages captured by the scanner are rendered (crop + filter) one at a time in the image worker,
// then their text is recognised (features/ocr.js) — all in the background.
const scanRenderQueue=(()=>{
  const ids=[];let running=false;
  async function run(){
    if(running)return;running=true;
    while(ids.length){
      const id=ids.shift();
      try{
        const row=await DB.get('photos',id);
        if(row?.edit&&!row.rendered){await savePhotoEdit(id,row.edit);scanPageRendered(id)}
        if(row&&typeof Ocr!=='undefined')Ocr.enqueue(id);
      }catch(e){console.warn('Scan render failed',e)}
    }
    running=false;
  }
  return{add(id){if(!ids.includes(id))ids.push(id);run()},pending:()=>ids.length+(running?1:0)};
})();
function scanPageRendered(id){
  if(currentView==='capture'&&camShots.at(-1)===id)DB.get('photos',id).then(r=>{if(r?.thumb)setCameraThumb(r.thumb)});
  if(currentView==='scanReview'&&typeof refreshScanReviewPage==='function')refreshScanReviewPage(id);
}
