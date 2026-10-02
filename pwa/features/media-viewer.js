'use strict';

let currentPhotoViewer=null;

let currentFileId=null;

let viewerObjectUrl=null;

let currentPdfReturnView='files';

function revokeViewerUrl(){
  if(viewerObjectUrl){try{URL.revokeObjectURL(viewerObjectUrl)}catch{}viewerObjectUrl=null}
}

function photoStatusLabel(row){
  if(row?.driveNeedsUpdate)return{label:navigator.onLine?'À SYNC':'LOCAL',cls:navigator.onLine?'orange':'gray'};
  if(row?.driveFileId)return{label:'DRIVE',cls:'green'};
  if(row?.syncState==='drive_full')return{label:'DRIVE PLEIN',cls:'coral'};
  if(row?.syncState==='error')return{label:'ERREUR',cls:'coral'};
  if(row?.syncState==='synced')return{label:'SYNC',cls:'green'};
  if(row?.syncState==='pending')return{label:navigator.onLine?'À SYNC':'LOCAL',cls:navigator.onLine?'orange':'gray'};
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
  await DB.del('files',id);state.files=state.files.filter(f=>f.id!==id);saveState();queueSync();
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

async function renderPdfPages(blob,host,{onCount}={}){
  const lib=await loadPdfJs();
  const pdf=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  onCount?.(pdf.numPages);
  host.innerHTML='';
  const dpr=Math.min(window.devicePixelRatio||1,2);
  for(let n=1;n<=pdf.numPages;n++){
    if(!host.isConnected)return;
    const page=await pdf.getPage(n),base=page.getViewport({scale:1});
    const cssWidth=Math.max(200,host.clientWidth-2),viewport=page.getViewport({scale:cssWidth/base.width*dpr});
    const wrap=document.createElement('figure');wrap.className='pdf-page';
    const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=`${cssWidth}px`;
    wrap.append(canvas);const cap=document.createElement('figcaption');cap.textContent=`${n} / ${pdf.numPages}`;wrap.append(cap);host.append(wrap);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  }
}
