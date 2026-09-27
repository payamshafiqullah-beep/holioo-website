'use strict';

let cameraUsesHardwareZoom=false;
let cameraZoomMin=1;
let cameraZoomMax=4;
let captureRailUrls=[];
let cropEditor=null;

function clamp(v,min,max){return Math.min(max,Math.max(min,v))}

function updateCaptureCount(){
  const count=byId('captureCount');
  if(count)count.textContent=String(captureIds.length);
  const cropBtn=byId('cropLastBtn'),lastBtn=byId('lastPhotoBtn');
  if(cropBtn)cropBtn.disabled=!captureIds.length;
  if(lastBtn)lastBtn.classList.toggle('has-photo',!!captureIds.length);
}

function setCameraStatus(text){
  const el=byId('cameraStatus');
  if(el)el.textContent=text;
}

async function startCamera(){
  stopCamera();
  const video=byId('cameraVideo');
  if(!video)return;

  setCameraStatus('Ouverture…');

  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ideal:cameraFacing},
        width:{ideal:1920},
        height:{ideal:1080}
      },
      audio:false
    });

    video.srcObject=cameraStream;
    await video.play().catch(()=>{});
    cameraTrack=cameraStream.getVideoTracks()[0];

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

    const torch=byId('torchBtn');
    if(torch){
      torch.disabled=!caps.torch;
      torch.classList.toggle('unavailable',!caps.torch);
      torch.querySelector('small').textContent=caps.torch?'Torche':'Indisponible';
    }

    document.querySelectorAll('[data-zoom]').forEach(btn=>{
      const z=Number(btn.dataset.zoom);
      btn.disabled=z<cameraZoomMin||z>cameraZoomMax;
    });

    setCameraStatus(cameraUsesHardwareZoom?'Caméra prête':'Caméra prête • zoom numérique');
  }catch(e){
    console.error(e);
    setCameraStatus('Caméra indisponible');
    showToast('Autorisez la caméra dans Safari');
  }
}

function stopCamera(){
  cameraStream?.getTracks?.().forEach(t=>t.stop());
  cameraStream=null;
  cameraTrack=null;
  torchOn=false;
  cameraUsesHardwareZoom=false;
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
    console.warn('Zoom constraint failed',e);
    cameraUsesHardwareZoom=false;
    if(video)video.style.transform=`scale(${target})`;
  }

  const slider=byId('zoomRange');
  if(slider)slider.value=String(target);
  const label=byId('zoomLabel'),pinch=byId('pinchZoomLabel');
  const text=`${target.toFixed(1)}×`;
  if(label)label.textContent=text;
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

async function applyZoom(e){
  await setCameraZoom(Number(e.target.value));
}

async function toggleTorch(){
  if(!cameraTrack)return;
  const caps=cameraTrack.getCapabilities?.()||{};
  if(!caps.torch){
    showToast('La torche n’est pas disponible sur cette caméra');
    return;
  }

  torchOn=!torchOn;
  try{
    await cameraTrack.applyConstraints({advanced:[{torch:torchOn}]});
    byId('torchBtn')?.classList.toggle('active',torchOn);
  }catch(e){
    torchOn=false;
    showToast('Impossible d’activer la torche');
  }
}

async function capturePhoto(){
  const video=byId('cameraVideo');
  if(!video?.videoWidth){
    showToast('La caméra n’est pas prête');
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

  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
  if(!blob)return;

  const id=uid();
  await DB.put('photos',{id,blob,createdAt:now(),syncState:'pending'});
  captureIds.push(id);
  state.captureDraft.photoIds=[...captureIds];
  saveState();

  const stage=byId('cameraStage');
  stage?.classList.add('capture-flash');
  setTimeout(()=>stage?.classList.remove('capture-flash'),120);

  updateCaptureCount();
  await renderCaptureGalleryRail();
  navigator.vibrate?.(18);
}

async function importGallery(e){
  const files=[...(e.target.files||[])].filter(f=>f.type.startsWith('image/'));
  for(const file of files){
    const id=uid();
    await DB.put('photos',{id,blob:file,createdAt:now(),syncState:'pending'});
    captureIds.push(id);
  }

  state.captureDraft.photoIds=[...captureIds];
  saveState();
  updateCaptureCount();
  await renderCaptureGalleryRail();
  e.target.value='';
  if(files.length)showToast(`${files.length} photo${files.length>1?'s':''} ajoutée${files.length>1?'s':''}`);
}

async function renderCaptureGalleryRail(){
  const rail=byId('captureGalleryRail');
  if(!rail)return;

  for(const url of captureRailUrls)URL.revokeObjectURL(url);
  captureRailUrls=[];
  rail.innerHTML='';

  const recent=[...captureIds].reverse().slice(0,10);
  for(let i=0;i<recent.length;i++){
    const id=recent[i];
    const row=await DB.get('photos',id);
    if(!row?.blob)continue;

    const url=URL.createObjectURL(row.blob);
    captureRailUrls.push(url);

    const btn=document.createElement('button');
    btn.className='rail-thumb';
    btn.dataset.photoId=id;
    btn.title='Ouvrir et recadrer';
    btn.innerHTML=`<img src="${url}" alt="Photo ${captureIds.indexOf(id)+1}"><span>⌗</span>`;
    btn.onclick=()=>openCropEditor(id);
    rail.appendChild(btn);
  }

  const lastBtn=byId('lastPhotoBtn');
  if(lastBtn){
    const lastId=captureIds[captureIds.length-1];
    const last=lastId?await DB.get('photos',lastId):null;
    if(last?.blob){
      const preview=URL.createObjectURL(last.blob);
      captureRailUrls.push(preview);
      lastBtn.innerHTML=`<img src="${preview}" alt="Dernière photo">`;
    }else{
      lastBtn.innerHTML='<span>▧</span>';
    }
  }
}

async function openCropEditor(photoId){
  const row=await DB.get('photos',photoId);
  if(!row?.blob)return;

  closeCropEditor();

  const url=URL.createObjectURL(row.blob);
  cropEditor={
    photoId,
    row,
    url,
    crop:null,
    bounds:null,
    ratio:null,
    drag:null
  };

  const host=byId('cropEditorHost');
  if(!host)return;

  host.innerHTML=`<div class="crop-editor" id="cropEditor">
    <div class="crop-editor-head">
      <button class="crop-text-btn" id="cancelCrop">Annuler</button>
      <div>
        <b>Recadrer</b>
        <small>Ajustez le cadre puis enregistrez</small>
      </div>
      <button class="crop-save-btn" id="saveCrop">Enregistrer</button>
    </div>

    <div class="crop-workspace" id="cropWorkspace">
      <img id="cropImage" src="${url}" alt="Photo à recadrer" draggable="false">
      <div class="crop-box" id="cropBox">
        <span class="crop-grid-line v1"></span><span class="crop-grid-line v2"></span>
        <span class="crop-grid-line h1"></span><span class="crop-grid-line h2"></span>
        <i class="crop-handle nw" data-handle="nw"></i>
        <i class="crop-handle ne" data-handle="ne"></i>
        <i class="crop-handle sw" data-handle="sw"></i>
        <i class="crop-handle se" data-handle="se"></i>
      </div>
    </div>

    <div class="crop-ratios">
      <button class="crop-ratio active" data-ratio="free">Libre</button>
      <button class="crop-ratio" data-ratio="1">1:1</button>
      <button class="crop-ratio" data-ratio="1.333333">4:3</button>
      <button class="crop-ratio" data-ratio="0.707071">A4</button>
    </div>
    <div class="crop-help">Déplacez le cadre ou tirez les coins pour ajuster.</div>
  </div>`;

  byId('cancelCrop').onclick=closeCropEditor;
  byId('saveCrop').onclick=saveCrop;
  document.querySelectorAll('[data-ratio]').forEach(btn=>btn.onclick=()=>setCropRatio(btn.dataset.ratio));
  byId('cropImage').onload=()=>requestAnimationFrame(initCropBox);
}

function initCropBox(){
  if(!cropEditor)return;
  const workspace=byId('cropWorkspace'),img=byId('cropImage'),box=byId('cropBox');
  if(!workspace||!img||!box)return;

  const wr=workspace.getBoundingClientRect();
  const ir=img.getBoundingClientRect();
  cropEditor.bounds={
    x:ir.left-wr.left,
    y:ir.top-wr.top,
    w:ir.width,
    h:ir.height
  };

  const inset=Math.min(20,Math.max(8,ir.width*0.05));
  cropEditor.crop={
    x:cropEditor.bounds.x+inset,
    y:cropEditor.bounds.y+inset,
    w:cropEditor.bounds.w-inset*2,
    h:cropEditor.bounds.h-inset*2
  };

  updateCropBox();
  setupCropInteractions();
}

function updateCropBox(){
  const box=byId('cropBox');
  if(!box||!cropEditor?.crop)return;
  const c=cropEditor.crop;
  Object.assign(box.style,{
    left:`${c.x}px`,
    top:`${c.y}px`,
    width:`${c.w}px`,
    height:`${c.h}px`
  });
}

function setCropRatio(raw){
  if(!cropEditor?.crop||!cropEditor.bounds)return;
  document.querySelectorAll('[data-ratio]').forEach(b=>b.classList.toggle('active',b.dataset.ratio===raw));

  if(raw==='free'){
    cropEditor.ratio=null;
    return;
  }

  const ratio=Number(raw);
  cropEditor.ratio=ratio;
  const b=cropEditor.bounds,c=cropEditor.crop;
  const cx=c.x+c.w/2,cy=c.y+c.h/2;

  let w=Math.min(c.w,b.w);
  let h=w/ratio;
  if(h>b.h){h=Math.min(c.h,b.h);w=h*ratio}
  w=Math.min(w,b.w);h=Math.min(h,b.h);

  cropEditor.crop={
    x:clamp(cx-w/2,b.x,b.x+b.w-w),
    y:clamp(cy-h/2,b.y,b.y+b.h-h),
    w,h
  };
  updateCropBox();
}

function setupCropInteractions(){
  const box=byId('cropBox'),workspace=byId('cropWorkspace');
  if(!box||!workspace||box.dataset.ready==='1')return;
  box.dataset.ready='1';

  box.addEventListener('pointerdown',e=>{
    if(!cropEditor?.crop)return;
    e.preventDefault();
    const handle=e.target.dataset.handle||'move';
    cropEditor.drag={
      pointerId:e.pointerId,
      handle,
      startX:e.clientX,
      startY:e.clientY,
      crop:{...cropEditor.crop}
    };
    box.setPointerCapture?.(e.pointerId);
  });

  box.addEventListener('pointermove',e=>{
    const d=cropEditor?.drag;
    if(!d||d.pointerId!==e.pointerId)return;
    e.preventDefault();

    const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
    const b=cropEditor.bounds,s=d.crop,min=56;
    let x=s.x,y=s.y,w=s.w,h=s.h;

    if(d.handle==='move'){
      x=clamp(s.x+dx,b.x,b.x+b.w-s.w);
      y=clamp(s.y+dy,b.y,b.y+b.h-s.h);
    }else{
      if(d.handle.includes('e'))w=clamp(s.w+dx,min,b.x+b.w-s.x);
      if(d.handle.includes('s'))h=clamp(s.h+dy,min,b.y+b.h-s.y);
      if(d.handle.includes('w')){
        const nx=clamp(s.x+dx,b.x,s.x+s.w-min);
        w=s.w+(s.x-nx);x=nx;
      }
      if(d.handle.includes('n')){
        const ny=clamp(s.y+dy,b.y,s.y+s.h-min);
        h=s.h+(s.y-ny);y=ny;
      }
    }

    cropEditor.crop={x,y,w,h};
    updateCropBox();
  });

  const finish=e=>{
    if(cropEditor?.drag?.pointerId===e.pointerId)cropEditor.drag=null;
  };
  box.addEventListener('pointerup',finish);
  box.addEventListener('pointercancel',finish);
}

async function saveCrop(){
  if(!cropEditor?.crop||!cropEditor.bounds)return;
  const img=byId('cropImage');
  if(!img?.naturalWidth)return;

  const b=cropEditor.bounds,c=cropEditor.crop;
  const sx=(c.x-b.x)/b.w*img.naturalWidth;
  const sy=(c.y-b.y)/b.h*img.naturalHeight;
  const sw=c.w/b.w*img.naturalWidth;
  const sh=c.h/b.h*img.naturalHeight;

  const maxSide=2400;
  const scale=Math.min(1,maxSide/Math.max(sw,sh));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sw*scale));
  canvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);

  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.93));
  if(!blob)return;

  const old=cropEditor.row;
  await DB.put('photos',{
    ...old,
    blob,
    syncState:'pending',
    syncError:null,
    driveFileId:null,
    driveWebViewLink:null,
    driveParentId:null,
    driveName:null,
    croppedAt:now()
  });

  closeCropEditor();
  await renderCaptureGalleryRail();
  showToast('Recadrage enregistré');
}

function closeCropEditor(){
  if(cropEditor?.url)URL.revokeObjectURL(cropEditor.url);
  cropEditor=null;
  const host=byId('cropEditorHost');
  if(host)host.innerHTML='';
}

function closeCaptureScreen(){
  closeCropEditor();
  stopCamera();
  for(const url of captureRailUrls)URL.revokeObjectURL(url);
  captureRailUrls=[];

  if(captureIds.length){
    state.inbox.unshift({
      id:state.captureDraft.id,
      title:'Capture interrompue',
      photoIds:[...captureIds],
      createdAt:state.captureDraft.createdAt
    });
    showToast('Photos gardées dans Inbox');
  }

  state.captureDraft=null;
  captureIds=[];
  saveState();
  queueSync();
  navigate('home');
}

function finishCapture(){
  if(!captureIds.length){
    showToast('Prenez au moins une photo');
    return;
  }

  closeCropEditor();
  stopCamera();
  for(const url of captureRailUrls)URL.revokeObjectURL(url);
  captureRailUrls=[];

  currentBatch={
    id:state.captureDraft?.id||uid(),
    photoIds:[...captureIds],
    selected:new Set(captureIds),
    createdAt:state.captureDraft?.createdAt||now(),
    splitQueue:[]
  };
  state.captureDraft=null;
  captureIds=[];
  saveState();
  navigate('captureComplete');
}

async function fillThumbs(containerId,ids,{selectable=false,split=false,viewerTitle='Galerie'}={}){
  const box=document.getElementById(containerId);if(!box)return;box.innerHTML='';
  for(let i=0;i<ids.length;i++){
    const id=ids[i],row=await DB.get('photos',id);if(!row?.blob)continue;
    const url=URL.createObjectURL(row.blob),selected=currentBatch?.selected?.has(id),status=photoStatusLabel(row),b=document.createElement('button');
    b.className=`thumb ${selectable&&selected?'selected':''} ${split?(selected?'group-a':'group-b'):''}`;
    b.innerHTML=`<img src="${url}" alt="Photo ${i+1}"><span class="num">${i+1}</span>${!selectable?`<span class="thumb-status badge ${status.cls}">${status.label}</span>`:''}${selectable&&!split?`<span class="check">${selected?'✓':''}</span>`:''}${split?`<span class="group-tag">${selected?'LOT 1':'LOT 2'}</span>`:''}`;
    if(selectable)b.onclick=()=>{selected?currentBatch.selected.delete(id):currentBatch.selected.add(id);render()};
    else b.onclick=()=>openPhotoViewer(ids,i,{title:viewerTitle,source:'batch',sourceId:currentBatch?.id||null,editable:false,returnView:currentView,courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
    box.appendChild(b);
  }
}

function saveBatchToInbox(batch){
  state.inbox.unshift({id:batch.id,title:`Capture ${fmtShort(batch.createdAt)}`,photoIds:[...batch.photoIds],createdAt:batch.createdAt});
  saveState();currentBatch=null;showToast('Lot enregistré dans Inbox');queueSync();navigate('home');
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
