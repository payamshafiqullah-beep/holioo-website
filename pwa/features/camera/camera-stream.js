'use strict';
// Camera, stream: permissions and panels, prewarming, start / stop, app lifecycle, zoom, pinch and torch.
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
  // Without the live camera, the phone's own camera app still works: its photo goes through the
  // same crop / filter / text recognition pipeline.
  if(kind!=='ask'){
    panel.querySelector('.cam-panel-card').insertAdjacentHTML('beforeend',`<button class="cam-btn ghost" id="camFallbackBtn">${icon('camera',{size:18})} ${esc(camT('fallbackCamera'))}</button><p class="cam-panel-note">${esc(camT('fallbackHint'))}</p>`);
    byId('camFallbackBtn').onclick=()=>byId('cameraFallbackInput')?.click();
  }
  panel.classList.remove('hidden');
  const b=byId('camPanelBtn');
  if(b)b.onclick=()=>{try{localStorage.setItem('holioo_cam_asked','1')}catch{}startCamera({userAction:true})};
  setCameraStatus(texts.body||'');
}

// Browsers let a page open the camera only during a user action. Quick Capture asks for the stream
// right inside its pointerup (no await or timer before it); the camera screen then uses that stream.
let camPrewarm=null;
const cameraCanStream=()=>!!(window.isSecureContext&&navigator.mediaDevices?.getUserMedia);
// Scan modes ask for the sharpest video the camera offers (text must stay readable).
function cameraConstraints(){
  const res=isScanMode(state.camMode)?{width:{ideal:3840},height:{ideal:2160}}:{width:{ideal:1920},height:{ideal:1080}};
  return{video:{facingMode:{ideal:cameraFacing},...res},audio:false};
}
function prewarmCamera(){
  if(!cameraCanStream())return false;
  releasePrewarm();
  try{camPrewarm=navigator.mediaDevices.getUserMedia(cameraConstraints());camPrewarm.catch(()=>{});return true}
  catch{camPrewarm=null;return false}
}
function releasePrewarm(){
  const p=camPrewarm;camPrewarm=null;
  p?.then(s=>s.getTracks().forEach(t=>t.stop()),()=>{});
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
  const pre=camPrewarm;camPrewarm=null;   // asked for during the Quick Capture gesture
  stopCamera();
  const video=byId('cameraVideo');
  if(!video){pre?.then(s=>s.getTracks().forEach(t=>t.stop()),()=>{});return}
  const token=++camStartToken;
  hideCameraPanel();

  if(!cameraCanStream()){showCameraPanel('insecure');return}

  setCameraStatus(camT('opening'));
  if(!pre){
    const perm=await cameraPermissionState();
    if(token!==camStartToken)return;
    // A refusal is not final: a retry asks again (the browser may prompt again); the panel only comes back if it refuses again.
    if(perm==='denied'&&!userAction)watchCameraPermission();
    let asked=false;try{asked=localStorage.getItem('holioo_cam_asked')==='1'}catch{}
    // First time ever: explain why before the browser asks.
    if(perm==='prompt'&&!asked&&!userAction){showCameraPanel('ask');return}
  }

  let stream=null;
  try{
    try{
      stream=await(pre||navigator.mediaDevices.getUserMedia(cameraConstraints()));
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
  // (Re)start page detection for the current mode: after opening, a flip or a return from background.
  if(currentView==='capture')applyCameraMode(camMode,{initial:true});
}

function stopCamera(){
  releasePrewarm();
  if(typeof Scanner!=='undefined')Scanner.stop();
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
