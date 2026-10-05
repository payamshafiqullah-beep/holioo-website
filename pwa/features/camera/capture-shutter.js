'use strict';
// Camera, shutter: taking and importing photos, leaving the camera, finishing a capture.
// ─── Capture ──────────────────────────────────────────────────
// The shutter never waits: the frame is copied synchronously, then encoding and saving
// run in cameraQueue (features/camera/camera-queue.js) while the next photo can already be taken.

function capturePhoto({auto=false}={}){
  // The shutter is always there: in QR mode (codes are read by themselves) it switches back to Photo and shoots.
  if(camMode==='qr'){if(auto)return;applyCameraMode('photo')}
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
  // Scans keep the full video resolution; plain photos stay light.
  const maxW=isScanMode(camMode)?4096:2000;
  const outScale=Math.min(1,maxW/Math.max(sw,sh));

  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sw*outScale));
  canvas.height=Math.max(1,Math.round(sh*outScale));
  canvas.getContext('2d',{alpha:false}).drawImage(
    video,sx,sy,sw,sh,0,0,canvas.width,canvas.height
  );

  const dest=cameraDestContext()?destinationForShot():{batchId:camBatchId||(camBatchId=uid())};   // no destination: the photo waits in this visit's Captures entry
  if(isScanMode(camMode)||camRetakeId){
    const ids=isScanMode(camMode)?queueScanCapture(canvas,dest):(()=>{const id=camRetakeId;camRetakeId=null;const b=new Promise(r=>canvas.toBlob(r,'image/jpeg',.92));cameraQueue.add({id,blob:b,thumb:canvasToJpeg(scaleCanvas(canvas,canvas.width,canvas.height)),dest,createdAt:now(),replace:true,onStored:()=>{showToast(camT('retaken'));if(currentView==='capture'){camKeepBatch=true;navigate('scanReview')}}});return[]})();
    camShots.push(...ids);
    if(ids.length)canvasToJpeg(scaleCanvas(canvas,canvas.width,canvas.height)).then(b=>{if(b&&camShots.at(-1)===ids.at(-1))setCameraThumb(b)});
    captureFeedback(auto);
    return;
  }
  const id=uid();
  const blob=new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
  // The grid preview is made now from the same frame (a few ms), so grids never decode the full photo.
  const thumb=canvasToJpeg(scaleCanvas(canvas,canvas.width,canvas.height));
  cameraQueue.add({id,blob,thumb,dest,createdAt:now()});
  camShots.push(id);
  const shotDest=camDest;
  thumb.then(b=>{if(b&&camShots.at(-1)===id&&camDest===shotDest)setCameraThumb(b)});

  captureFeedback(false);
}

function captureFeedback(auto){
  if(isScanMode(camMode))Scanner.snap();
  const stage=byId('cameraStage');
  stage?.classList.remove('capture-flash');void stage?.offsetWidth;
  stage?.classList.add('capture-flash');
  setTimeout(()=>stage?.classList.remove("capture-flash"),300);
  updateCaptureCount();
  navigator.vibrate?.(auto?[12,40,12]:18);
}

// Photos from the gallery go to the current destination too, in the order they were picked.
async function importGallery(e){
  const picked=[...(e.target.files||[])];
  e.target.value='';
  const isPdf=f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name),pdfs=picked.filter(isPdf),files=picked.filter(f=>f.type.startsWith('image/'));
  if(!files.length&&!pdfs.length){if(picked.length)showToast('Format non pris en charge — images ou PDF');return}
  const dest=cameraDestContext()?destinationForShot():{batchId:camBatchId||(camBatchId=uid())};
  if(!dest.sessionId&&pdfs.length){openDestinationPicker(camT('chooseFirst'));return}
  // PDFs are filed in the destination's séance (Fichiers, Lecture rapide, the course), not through the photo queue.
  if(pdfs.length){
    for(const f of pdfs)await storeImportedPdf(f,{courseId:dest.courseId,sessionIds:[dest.sessionId]});
    saveState();queueSync();
    showToast(`${plural(pdfs.length,'PDF ajouté','PDF ajoutés')} à ${cameraDestinationLabel(camDest)}`);
    if(!files.length)return;
  }
  if(isScanMode(camMode)){
    camShots.push(...await importScanFiles(files,dest));
  }else for(const file of files){
    const id=uid();
    cameraQueue.add({id,blob:Promise.resolve(file),dest,createdAt:now()});
    camShots.push(id);
  }
  setCameraThumb(files.at(-1));
  updateCaptureCount();
  showToast(dest.sessionId?camT('imported',{n:files.length,dest:cameraDestinationLabel(camDest)}):'Photos gardées dans Captures');
}

function leaveCamera(){
  camStartToken++;
  Scanner.stop();camIdFront=null;
  stopCamera();
  closeCameraPicker();
  setCameraThumb(null);
  queueSync();
}

// Tablet / computer: back to the Galerie or the Notes the camera was opened from.
function cameraReturn(ctx){
  const view=camReturnView;camReturnView=null;
  if(!view||typeof isDesk!=='function'||!isDesk())return false;
  if(view==='gallery')navigate('gallery',ctx?{courseId:ctx.course.id}:{});
  else navigate('notes',ctx?{courseId:ctx.course.id,sectionId:ctx.section.id,sessionId:ctx.session?.id}:{});
  return true;
}
function closeCaptureScreen(){
  leaveCamera();
  const dest=camDest?cameraDestContext(camDest):null;
  if(cameraReturn(dest?{course:dest.course,section:dest.section,session:null}:null))return;
  navigate('home');
}

// Photos are already filed: "Terminé" opens the session they went to.
function finishCapture(){
  const ctx=camShots.length&&camDest?.sessionId&&findSessionContext(camDest.sessionId);
  if(ctx)showToast(camT('savedTo',{dest:cameraDestinationLabel(camDest)}));
  else if(camShots.length)showToast('Photos gardées dans Captures');
  leaveCamera();
  if(cameraReturn(ctx||null))return;
  if(ctx)navigate('session',{courseId:ctx.course.id,sectionId:ctx.section.id,sessionId:ctx.session.id});
  else navigate('home');
}
