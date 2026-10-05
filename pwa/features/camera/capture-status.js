'use strict';
// Camera, status: last photo and counter, the review entry, the save queue state and the storage check.
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

// The counter opens the review of this capture's pages (reorder, retake, crop, filters…).
function openCaptureReview(){
  if(!camShots.length)return;
  // The review works on a séance's pages; photos without a destination wait in Captures: show them there (once saved), no destination asked.
  if(!cameraDestContext()){
    leaveCamera();camShots=[];
    navigate('inbox');
    // Photos still being saved appear in Captures as soon as they are stored.
    if(cameraQueue.pending()){const off=cameraQueue.subscribe(st=>{if(!st.pending){off();if(currentView==='inbox')render()}})}
    return;
  }
  camKeepBatch=true;
  navigate('scanReview');
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
