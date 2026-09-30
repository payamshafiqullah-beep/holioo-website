'use strict';

let cameraUsesHardwareZoom=false;
let cameraZoomMin=1;
let cameraZoomMax=4;
let camDest=null;        // where the next photo goes: {courseId, sectionId, sessionId|null, source}
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

function initCameraDestination(){
  camDest=resolveCameraDestination({courses:state.courses,timetable:state.timetable,last:state.cameraLast});
  camShots=[];
  setCameraThumb(null);
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
  const label=cameraDestinationLabel(camDest);
  text.textContent=label;
  btn.classList.toggle('empty',!ok);
  btn.classList.toggle('auto',ok&&camDest.source==='timetable');
  const dot=btn.querySelector('.cam-dest-dot');
  if(dot)dot.style.background=ok?(cameraDestContext().course.color||'#5B67F1'):'';
  btn.setAttribute('aria-label',ok?camT('destLabel',{dest:label})+(camDest.source==='timetable'?` (${camT('auto')})`:''):camT('chooseDest'));
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

// ─── Last photo + counter ─────────────────────────────────────

function updateCaptureCount(){
  const n=camShots.length;
  const count=byId('captureCount'),btn=byId('lastPhotoBtn');
  if(count){count.textContent=String(n);count.classList.toggle('hidden',!n)}
  if(btn){btn.disabled=!n;btn.classList.toggle('has-photo',!!n);btn.setAttribute('aria-label',camT('lastPhoto',{n}))}
}

function setCameraThumb(blob){
  const box=byId('camLastImg');
  if(camThumbUrl){URL.revokeObjectURL(camThumbUrl);camThumbUrl=''}
  if(!box)return;
  if(!blob){box.innerHTML=icon('image',{size:24});return}
  camThumbUrl=URL.createObjectURL(blob);
  box.innerHTML=`<img src="${camThumbUrl}" alt="">`;
  const btn=byId('lastPhotoBtn');
  btn?.classList.remove('pop');void btn?.offsetWidth;btn?.classList.add('pop');
}

function openCaptureReview(){
  const ctx=camDest?.sessionId&&findSessionContext(camDest.sessionId);
  const ids=ctx?.session.photoIds||[];
  if(!ids.length){if(cameraQueue.pending())showToast(camT('pending',{n:cameraQueue.pending()}));return}
  openPhotoViewer(ids,ids.length-1,{title:ctx.session.title,source:'session',sourceId:ctx.session.id,editable:false,returnView:'capture',courseId:ctx.course.id,sectionId:ctx.section.id,sessionId:ctx.session.id});
}

// ─── Background save status ───────────────────────────────────

function renderCameraSaveState(s){
  const el=byId('camSaveState');
  if(el){
    const show=s.failing||s.pending>3;
    el.classList.toggle('hidden',!show);
    el.classList.toggle('warn',!!s.failing);
    el.textContent=s.storageFull?camT('storageFull'):s.failing?camT('retrying'):camT('pending',{n:s.pending});
  }
  const shot=byId('lastPhotoBtn');
  shot?.classList.toggle('saving',s.pending>0);
}
cameraQueue.subscribe(s=>{
  if(currentView==='capture')renderCameraSaveState(s);
  // Photos taken just before leaving the camera reach Drive once they are stored.
  else if(!s.pending){queueSync();if(currentView==='session')render()}
});

async function checkCameraStorage(){
  const el=byId('camStorage');if(!el)return;
  try{
    navigator.storage?.persist?.().catch(()=>{});
    const est=await navigator.storage?.estimate?.();
    const free=est&&est.quota?est.quota-est.usage:Infinity;
    const low=free<150*1024*1024;
    el.textContent=camT('storageLow');
    el.classList.toggle('hidden',!low);
  }catch{el.classList.add('hidden')}
}

// ─── Camera start / stop, permissions, lifecycle ──────────────

async function cameraPermissionState(){
  try{return(await navigator.permissions.query({name:'camera'})).state}catch{return'unknown'}
}

function hideCameraPanel(){byId('camPanel')?.classList.add('hidden')}

function showCameraPanel(kind){
  const panel=byId('camPanel');if(!panel)return;
  const how=`<ul class="cam-panel-how"><li>${esc(camT('permHowIos'))}</li><li>${esc(camT('permHowAndroid'))}</li><li>${esc(camT('permHowApp'))}</li></ul>`;
  const texts={
    ask:{title:camT('permTitle'),body:camT('permAsk'),btn:camT('permAllow')},
    denied:{title:camT('permTitle'),body:camT('permDenied'),btn:camT('retry'),how},
    blocked:{title:camT('permTitle'),body:camT('permBlocked'),btn:camT('retry'),how},
    nocamera:{title:camT('camError'),body:camT('noCamera'),btn:camT('retry')},
    busy:{title:camT('camError'),body:camT('camBusy'),btn:camT('retry')},
    insecure:{title:camT('camError'),body:camT('insecure')},
    error:{title:camT('camError'),body:camT('camError'),btn:camT('retry')}
  }[kind]||{};
  panel.innerHTML=`<div class="cam-panel-card">
    <span class="cam-panel-icon">${icon('camera',{size:26})}</span>
    <h2>${esc(texts.title)}</h2>
    <p>${esc(texts.body)}</p>
    ${texts.how||''}
    ${texts.btn?`<button class="cam-btn primary" id="camPanelBtn">${esc(texts.btn)}</button>`:''}
  </div>`;
  panel.classList.remove('hidden');
  const b=byId('camPanelBtn');
  if(b)b.onclick=()=>{try{localStorage.setItem('holioo_cam_asked','1')}catch{}startCamera({userAction:true})};
  setCameraStatus(texts.body||'');
}

// Restart automatically when the user allows the camera in the browser settings.
let camPermWatch=null;
async function watchCameraPermission(){
  if(camPermWatch)return;
  try{
    camPermWatch=await navigator.permissions.query({name:'camera'});
    camPermWatch.onchange=()=>{if(camPermWatch.state==='granted'&&currentView==='capture'&&!cameraStream)startCamera()};
  }catch{}
}

async function startCamera({userAction=false}={}){
  stopCamera();
  const video=byId('cameraVideo');
  if(!video)return;
  const token=++camStartToken;
  hideCameraPanel();

  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){showCameraPanel('insecure');return}

  setCameraStatus(camT('opening'));
  const perm=await cameraPermissionState();
  if(token!==camStartToken)return;
  if(perm==='denied'){showCameraPanel('blocked');watchCameraPermission();return}
  let asked=false;try{asked=localStorage.getItem('holioo_cam_asked')==='1'}catch{}
  // First time ever: explain why before the browser asks.
  if(perm==='prompt'&&!asked&&!userAction){showCameraPanel('ask');return}

  let stream=null;
  try{
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing},width:{ideal:1920},height:{ideal:1080}},audio:false});
    }catch(e){
      if(e?.name!=='OverconstrainedError'&&e?.name!=='NotFoundError')throw e;
      stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    }
  }catch(e){
    if(token!==camStartToken)return;
    try{localStorage.setItem('holioo_cam_asked','1')}catch{}
    const name=e?.name||'';
    console.warn('Camera start failed:',name);
    if(name==='NotAllowedError'||name==='SecurityError'){
      showCameraPanel((await cameraPermissionState())==='denied'?'blocked':'denied');
      watchCameraPermission();
    }else if(name==='NotFoundError'||name==='OverconstrainedError')showCameraPanel('nocamera');
    else if(name==='NotReadableError'||name==='AbortError')showCameraPanel('busy');
    else showCameraPanel('error');
    return;
  }
  try{localStorage.setItem('holioo_cam_asked','1')}catch{}

  // The user left the camera, or another start began, while the browser was opening it.
  if(token!==camStartToken||currentView!=='capture'||byId('cameraVideo')!==video){stream.getTracks().forEach(t=>t.stop());return}

  cameraStream=stream;
  video.srcObject=stream;
  await video.play().catch(()=>{});
  cameraTrack=stream.getVideoTracks()[0];
  // Another app took the camera, or the permission was revoked.
  cameraTrack.addEventListener('ended',()=>{if(cameraTrack&&currentView==='capture'&&!document.hidden)showCameraPanel('busy')});

  const caps=cameraTrack.getCapabilities?.()||{};
  const zoomCaps=caps.zoom;
  cameraUsesHardwareZoom=!!zoomCaps;
  cameraZoomMin=zoomCaps?.min??1;
  cameraZoomMax=zoomCaps?.max??4;
  if(cameraZoomMax<=cameraZoomMin)cameraZoomMax=Math.max(4,cameraZoomMin);

  const slider=byId('zoomRange');
  if(slider){
    slider.min=String(cameraZoomMin);
    slider.max=String(cameraZoomMax);
    slider.step=String(zoomCaps?.step||0.1);
  }

  zoomValue=clamp(1,cameraZoomMin,cameraZoomMax);
  await setCameraZoom(zoomValue,{silent:true});

  // Flash is always off when the camera opens; it is never remembered.
  const torch=byId('torchBtn');
  if(torch){
    torch.disabled=!caps.torch;
    torch.classList.toggle('unavailable',!caps.torch);
    torch.classList.remove('active');
    torch.setAttribute('aria-pressed','false');
    torch.setAttribute('aria-label',caps.torch?camT('flashOff'):camT('flashNone'));
  }

  document.querySelectorAll('[data-zoom]').forEach(btn=>{
    const z=Number(btn.dataset.zoom);
    btn.disabled=z<cameraZoomMin||z>cameraZoomMax;
  });

  setCameraStatus(camT('ready'));
}

function stopCamera(){
  cameraStream?.getTracks?.().forEach(t=>t.stop());
  cameraStream=null;
  cameraTrack=null;
  torchOn=false;
  cameraUsesHardwareZoom=false;
  const video=byId('cameraVideo');
  if(video)video.srcObject=null;
}

// Release the camera when the app goes to the background, reopen it when it comes back.
function setupCameraLifecycle(){
  if(camLifecycleReady)return;
  camLifecycleReady=true;
  document.addEventListener('visibilitychange',()=>{
    if(currentView!=='capture')return;
    if(document.hidden){camStartToken++;stopCamera()}
    else if(!cameraStream&&byId('camPanel')?.classList.contains('hidden'))startCamera();
  });
  window.addEventListener('pagehide',()=>{if(currentView==='capture'){camStartToken++;stopCamera()}});
}

async function setCameraZoom(value,{silent=false}={}){
  const video=byId('cameraVideo');
  const target=clamp(Number(value)||1,cameraZoomMin,cameraZoomMax);
  zoomValue=target;

  try{
    if(cameraTrack&&cameraUsesHardwareZoom){
      await cameraTrack.applyConstraints({advanced:[{zoom:target}]});
      if(video)video.style.transform='scale(1)';
    }else if(video){
      video.style.transform=`scale(${target})`;
    }
  }catch(e){
    console.warn('Zoom constraint failed');
    cameraUsesHardwareZoom=false;
    if(video)video.style.transform=`scale(${target})`;
  }

  const slider=byId('zoomRange');
  if(slider)slider.value=String(target);
  const pinch=byId('pinchZoomLabel');
  const text=`${target.toFixed(1)}×`;
  if(pinch)pinch.textContent=text;

  document.querySelectorAll('[data-zoom]').forEach(btn=>{
    btn.classList.toggle('active',Math.abs(Number(btn.dataset.zoom)-target)<0.15);
  });

  if(!silent&&pinch){
    pinch.classList.add('show');
    clearTimeout(setCameraZoom.t);
    setCameraZoom.t=setTimeout(()=>pinch.classList.remove('show'),700);
  }
}

function setupPinchZoom(){
  const stage=byId('cameraStage');
  if(!stage||stage.dataset.pinchReady==='1')return;
  stage.dataset.pinchReady='1';

  let startDistance=0;
  let startZoom=1;

  const distance=touches=>Math.hypot(
    touches[0].clientX-touches[1].clientX,
    touches[0].clientY-touches[1].clientY
  );

  stage.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      startDistance=distance(e.touches);
      startZoom=zoomValue||1;
    }
  },{passive:true});

  stage.addEventListener('touchmove',e=>{
    if(e.touches.length!==2||!startDistance)return;
    e.preventDefault();
    const ratio=distance(e.touches)/startDistance;
    setCameraZoom(startZoom*ratio);
  },{passive:false});

  stage.addEventListener('touchend',e=>{
    if(e.touches.length<2)startDistance=0;
  },{passive:true});
}

async function toggleTorch(){
  if(!cameraTrack)return;
  const caps=cameraTrack.getCapabilities?.()||{};
  if(!caps.torch){
    showToast(camT('flashNone'));
    return;
  }

  torchOn=!torchOn;
  const btn=byId('torchBtn');
  try{
    await cameraTrack.applyConstraints({advanced:[{torch:torchOn}]});
  }catch(e){
    torchOn=false;
    showToast(camT('flashError'));
  }
  btn?.classList.toggle('active',torchOn);
  btn?.setAttribute('aria-pressed',String(torchOn));
  btn?.setAttribute('aria-label',torchOn?camT('flashOn'):camT('flashOff'));
}

// ─── Capture ──────────────────────────────────────────────────
// The shutter never waits: the frame is copied synchronously, then encoding and saving
// run in cameraQueue (features/camera-queue.js) while the next photo can already be taken.

function capturePhoto(){
  if(!cameraDestContext()){openDestinationPicker(camT('chooseFirst'));return}
  const video=byId('cameraVideo');
  if(!cameraStream||!video?.videoWidth){
    showToast(camT('notReady'));
    return;
  }

  const digitalZoom=cameraUsesHardwareZoom?1:Math.max(1,zoomValue||1);
  const sw=video.videoWidth/digitalZoom;
  const sh=video.videoHeight/digitalZoom;
  const sx=(video.videoWidth-sw)/2;
  const sy=(video.videoHeight-sh)/2;
  const maxW=2000;
  const outScale=Math.min(1,maxW/sw);

  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sw*outScale));
  canvas.height=Math.max(1,Math.round(sh*outScale));
  canvas.getContext('2d',{alpha:false}).drawImage(
    video,sx,sy,sw,sh,0,0,canvas.width,canvas.height
  );

  const dest=destinationForShot();
  if(!dest)return;
  const id=uid();
  const blob=new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
  cameraQueue.add({id,blob,dest,createdAt:now()});
  camShots.push(id);
  const shotDest=camDest;
  blob.then(b=>{if(b&&camShots.at(-1)===id&&camDest===shotDest)setCameraThumb(b)});

  const stage=byId('cameraStage');
  stage?.classList.remove('capture-flash');void stage?.offsetWidth;
  stage?.classList.add('capture-flash');
  setTimeout(()=>stage?.classList.remove('capture-flash'),120);

  updateCaptureCount();
  navigator.vibrate?.(18);
}

// Photos from the gallery go to the current destination too, in the order they were picked.
async function importGallery(e){
  const files=[...(e.target.files||[])].filter(f=>f.type.startsWith('image/'));
  e.target.value='';
  if(!files.length)return;
  const dest=destinationForShot();
  if(!dest){openDestinationPicker(camT('chooseFirst'));return}
  for(const file of files){
    const id=uid();
    cameraQueue.add({id,blob:Promise.resolve(file),dest,createdAt:now()});
    camShots.push(id);
  }
  setCameraThumb(files.at(-1));
  updateCaptureCount();
  showToast(camT('imported',{n:files.length,dest:cameraDestinationLabel(camDest)}));
}

function leaveCamera(){
  camStartToken++;
  stopCamera();
  closeCameraPicker();
  setCameraThumb(null);
  queueSync();
}

function closeCaptureScreen(){
  leaveCamera();
  navigate('home');
}

// Photos are already filed: "Terminé" opens the session they went to.
function finishCapture(){
  const ctx=camShots.length&&camDest?.sessionId&&findSessionContext(camDest.sessionId);
  if(ctx)showToast(camT('savedTo',{dest:cameraDestinationLabel(camDest)}));
  leaveCamera();
  if(ctx)navigate('session',{courseId:ctx.course.id,sectionId:ctx.section.id,sessionId:ctx.session.id});
  else navigate('home');
}

async function fillThumbs(containerId,ids,{selectable=false,split=false,viewerTitle='Galerie',reorder=false}={}){
  const box=document.getElementById(containerId);if(!box)return;box.innerHTML='';
  for(let i=0;i<ids.length;i++){
    const id=ids[i],row=await DB.get('photos',id);if(!row?.blob)continue;
    const url=URL.createObjectURL(row.blob),selected=currentBatch?.selected?.has(id),status=photoStatusLabel(row),b=document.createElement('button');
    b.className=`thumb ${selectable&&selected?'selected':''} ${split?(selected?'group-a':'group-b'):''}`;b.dataset.photoId=id;
    b.innerHTML=`<img src="${url}" alt="Photo ${i+1}" draggable="false"><span class="num">${i+1}</span>${!selectable?`<span class="thumb-status badge ${status.cls}">${status.label}</span>`:''}${selectable&&!split?`<span class="check">${selected?'✓':''}</span>`:''}${split?`<span class="group-tag">${selected?'LOT 1':'LOT 2'}</span>`:''}`;
    if(selectable)b.onclick=()=>{selected?currentBatch.selected.delete(id):currentBatch.selected.add(id);render()};
    else b.onclick=()=>openPhotoViewer(ids,Math.max(0,ids.indexOf(id)),{title:viewerTitle,source:'batch',sourceId:currentBatch?.id||null,editable:false,returnView:currentView,courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
    box.appendChild(b);
  }
  // `ids` is the batch's own array: reorder it in place so everything that uses the batch follows.
  if(reorder)makeReorderable(box,{onChange:order=>{const rest=ids.filter(x=>!order.includes(x));ids.splice(0,ids.length,...order,...rest);showToast('Ordre enregistré')}});
}

function saveBatchToInbox(batch){
  state.inbox.unshift({id:batch.id,title:`Capture ${fmtShort(batch.createdAt)}`,photoIds:[...batch.photoIds],createdAt:batch.createdAt});
  saveState();currentBatch=null;showToast('Lot gardé dans Captures');queueSync();navigate('home');
}

function assignCurrentBatch(customTitle){
  const c=getCourse(),s=getSection(c);if(!c||!s)return;
  const num=(s.sessions.at(-1)?.number||0)+1;
  const q={id:uid(),number:num,title:customTitle.trim()||`${s.name} ${num}`,photoIds:[...currentBatch.photoIds],createdAt:now(),visibility:'private'};
  s.sessions.push(q);currentSessionId=q.id;
  const nextBatch=currentBatch.splitQueue?.shift()||null;
  saveState();queueSync();
  if(nextBatch){
    currentBatch=nextBatch;currentCourseId=null;currentSectionId=null;
    showToast('Lot 1 enregistré. Organisez maintenant le lot suivant.');
    navigate('organize');
  }else{
    currentBatch=null;navigate('session');
  }
}
