'use strict';

let currentPhotoViewer=null;

let currentFileId=null;

let viewerObjectUrl=null;

let currentPdfReturnView='files';

function revokeViewerUrl(){
  if(viewerObjectUrl){try{URL.revokeObjectURL(viewerObjectUrl)}catch{}viewerObjectUrl=null}
}

// "À SYNC" only when a Google Drive is connected: without one (guest mode, Drive not connected) nothing is
// waiting, the photo simply lives on this device.
function photoStatusLabel(row){
  const waiting=navigator.onLine&&!guestMode&&!!driveStatus?.connected;
  if(row?.driveNeedsUpdate)return{label:waiting?'À SYNC':'LOCAL',cls:waiting?'orange':'gray'};
  if(row?.driveFileId)return{label:'DRIVE',cls:'green'};
  if(row?.syncState==='drive_full')return{label:'DRIVE PLEIN',cls:'coral'};
  if(row?.syncState==='error')return{label:'ERREUR',cls:'coral'};
  if(row?.syncState==='synced')return{label:'SYNC',cls:'green'};
  if(row?.syncState==='pending')return{label:waiting?'À SYNC':'LOCAL',cls:waiting?'orange':'gray'};
  return{label:'LOCAL',cls:'gray'};
}

function openPhotoViewer(ids,startIndex=0,options={}){
  if(!ids?.length)return;
  currentPhotoViewer={
    ids:[...ids],
    index:Math.max(0,Math.min(startIndex,ids.length-1)),
    title:options.title||'Galerie',
    source:options.source||'generic',
    sourceId:options.sourceId||null,
    editable:!!options.editable,
    returnView:options.returnView||currentView,
    courseId:options.courseId||currentCourseId,
    sectionId:options.sectionId||currentSectionId,
    sessionId:options.sessionId||currentSessionId
  };
  navigate('photoViewer');
}

function viewerStep(dir){
  if(!currentPhotoViewer)return;
  const next=currentPhotoViewer.index+dir;if(next<0||next>=currentPhotoViewer.ids.length)return;
  currentPhotoViewer.index=next;renderPhotoViewer();
}

function setupImageGestures(){
  const stage=byId('viewerStage'),img=byId('viewerImage');if(!stage||!img)return;
  let startX=0,startY=0,startDist=0,scale=1,lastScale=1,lastTap=0,dragging=false;
  const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const apply=()=>{img.style.transform=`scale(${scale})`};
  stage.addEventListener('touchstart',e=>{
    if(e.touches.length===1){startX=e.touches[0].clientX;startY=e.touches[0].clientY;dragging=true;const t=Date.now();if(t-lastTap<280){scale=scale>1?1:2.5;lastScale=scale;apply()}lastTap=t}
    else if(e.touches.length===2){startDist=distance(e.touches);lastScale=scale;dragging=false}
  },{passive:true});
  stage.addEventListener('touchmove',e=>{
    if(e.touches.length===2&&startDist){scale=Math.max(1,Math.min(5,lastScale*(distance(e.touches)/startDist)));apply()}
  },{passive:true});
  stage.addEventListener('touchend',e=>{
    if(!dragging||scale>1||e.changedTouches.length!==1)return;
    const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)viewerStep(dx<0?1:-1);
    dragging=false;
  },{passive:true});
}

function viewerMoveCurrent(){
  const v=currentPhotoViewer;if(!v||v.source!=='session')return;
  const ctx=findSessionContext(v.sessionId);if(!ctx)return;
  const photoId=v.ids[v.index];
  const targets=[];for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)if(session.id!==ctx.session.id)targets.push({course,section,session});
  if(!targets.length){showToast('Créez d’abord une autre séance');return}
  openSheet({title:'Déplacer cette photo',subtitle:'Choisissez une autre séance.',body:`<div class="field"><label>Destination</label><select id="viewerMoveTarget">${targets.map(t=>`<option value="${t.session.id}">${esc(t.course.name)} • ${esc(t.section.name)} • ${esc(t.session.title)}</option>`).join('')}</select></div>`,confirmText:'Déplacer',confirmClass:'purple',onConfirm:()=>{const target=targets.find(t=>t.session.id===byId('viewerMoveTarget').value);if(!target)return false;ctx.session.photoIds=ctx.session.photoIds.filter(x=>x!==photoId);target.session.photoIds.push(photoId);saveState();queueSync();v.ids=v.ids.filter(x=>x!==photoId);if(!v.ids.length){showToast('Photo déplacée');navigate('session')}else{v.index=Math.min(v.index,v.ids.length-1);renderPhotoViewer();showToast('Photo déplacée')}return true}})
}

// Remove bytes before changing references; failed storage operations leave the UI intact.
async function removeLocalPhoto(id){
  await DB.del('photos',id);
  await DB.del('kv',`ocr:${id}`).catch(()=>{});
  detachPhoto(id);
  saveState();queueSync();
}
// Takes the photo out of every séance and batch (its bytes stay: the long-press menu can still undo).
function detachPhoto(id){
  for(const c of state.courses)for(const section of c.sections)for(const session of section.sessions)session.photoIds=session.photoIds.filter(x=>x!==id);
  for(const batch of state.inbox)batch.photoIds=batch.photoIds.filter(x=>x!==id);
  state.inbox=state.inbox.filter(batch=>batch.photoIds.length);
  const cleanBatch=batch=>{if(!batch)return;batch.photoIds=batch.photoIds.filter(x=>x!==id);batch.selected?.delete(id);for(const child of batch.splitQueue||[])cleanBatch(child)};
  cleanBatch(currentBatch);cleanBatch(state.captureDraft);
}
function confirmDeletePhoto(id,after=()=>render()){
  let busy=false;
  openSheet({title:'Supprimer cette photo ?',subtitle:'La photo sera supprimée de vos captures et séances sur cet appareil. Les copies déjà publiées ou enregistrées dans Drive resteront disponibles.',confirmText:'Supprimer',confirmClass:'coral',onConfirm:async()=>{
    if(busy)return false;busy=true;
    try{await removeLocalPhoto(id);await after();showToast('Photo supprimée');return true}
    catch(e){console.error(e);showToast('Suppression impossible. Réessayez.');busy=false;return false}
  }});
}
function viewerDeleteCurrent(){
  const v=currentPhotoViewer;if(!v?.editable)return;
  const photoId=v.ids[v.index];
  confirmDeletePhoto(photoId,async()=>{
    v.ids=v.ids.filter(x=>x!==photoId);revokeViewerUrl();
    if(!v.ids.length){navigate(v.source==='batch'?'inbox':v.returnView||'files');return}
    v.index=Math.min(v.index,v.ids.length-1);await renderPhotoViewer();
  });
}
async function removeLocalPdf(id){
  await DB.del('files',id);DB.del('kv',`pdfink:${id}`).catch(()=>{});state.files=state.files.filter(f=>f.id!==id);saveState();queueSync();
}
function confirmDeletePdf(id,returnView=currentView){
  const meta=state.files.find(f=>f.id===id);if(!meta)return;
  let busy=false;
  openSheet({title:`Supprimer « ${meta.title} » ?`,subtitle:'Le PDF sera supprimé de Holioo sur cet appareil. Les photos originales, les copies dans Drive et la version publiée dans la bibliothèque seront conservées.',confirmText:'Supprimer',confirmClass:'coral',onConfirm:async()=>{
    if(busy)return false;busy=true;
    try{await removeLocalPdf(id);if(currentFileId===id){currentFileId=null;revokeViewerUrl()}navigate(returnView==='pdfViewer'?currentPdfReturnView:returnView);showToast('PDF supprimé');return true}
    catch(e){console.error(e);showToast('Suppression impossible. Réessayez.');busy=false;return false}
  }});
}

function openPdfViewer(fileId,returnView='files'){
  currentFileId=fileId;
  if(!state.files.some(f=>f.id===fileId)){showToast('PDF introuvable');return}
  currentPhotoViewer=null;
  try{localStorage.setItem('holioo_last_pdf',fileId)}catch{}
  currentPdfReturnView=returnView;
  navigate('pdfViewer');
}

async function sharePdf(meta,row){
  const file=new File([row.blob],meta.fileName||`${meta.title}.pdf`,{type:'application/pdf'});
  try{if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:meta.title,files:[file]});else downloadPdf(meta,row)}catch(e){if(e?.name!=='AbortError')showToast('Partage impossible')}
}

function downloadPdf(meta,row){const a=document.createElement('a');a.href=URL.createObjectURL(row.blob);a.download=meta.fileName||`${Drive.safeName(meta.title)}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}

async function syncPdfNow(meta,row){
  if(row.driveFileId){showToast('Ce PDF est déjà synchronisé');return}
  if(!driveStatus.connected){showToast('Connectez Google Drive d’abord');navigate('sync');return}
  await runDriveSync('manual');const refreshed=await DB.get('files',meta.id);if(refreshed?.driveFileId){showToast('PDF synchronisé dans Drive');renderPdfViewer()}
}
// iOS shows only the first page of a PDF inside an <iframe>, so every page is
// drawn on its own canvas with pdf.js (loaded on first use, then cached by the SW).
const PDFJS_BASE='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let pdfJsPromise=null;
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  pdfJsPromise??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`${PDFJS_BASE}/pdf.min.js`;s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc=`${PDFJS_BASE}/pdf.worker.min.js`;resolve(window.pdfjsLib)};s.onerror=()=>{pdfJsPromise=null;reject(new Error('pdf.js indisponible'))};document.head.appendChild(s)});
  return pdfJsPromise;
}

// Every page gets a placeholder of the right shape at once (so scroll position and zoom work immediately); its canvas is
// drawn when it nears the screen and redrawn sharper once a zoom settles. Returns a controller:
//   {zoom, setZoom(z), page(), goTo(page, ratio), pageRatio()} — page() = the page most on screen (1-based).
// Options: onCount(n), onPage(page, n) on scroll, zoom / page / ratio = where to start.
const PDF_ZOOM_MIN=.5;   // below 100 % the whole page fits (landscape phone, fullscreen)
async function renderPdfPages(blob,host,{onCount,onPage,zoom=1,page:startPage=1,ratio:startRatio=0}={}){
  const lib=await loadPdfJs();
  const pdf=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  onCount?.(pdf.numPages);
  host.innerHTML='';
  const dpr=Math.min(window.devicePixelRatio||1,2),figs=[],pages=[];
  let z=Math.max(PDF_ZOOM_MIN,Math.min(4,zoom)),baseWidth=Math.max(200,host.clientWidth-2-(parseFloat(getComputedStyle(host).paddingLeft)||0)*2);
  const stage=document.createElement('div');stage.className='pdf-stage';host.append(stage);
  for(let n=1;n<=pdf.numPages;n++){
    if(!host.isConnected)return null;
    const pg=await pdf.getPage(n),vp=pg.getViewport({scale:1});pages.push({pg,aspect:vp.height/vp.width});
    const wrap=document.createElement('figure');wrap.className='pdf-page';wrap.dataset.page=n;
    const box=document.createElement('div');box.className='pdf-page-box';
    const cap=document.createElement('figcaption');cap.textContent=`${n} / ${pdf.numPages}`;
    wrap.append(box,cap);stage.append(wrap);figs.push({wrap,box,drawnAt:0,drawing:false});
  }
  const sizeAll=()=>{const w=baseWidth*z;figs.forEach((f,i)=>{f.box.style.width=`${w}px`;f.box.style.height=`${w*pages[i].aspect}px`});};
  const draw=async i=>{
    const f=figs[i],w=baseWidth*z;if(f.drawing||Math.abs(f.drawnAt-w)<1||!host.isConnected)return;
    f.drawing=true;
    try{
      const vp=pages[i].pg.getViewport({scale:w/pages[i].pg.getViewport({scale:1}).width*dpr});
      const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
      await pages[i].pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      const old=f.box.querySelector(':scope>canvas');old?old.replaceWith(c):f.box.prepend(c);f.drawnAt=w;   // the ink layer (pdf-ink.js) stays on top
    }catch(e){console.warn(e)}
    f.drawing=false;
    if(Math.abs(f.drawnAt-baseWidth*z)>=1&&f.visible)draw(i);
  };
  const io=new IntersectionObserver(es=>{for(const e of es){const i=+e.target.dataset.page-1;figs[i].visible=e.isIntersecting;if(e.isIntersecting)draw(i)}},{root:host,rootMargin:'900px 0px'});
  figs.forEach(f=>io.observe(f.wrap));
  const tops=()=>figs.map(f=>f.wrap.offsetTop);
  const cur=()=>{const mid=host.scrollTop+host.clientHeight*.35,t=tops();let n=0;for(let i=0;i<t.length;i++)if(t[i]<=mid)n=i;return n+1};
  const pageRatio=()=>{const f=figs[cur()-1];return f?Math.max(0,Math.min(1,(host.scrollTop-f.wrap.offsetTop)/Math.max(1,f.wrap.offsetHeight))):0};
  const goTo=(n,r=0)=>{const f=figs[Math.max(1,Math.min(figs.length,n))-1];if(f)host.scrollTop=f.wrap.offsetTop+f.wrap.offsetHeight*r};
  let last=0,t1=null;
  host.addEventListener('scroll',()=>{const n=cur();if(n!==last){last=n;onPage?.(n,pdf.numPages)}clearTimeout(t1);t1=setTimeout(()=>onPage?.(cur(),pdf.numPages,{settled:true}),400)},{passive:true});
  let redraw=null;
  const setZoom=(nz,anchor=.5,anchorY=.5)=>{
    nz=Math.max(PDF_ZOOM_MIN,Math.min(4,nz));if(Math.abs(nz-z)<.001)return;
    const n=cur(),r=pageRatio(),cx=(host.scrollLeft+host.clientWidth*anchor)/Math.max(1,host.scrollWidth);
    const cy=(host.scrollTop+host.clientHeight*anchorY)/Math.max(1,host.scrollHeight);
    z=nz;sizeAll();host.scrollTop=cy*host.scrollHeight-host.clientHeight*anchorY;host.scrollLeft=cx*host.scrollWidth-host.clientWidth*anchor;
    clearTimeout(redraw);redraw=setTimeout(()=>figs.forEach((f,i)=>f.visible&&draw(i)),180);
    onPage?.(cur(),pdf.numPages,{zoom:z});
  };
  const resize=()=>{const w=Math.max(200,host.clientWidth-2-(parseFloat(getComputedStyle(host).paddingLeft)||0)*2);if(Math.abs(w-baseWidth)<2)return;const n=cur(),r=pageRatio();baseWidth=w;sizeAll();goTo(n,r);clearTimeout(redraw);redraw=setTimeout(()=>figs.forEach((f,i)=>f.visible&&draw(i)),180)};
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(!host.isConnected){ro.disconnect();io.disconnect();return}resize()}):null;ro?.observe(host);
  // Live zoom: pinch with two fingers, ctrl + wheel / trackpad pinch.
  let pd=0,pz=1;
  // While two fingers are down the viewer alone moves the page: native scrolling is switched off (a scroll that had already
  // started cannot be cancelled by preventDefault, so zoom and scroll fought and the page jumped) and the pinch's centre
  // both anchors the zoom and pans the page. The ink layer (pdf-ink.js) no longer scrolls on its own.
  let pm=null;
  const pinchEnd=()=>{pd=0;pm=null;host.style.overflow='';delete host.dataset.pinching};
  const mid=e=>({x:(e.touches[0].clientX+e.touches[1].clientX)/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2});
  host.addEventListener('touchstart',e=>{if(e.touches.length===2){pd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)||1;pz=z;pm=mid(e);host.style.overflow='hidden';host.dataset.pinching='1'}},{passive:true});
  host.addEventListener('touchmove',e=>{
    if(e.touches.length!==2||!pd)return;
    if(e.cancelable)e.preventDefault();
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),c=mid(e),r=host.getBoundingClientRect();
    setZoom(pz*d/pd,(c.x-r.left)/host.clientWidth,(c.y-r.top)/host.clientHeight);
    if(pm){host.scrollLeft-=c.x-pm.x;host.scrollTop-=c.y-pm.y}
    pm=c;
  },{passive:false});
  host.addEventListener('touchend',e=>{if(e.touches.length<2)pinchEnd()},{passive:true});
  host.addEventListener('touchcancel',pinchEnd,{passive:true});
  host.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();{const r=host.getBoundingClientRect();setZoom(z*Math.exp(-e.deltaY*.01),(e.clientX-r.left)/host.clientWidth,(e.clientY-r.top)/host.clientHeight)}},{passive:false});
  sizeAll();
  await new Promise(r=>requestAnimationFrame(r));
  goTo(startPage,startRatio);last=cur();onPage?.(last,pdf.numPages);
  return{get zoom(){return z},setZoom,page:cur,pageRatio,goTo,count:pdf.numPages,boxes:figs.map(f=>f.box),aspects:pages.map(p=>p.aspect)};
}
