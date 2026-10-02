'use strict';
// Document scanner inside the camera (modes Document, Tableau, Livre, Carte, QR).
// - Live detection: small frames (≤512 px) go to workers/scanner-worker.js (OpenCV.js) about
//   10 times a second; once a page is locked, the next frames only re-fit its outline to the real
//   edges (3× cheaper, steadier), with a full search every few frames. The outline is smoothed
//   (ScanCore tracker) and drawn at 60 fps.
// - Auto-capture when the page is held still ~1 s, sharp, fully in the frame and close enough;
//   the manual shutter always works.
// - Each capture keeps the original photo and stores the crop/perspective + filter as an edit
//   (non-destructive, like the photo editor). Before the page is rendered, its outline is searched
//   again on the stored full-size photo (sub-pixel edges), then the clean page is rendered in the
//   background.

const SCAN_OPENCV_URL='https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
const SCAN_JSQR_URL='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const SCAN_WORKER_URL=`./workers/scanner-worker.js${document.currentScript?new URL(document.currentScript.src).search:''}`;
const SCAN_MODES=['photo','document','board','book','id','qr'];
const SCAN_DEFAULT_FILTER={document:'auto',board:'board',book:'auto',id:'auto'};
const SCAN_FILTERS=['original','auto','gray','bw','lighten','shadows','board','board-dark'];
const SCAN_STILL_SIDE=1600;      // longest side of the photo the edges are searched on after the shot
const SCAN_FULL_EVERY=6;         // live frames: one full search in this many, the rest only re-fit the outline
const SCAN_BLOCKING_WARNS=new Set(['far','cutoff','blur','dark','lowconf']);
const SCAN_ML_EVERY=3;           // board mode: the corner model looks at one live frame in this many (when it is installed)

const Scanner=(()=>{
  let worker=null,seq=0,cvState='idle',cvProgress=0;
  const calls=new Map(),listeners=new Set();
  let run=null; // live session
  const SVG_NS='http://www.w3.org/2000/svg';
  const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function detectFrame(image,mode,prior=null,hint=null){return call('detect',{image:{data:image.data.buffer,width:image.width,height:image.height},mode,prior,hint},[image.data.buffer])}

  // Board corner model (features/scan-ml.js), when one is installed: looked at in the background, its last
  // outline goes to the next full search as a candidate (it is only used if it sits on real edges).
  function pollModel(r){
    if(r.mode!=='board'||typeof ScanML==='undefined'||!ScanML.ready()||r.mlBusy||r.frame%SCAN_ML_EVERY!==0)return;
    r.mlBusy=true;
    ScanML.predict(r.video,r.region).then(m=>{r.ml=m?{quad:m.quad,at:performance.now()}:null}).catch(()=>{r.ml=null}).finally(()=>{r.mlBusy=false});
  }

  // ---------- live session ----------
  function start({video,overlay,mode,getZoom,onAuto,onQr,onStatus}){
    stop();
    const r=run={video,overlay,mode,getZoom,onAuto,onQr,onStatus,alive:true,busy:false,frame:0,
      tracker:ScanCore.createTracker(),auto:ScanCore.createAutoCapture(),
      shown:null,target:null,quality:null,gutter:.5,raw:null,status:{},lastQr:{text:null,at:0},tilt:null,cutStreak:0,lastTick:0,el:null};
    buildOverlay(r);
    if(mode!=='qr')prepare();
    if(mode==='board'&&typeof ScanML!=='undefined')ScanML.prepare();
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
          // Corners set by hand: nothing to search for.
          if(r.manual){setStatus(r,{state:'tracking',manual:true,warn:null,auto:false});return}
          const img=grab(video,region,512);
          // Outline of the last frame lets the worker skip the full search while it still fits the page.
          const prior=r.raw&&r.frame%SCAN_FULL_EVERY!==0?r.raw:null;r.frame++;
          pollModel(r);
          const hint=r.ml&&t-r.ml.at<1200?r.ml.quad:null;
          const res=await detectFrame(img,mode,prior,hint);
          if(!r.alive)return;
          r.quality=ScanCore.judgeFrame(res,mode);
          const st=r.tracker.update(res.quad,t);
          r.target=st.quad;r.raw=res.quad;if(res.gutter!=null)r.gutter=res.gutter;r.support=res.support;
          // A page larger than the picture is never found as an outline: say so once it has been seen a few times.
          r.cutStreak=!res.quad&&res.cutoff?r.cutStreak+1:0;
          const autoOn=state.scanAuto!==false&&mode!=='id';
          const shoot=r.auto.decide({quad:st.quad,stable:st.stable,quality:r.quality,t,enabled:autoOn&&!r.paused});
          // Nothing found for a while: say what usually helps (page too close, page lost against its background).
          if(st.visible)r.searchSince=null;else r.searchSince??=t;
          const lost=!st.visible&&t-r.searchSince>2500;
          const warn=st.visible?(r.quality.warn||tiltWarn(r)):(r.cutStreak>=4?'cutoff':tiltWarn(r)||(lost?'find':null));
          // A light tick the moment a page is found (Android; iPhone ignores vibration).
          if(st.visible&&r.status.state==='search'&&t-r.lastTick>1500){r.lastTick=t;navigator.vibrate?.(6)}
          setStatus(r,{state:st.visible?(st.stable?'stable':'tracking'):'search',stableFor:st.stableFor,warn,auto:autoOn,conf:st.visible&&res.quad?Math.round(res.confidence*100):null});
          if(shoot)r.onAuto?.();
        }else setStatus(r,{state:cvState==='failed'?'manual':'loading',warn:tiltWarn(r)});
      }catch(e){if(r.alive)console.warn('Scanner frame',e.message)}
      finally{r.busy=false}
    };
    r.timer=setTimeout(tick,120);
    // The outline is redrawn every display frame, easing toward the latest smoothed detection.
    const paint=now=>{
      if(!r.alive)return;r.raf=requestAnimationFrame(paint);
      const dt=Math.min(80,now-(r.lastPaint||now));r.lastPaint=now;
      if(r.manual&&r.region&&r.w){if(r.manualInit)initManual(r);else if(r.manualQuad)keepManualReachable(r)}
      const tgt=r.target&&r.region&&!(r.manual&&r.manualInit)?screenQuad(r,r.target):null;
      if(tgt){
        const k=1-Math.exp(-dt/48); // same easing at any frame rate
        r.shown=r.shown&&!r.manual?r.shown.map((p,i)=>[p[0]+(tgt[i][0]-p[0])*k,p[1]+(tgt[i][1]-p[1])*k]):tgt;
      }else r.shown=null;
      drawOverlay(r);
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

  // ---------- overlay ----------
  // The SVG is built once; frames only change path data and a few data-attributes, so colours slide
  // between states and the outline fades in and out (see .scan-overlay in styles.css).
  //   data-state: search | tracking | ready | warn | qr     data-page: "1" while an outline is shown
  function buildOverlay(r){
    const svg=r.overlay;if(!svg)return;
    svg.innerHTML='<g class="scan-guide"><path class="scan-guide-under"/><path class="scan-guide-path"/></g><g class="scan-layer"><path class="scan-dim" fill-rule="evenodd"/><path class="scan-glow"/><path class="scan-quad"/><path class="scan-fold"/><path class="scan-brackets-under"/><path class="scan-brackets"/><path class="scan-progress" pathLength="100"/></g><g class="scan-handles">'+[0,1,2,3].map(i=>`<circle class="scan-handle" data-i="${i}" r="11"/><circle class="scan-handle-hit" data-i="${i}" r="30"/>`).join('')+'</g>';
    if(!svg._scanHandles){svg._scanHandles=true;svg.addEventListener('pointerdown',onHandleDown);svg.addEventListener('click',e=>{if(e.target.closest?.('.scan-handle-hit'))e.stopPropagation()})}
    const q=s=>svg.querySelector(s);
    r.el={handles:[0,1,2,3].map(i=>[...svg.querySelectorAll(`[data-i="${i}"]`)]),guide:q('.scan-guide-path'),guideUnder:q('.scan-guide-under'),bracketsUnder:q('.scan-brackets-under'),dim:q('.scan-dim'),glow:q('.scan-glow'),quad:q('.scan-quad'),fold:q('.scan-fold'),brackets:q('.scan-brackets'),progress:q('.scan-progress')};
    svg.dataset.state='search';svg.dataset.page='';svg.dataset.mode=r.mode;
  }
  function visualState(r,hasPage){
    if(!hasPage)return'search';
    if(r.mode==='qr')return'qr';
    const s=r.status;
    if(SCAN_BLOCKING_WARNS.has(s.warn))return'warn';
    return s.state==='stable'?'ready':'tracking';
  }
  function drawOverlay(r){
    const svg=r.overlay,el=r.el;if(!svg||!el)return;
    const w=svg.clientWidth,h=svg.clientHeight;if(!w||!h)return;
    if(r.w!==w||r.h!==h){
      r.w=w;r.h=h;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
      const g=ScanCore.bracketPath(ScanCore.guideQuad(r.mode,w,h),{min:18,max:46,frac:.16});
      el.guide.setAttribute('d',g);el.guideUnder.setAttribute('d',g);
    }
    const pts=r.shown,state=visualState(r,!!pts);
    if(svg.dataset.state!==state)svg.dataset.state=state;
    const page=pts?'1':'';if(svg.dataset.page!==page)svg.dataset.page=page;
    if(!pts)return; // the last outline stays in place while it fades out
    const manual=r.manual?'1':'';if(svg.dataset.manual!==manual)svg.dataset.manual=manual;
    if(r.manual)pts.forEach(([x,y],i)=>{for(const c of el.handles[i]){c.setAttribute('cx',x.toFixed(1));c.setAttribute('cy',y.toFixed(1))}});
    const d=ScanCore.polyPath(pts);
    el.dim.setAttribute('d',`M0 0H${w}V${h}H0Z${d}`);
    el.glow.setAttribute('d',d);el.quad.setAttribute('d',d);el.progress.setAttribute('d',d);
    const br=ScanCore.bracketPath(pts);
    el.brackets.setAttribute('d',br);el.bracketsUnder.setAttribute('d',br);
    // Hold-still progress fills the page outline clockwise from the top-left corner.
    const progress=state==='ready'&&r.status.auto?Math.min(1,(r.status.stableFor||0)/1000):0;
    el.progress.style.strokeDashoffset=String(100*(1-progress));
    el.progress.style.opacity=progress>.02?'1':'0';
    if(r.mode==='book'&&r.target){const[a,b]=ScanCore.splitSpread(r.target,r.gutter)[0].slice(1,3);const[p1,p2]=screenQuad(r,[a,b]);el.fold.setAttribute('d',`M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`)}
  }

  // After a shot: the page outline shrinks into the last-photo thumbnail, so it is clear what was kept.
  function snap(){
    const r=run;if(!r||!r.overlay||!r.shown||r.mode==='qr')return;
    const svg=r.overlay,box=svg.getBoundingClientRect(),thumb=document.getElementById('lastPhotoBtn');
    let cx=box.width/2,cy=box.height*.86,s=24;
    if(thumb){const b=thumb.getBoundingClientRect();cx=b.left+b.width/2-box.left;cy=b.top+b.height/2-box.top;s=b.width*.4}
    const from=r.shown.map(p=>p.slice()),to=[[cx-s,cy-s],[cx+s,cy-s],[cx+s,cy+s],[cx-s,cy+s]];
    const el=document.createElementNS(SVG_NS,'path');el.setAttribute('class','scan-snap');svg.appendChild(el);
    const t0=performance.now(),dur=reducedMotion()?1:420;
    const step=now=>{
      const k=Math.min(1,(now-t0)/dur),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; // ease-in-out
      el.setAttribute('d',ScanCore.polyPath(from.map((p,i)=>[p[0]+(to[i][0]-p[0])*e,p[1]+(to[i][1]-p[1])*e])));
      el.style.opacity=String(k<.15?k/.15:1-Math.max(0,k-.6)/.4);
      if(k<1)requestAnimationFrame(step);else el.remove();
    };
    requestAnimationFrame(step);
  }

  function stop(){
    if(!run)return;run.alive=false;clearTimeout(run.timer);cancelAnimationFrame(run.raf);
    if(run.overlay){run.overlay.innerHTML='';delete run.overlay.dataset.state;delete run.overlay.dataset.page}
    run=null;
  }
  function pause(on){if(run)run.paused=on}
  function setTilt(t){if(run)run.tilt=t}
  // What the capture needs: the smoothed outline (frame-normalised) and the book fold.
  const current=()=>run?{quad:run.target&&run.target.map(p=>p.slice()),gutter:run.gutter,region:run.region,quality:run.quality,manual:!!run.manual}:null;

  // ---------- corners by hand ----------
  // The fallback when the detector is unsure or finds nothing: four handles on the preview, dragged onto the
  // corners of the board. The shutter then crops exactly there (no search, no auto-capture).
  // The handles live where a finger can reach them: below the top bar, above the zoom / modes / shutter, and
  // never under the tool buttons (Auto, Coins). The video is shown "cover", so a frame point is often outside
  // the screen: everything is placed in screen pixels first, then turned into frame points.
  function manualLimits(r){
    const o=r.overlay.getBoundingClientRect(),rel=el=>{const b=el.getBoundingClientRect();return{x0:b.left-o.left,x1:b.right-o.left,y0:b.top-o.top,y1:b.bottom-o.top}};
    const pad=(b,k)=>({x0:b.x0-k,x1:b.x1+k,y0:b.y0-k,y1:b.y1+k});
    const top=document.querySelector('.camera-top'),bottom=document.querySelector('.camera-bottom'),tools=document.getElementById('scanTools');
    const box={x0:14,x1:o.width-14,y0:56,y1:o.height-14},avoid=[];
    if(top)box.y0=Math.max(box.y0,rel(top).y1+6);
    if(bottom){const b=rel(bottom);if(b.y0>o.height*.45)box.y1=Math.min(box.y1,b.y0-10);else avoid.push(pad(b,8))}   // landscape: a column on the side
    if(tools&&!tools.classList.contains('hidden'))avoid.push(pad(rel(tools),8));
    return{box,avoid};
  }
  function toFrame(r,p){
    const el=r.video.getBoundingClientRect(),z=r.getZoom();
    return ScanCore.mapFromScreen(p,{videoW:r.video.videoWidth,videoH:r.video.videoHeight,elW:el.width,elH:el.height,zoom:z.css,crop:r.region});
  }
  // First placement: the last outline when it fits on screen, else the framing guide.
  function initManual(r){
    const lim=manualLimits(r);
    const raw=ScanCore.guideQuad(r.mode,r.w,r.h),guide=ScanCore.placeQuad(raw,lim,{minSide:1})||raw.map(p=>ScanCore.placePoint(p,lim));
    const seen=r.target?ScanCore.placeQuad(screenQuad(r,r.target),lim,{maxShift:28}):null;
    r.manualQuad=(seen||guide).map(p=>toFrame(r,p));r.target=r.manualQuad;r.shown=null;r.manualInit=false;
  }
  // Every frame: a handle the geometry has pushed out of reach (zoom, rotation, the bars moving) comes back.
  function keepManualReachable(r){
    const lim=manualLimits(r),cur=screenQuad(r,r.manualQuad),fit=cur.map(p=>ScanCore.placePoint(p,lim));
    if(fit.some((p,i)=>Math.hypot(p[0]-cur[i][0],p[1]-cur[i][1])>.5)&&ScanCore.isConvex(fit)){r.manualQuad=fit.map(p=>toFrame(r,p));r.target=r.manualQuad}
  }
  function setManual(on){
    const r=run;if(!r||r.mode==='qr'||r.mode==='id')return false;
    r.manual=!!on;
    if(r.manual){
      r.manualInit=true;r.raw=null;r.tracker.reset();r.auto.reset();   // placed on the next frame, when the screen size is known
      setStatus(r,{state:'tracking',manual:true,warn:null,auto:false});
    }else{
      r.manualQuad=null;r.manualInit=false;r.target=null;r.shown=null;r.raw=null;
      if(r.overlay)delete r.overlay.dataset.manual;
      setStatus(r,{state:'search',warn:null});
    }
    return r.manual;
  }
  function onHandleDown(e){
    const r=run,h=e.target.closest?.('.scan-handle-hit');
    if(!r||!r.manual||r.manualInit||!h)return;
    const i=+h.dataset.i,box=r.overlay.getBoundingClientRect();
    e.preventDefault();e.stopPropagation();try{h.setPointerCapture(e.pointerId)}catch{}
    navigator.vibrate?.(6);
    const move=ev=>{
      if(!run||run!==r||!r.manual)return;
      const q=screenQuad(r,r.manualQuad);
      q[i]=ScanCore.placePoint([ev.clientX-box.left,ev.clientY-box.top],manualLimits(r));
      // Never a bow-tie, never two corners on top of each other: the corner stops where the shape would break.
      if(ScanCore.isConvex(q)&&q.every((p,k)=>Math.hypot(p[0]-q[(k+1)%4][0],p[1]-q[(k+1)%4][1])>=24)){r.manualQuad=q.map(p=>toFrame(r,p));r.target=r.manualQuad}
    };
    const up=()=>{h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up)};
    h.addEventListener('pointermove',move);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);
  }

  // ---------- one-off detection and refinement on images ----------

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

  // Sub-pixel outline: the rough quad (frame-normalised) is searched again on the pixels, side by side.
  // Needs no OpenCV. Returns {quad, support} or null when the edges are not clear enough to trust.
  async function refineImage(img,quad,{fixed,mode}={}){
    const board=mode==='board';
    const r=await call('refine',{image:{data:img.data.buffer,width:img.width,height:img.height},quad,fixed,mode,range:board ? .045 : undefined,minStrength:board ? 2.2 : undefined},[img.data.buffer]);
    return r.refined?{quad:r.quad,support:r.support}:null;
  }
  // Same on a stored photo, at most SCAN_STILL_SIDE px on the long side. Adds the photo's real size.
  async function refineBlob(blob,quad,opts){
    const bmp=await createImageBitmap(blob);
    try{
      const k=Math.min(1,SCAN_STILL_SIDE/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0,c.width,c.height);
      const r=await refineImage(x.getImageData(0,0,c.width,c.height),quad,opts);
      return r&&{...r,width:bmp.width,height:bmp.height};
    }finally{bmp.close?.()}
  }

  return{prepare,start,stop,pause,setTilt,setManual,current,snap,detectBlob,detectImage,refineImage,refineBlob,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},get state(){return cvState},get progress(){return cvProgress}};
})();

// ---------- turning a capture into stored pages ----------

// The edit stored with a scanned page: perspective crop (if a page was found) + the mode's filter.
// `refined`: the outline was fitted to the real edges on the full photo, so only a hair is trimmed
// (otherwise a little more, so no sliver of desk or wall shows along the page).
function scanEdit(mode,quadFrame,w,h,{refined=false}={}){
  const edit={...HoliooImage.defaultEdit(),filter:scanFilterFor(mode)};
  if(quadFrame){edit.mode='quad';edit.quad=ScanCore.toEditQuad(ScanCore.insetQuad(quadFrame,refined?.0012:.006),w,h);edit.aspect='free';if(refined)edit.refined=true}
  if(mode==='document')edit.snap='a4';
  return edit;
}
function scanFilterFor(mode){return state.scanFilters?.[mode]||SCAN_DEFAULT_FILTER[mode]||'auto'}
function rememberScanFilter(mode,filter){if(!SCAN_DEFAULT_FILTER[mode])return;state.scanFilters={...(state.scanFilters||{}),[mode]:filter};saveState()}

// A stored scan with its outline made precise: the live outline (row.scanQuad) is searched again on
// the full photo. Book halves are cut from the refined whole spread, so both share one fold line.
// Returns the improved edit, or null to keep the live one.
async function preciseScanEdit(row){
  if(!row?.blob||!row.scanQuad||row.edit?.mode!=='quad'||row.edit.refined)return null;
  try{
    const r=await Scanner.refineBlob(row.blob,row.scanQuad,{mode:row.scanMode});
    if(!r)return null;
    const q=row.scanHalf!=null?ScanCore.splitSpread(r.quad,row.scanGutter??.5)[row.scanHalf]:r.quad;
    return{...row.edit,quad:scanEdit(row.scanMode||'document',q,r.width,r.height,{refined:true}).quad,refined:true};
  }catch(e){console.warn('Scan refine failed',e);return null}
}

// Pages captured by the scanner are made precise and rendered (crop + filter) one at a time in the
// image worker, then their text is recognised (features/ocr.js) — all in the background.
const scanRenderQueue=(()=>{
  const ids=[];let running=false;
  async function run(){
    if(running)return;running=true;
    while(ids.length){
      const id=ids.shift();
      try{
        const row=await DB.get('photos',id);
        if(row?.edit&&!row.rendered){await savePhotoEdit(id,await preciseScanEdit(row)||row.edit);scanPageRendered(id)}
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
