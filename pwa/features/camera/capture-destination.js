'use strict';

let cameraUsesHardwareZoom=false;
let cameraZoomMin=1;
let cameraZoomMax=4;
let camDest=null;        // where the next photo goes: {courseId, sectionId, sessionId|null, source}
let camEntryDestination=null; // explicit origin, consumed once when opening the camera
let camReturnView=null;       // tablet / computer: the Galerie or Notes the camera was opened from, shown again when it is left
let camBatchId=null;     // plain camera: the Captures entry this visit's photos go to (a new one each visit)
let camShots=[];         // photos taken in this camera visit for the current destination (badge counter)
let camThumbUrl='';
let camStartToken=0;
let camLifecycleReady=false;

function clamp(v,min,max){return Math.min(max,Math.max(min,v))}

function setCameraStatus(text){
  const el=byId('cameraStatus');
  if(el)el.textContent=text;
}

// ─── Destination ──────────────────────────────────────────────
// Counter rule: it counts the photos of this camera visit for the current destination.
// It resets when the camera screen is left or when the destination changes.

function prepareCameraEntry(fromView,dest=null){
  camEntryDestination=null;
  camReturnView=fromView==='gallery'||fromView==='notes'?fromView:null;
  // Quick Capture (Accueil) names the destination itself.
  if(dest?.courseId&&dest.sectionId){
    camKeepBatch=false;
    camEntryDestination={courseId:dest.courseId,sectionId:dest.sectionId,sessionId:dest.sessionId||null,source:dest.source||'manual'};
    return;
  }
  if(fromView==='scanReview'||fromView==='photoViewer')return;
  camKeepBatch=false;
  // Galerie / Notes (tablet, computer): the photos go where the screen is (course and filter, or the notes' séance).
  if(camReturnView&&typeof deskCameraDestination==='function'){const d=deskCameraDestination(camReturnView);if(d)camEntryDestination={courseId:d.courseId,sectionId:d.sectionId,sessionId:d.sessionId||null,source:'manual'};return}
  if(fromView!=='session'&&fromView!=='section')return;
  const course=state.courses.find(c=>c.id===currentCourseId);
  const section=course?.sections.find(s=>s.id===currentSectionId);
  const session=fromView==='session'&&section?.sessions.find(s=>s.id===currentSessionId);
  if(section&&(fromView==='section'||session)){
    camEntryDestination={courseId:course.id,sectionId:section.id,sessionId:session?.id||null,source:'manual'};
  }
}

function initCameraDestination(){
  const entry=camEntryDestination;camEntryDestination=null;
  const keep=!entry&&camKeepBatch&&camDest;camKeepBatch=false;
  if(!keep){
    // The plain camera guesses nothing: without a destination named by the caller, photos wait in Captures until the user files them.
    camDest=entry||null;
    camShots=[];camRetakeId=null;camBatchId=uid();
    setCameraThumb(null);
    if(entry)rememberCameraDestination();
  }else{
    // Back from the review: same pages, same counter, last page shown.
    const last=camShots.at(-1);if(last)DB.get('photos',last).then(r=>{if(r)setCameraThumb(r.thumb||r.blob)});else setCameraThumb(null);
  }
  renderCameraChip();
}

function cameraDestContext(d=camDest){
  const course=d&&state.courses.find(c=>c.id===d.courseId);
  const section=course?.sections.find(s=>s.id===d.sectionId);
  return course&&section?{course,section}:null;
}

function renderCameraChip(){
  const btn=byId('camDest'),text=byId('camDestText');if(!btn||!text)return;
  const ok=!!cameraDestContext();
  if(!ok)camDest=null;
  const label=cameraDestinationLabel(camDest),parts=ok&&cameraDestinationParts(camDest),sub=byId('camDestSub');
  const key=ok?`${camDest.courseId}/${camDest.sectionId}/${camDest.sessionId||''}`:'';
  // Two lines: the course, then section and session (a short pulse on the badge when it changed).
  text.textContent=ok?parts.course:camT('chooseDest');
  if(sub)sub.textContent=ok?parts.detail:camT('chooseDestHint');
  btn.classList.toggle('empty',!ok);
  btn.classList.toggle('auto',ok&&camDest.source==='timetable');
  btn.style.setProperty('--c',ok?parts.color:'');
  btn.style.setProperty('--on',ok?radialInk(parts.color):'');
  if(btn.dataset.dest!==undefined&&btn.dataset.dest!==key&&ok){btn.classList.remove('changed');void btn.offsetWidth;btn.classList.add('changed')}
  btn.dataset.dest=key;
  btn.setAttribute('aria-label',ok?camT('destLabel',{dest:label})+(camDest.source==='timetable'?` (${camT('destAutoBadge')})`:''):camT('chooseDest'));
}

function rememberCameraDestination(){
  if(!camDest)return;
  state.cameraLast={courseId:camDest.courseId,sectionId:camDest.sectionId,sessionId:camDest.sessionId||null};
  state.cameraRecent=pushRecentDestination(state.cameraRecent,camDest);
  saveState();
}

function setCameraDestination(d,source='manual'){
  const same=camDest&&camDest.courseId===d.courseId&&camDest.sectionId===d.sectionId&&(camDest.sessionId||null)===(d.sessionId||null);
  camDest={courseId:d.courseId,sectionId:d.sectionId,sessionId:d.sessionId||null,source};
  if(!same){camShots=[];setCameraThumb(null);updateCaptureCount()}
  rememberCameraDestination();
  renderCameraChip();
}

function openDestinationPicker(message=''){
  openCameraPicker({current:camDest,message,onPick:d=>setCameraDestination(d)});
}

// The destination of the next photo, with its session created now if it is a new one,
// so that every photo taken right after goes to that same session.
function destinationForShot(){
  const ctx=cameraDestContext();if(!ctx)return null;
  let session=camDest.sessionId&&ctx.section.sessions.find(s=>s.id===camDest.sessionId);
  if(!session){
    const num=nextSessionNumber(ctx.section);
    session={id:uid(),number:num,title:`${ctx.section.name} ${num}`,photoIds:[],createdAt:now(),visibility:'private'};
    ctx.section.sessions.push(session);
    camDest.sessionId=session.id;
    rememberCameraDestination();
    renderCameraChip();
  }
  return{courseId:ctx.course.id,sectionId:ctx.section.id,sessionId:session.id};
}

// Photos from the phone's own camera app (Quick Capture when the live camera is unavailable):
// filed like camera photos, in the same place and through the same save queue.
function importToDestination(files,dest){
  camDest={courseId:dest.courseId,sectionId:dest.sectionId,sessionId:dest.sessionId||null,source:dest.source||'manual'};
  camShots=[];
  const d=destinationForShot();if(!d||!files.length)return;
  rememberCameraDestination();
  for(const file of files)cameraQueue.add({id:uid(),blob:Promise.resolve(file),dest:d,createdAt:now(),onStored:()=>queueSync()});
  showToast(camT('imported',{n:files.length,dest:cameraDestinationLabel(camDest)}));
}
