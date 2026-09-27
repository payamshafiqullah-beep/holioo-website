'use strict';

let currentPhotoViewer=null;

let currentFileId=null;

let viewerObjectUrl=null;

let currentPdfReturnView='files';

function revokeViewerUrl(){
  if(viewerObjectUrl){try{URL.revokeObjectURL(viewerObjectUrl)}catch{}viewerObjectUrl=null}
}

function photoStatusLabel(row){
  if(row?.driveFileId)return{label:'DRIVE',cls:'green'};
  if(row?.syncState==='drive_full')return{label:'DRIVE PLEIN',cls:'coral'};
  if(row?.syncState==='error')return{label:'ERREUR',cls:'coral'};
  if(row?.syncState==='synced')return{label:'SYNC',cls:'green'};
  if(row?.syncState==='pending')return{label:navigator.onLine?'À SYNC':'LOCAL',cls:navigator.onLine?'orange':'gray'};
  return{label:'LOCAL',cls:'gray'};
}

function openPhotoViewer(ids,startIndex=0,options={}

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

function viewerDeleteCurrent(){
  const v=currentPhotoViewer;if(!v||v.source!=='session')return;
  const ctx=findSessionContext(v.sessionId);if(!ctx)return;const photoId=v.ids[v.index];
  openSheet({title:'Supprimer cette photo ?',subtitle:'Elle sera retirée de Holioo sur cet appareil.',confirmText:'Supprimer',confirmClass:'coral',onConfirm:async()=>{ctx.session.photoIds=ctx.session.photoIds.filter(x=>x!==photoId);await DB.del('photos',photoId);saveState();v.ids=v.ids.filter(x=>x!==photoId);if(!v.ids.length){showToast('Photo supprimée');navigate('session')}else{v.index=Math.min(v.index,v.ids.length-1);renderPhotoViewer();showToast('Photo supprimée')}return true}})
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