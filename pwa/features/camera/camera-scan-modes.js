'use strict';
// Camera, scanner modes: tools and hints, QR results, and the capture of a scanned page.
// ─── Scanner modes ────────────────────────────────────────────
// Photo = plain photo. Document / Tableau / Livre / Carte = page detection + crop + filter.
// QR = reads codes, takes no photo.

let camMode='photo';
let camIdFront=null;      // ID card: the front, waiting for the back
let camRetakeId=null;     // review → "Reprendre": the next shot replaces this photo
let camKeepBatch=false;   // coming back from the review keeps this capture's pages and counter
let camTilt=null,camTiltListening=false;

const isScanMode=m=>m!=='photo'&&m!=='qr';

function applyCameraMode(mode,{initial=false}={}){
  if(!SCAN_MODES.includes(mode))mode='photo';
  const changed=mode!==camMode;
  camMode=mode;state.camMode=mode;saveState();
  if(changed)camIdFront=null;
  const root=document.querySelector('.camera');if(root)root.dataset.mode=mode;
  document.querySelectorAll('#camModes [data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));if(on)b.scrollIntoView({inline:'center',block:'nearest',behavior:initial?'auto':'smooth'})});
  renderScanTools();
  if(!initial&&mode!=='photo')requestTiltPermission();
  Scanner.stop();
  if(mode==='photo'||!cameraStream){renderScanHint(null);return}
  Scanner.start({video:byId('cameraVideo'),overlay:byId('scanOverlay'),mode,
    getZoom:()=>({digital:cameraUsesHardwareZoom?1:Math.max(1,zoomValue||1),css:cameraUsesHardwareZoom?1:Math.max(1,zoomValue||1)}),
    onAuto:()=>capturePhoto({auto:true}),onQr:showQrResult,onStatus:renderScanHint});
  if(Scanner.state!=='ready'&&mode!=='qr')renderScanHint({state:'loading'});
}

function renderScanTools(){
  const tools=byId('scanTools');if(!tools)return;
  tools.classList.toggle('hidden',!isScanMode(camMode));
  const corners=byId('scanCornersBtn');
  if(corners){corners.classList.toggle('hidden',camMode==='qr'||camMode==='id');corners.classList.remove('on');corners.setAttribute('aria-pressed','false')}
  const auto=state.scanAuto!==false&&camMode!=='id',b=byId('scanAutoBtn');
  if(b){b.textContent=auto?camT('scanAuto'):camT('scanManual');b.classList.toggle('on',auto);b.setAttribute('aria-pressed',String(auto));b.setAttribute('aria-label',camT('scanAutoLabel',{state:auto?camT('on'):camT('off')}));b.disabled=camMode==='id'}
}
// Corners by hand: the fallback when the detector is unsure (see Scanner.setManual).
function toggleScanCorners(){
  const b=byId('scanCornersBtn'),on=Scanner.setManual(!b?.classList.contains('on'));
  b?.classList.toggle('on',on);b?.setAttribute('aria-pressed',String(on));
  b?.setAttribute('aria-label',camT('scanCornersLabel',{state:on?camT('on'):camT('off')}));
  if(on)showToast(camT('cornersToast'));
}
function toggleScanAuto(){state.scanAuto=state.scanAuto===false;saveState();renderScanTools();showToast(camT('scanAutoLabel',{state:state.scanAuto?camT('on'):camT('off')}))}
function toggleCameraGrid(){
  state.camGrid=state.camGrid===false;saveState();
  byId('cameraGrid')?.classList.toggle('hidden',state.camGrid===false);
  byId('gridBtn')?.setAttribute('aria-pressed',String(state.camGrid!==false));
}

// One short line above the preview: what to do, or what is wrong.
function renderScanHint(s){
  const el=byId('scanHint');if(!el)return;
  byId('scanCornersBtn')?.classList.toggle('on',!!s?.manual);byId('scanCornersBtn')?.setAttribute('aria-pressed',String(!!s?.manual));   // stays in step with the scanner (a restart ends the hand mode)
  if(!s||camMode==='photo'){el.classList.add('hidden');return}
  let text='',warn=false;
  const search={document:'searchDocument',board:'searchBoard',book:'searchBook',id:camIdFront?'searchIdBack':'searchId',qr:'qrAim'}[camMode];
  if(camRetakeId)text=camT('retakeHint');
  if(s.state==='loading')text=camT('scanLoading',{p:Math.round((Scanner.progress||0)*100)});
  else if(s.state==='manual')text=camT('scanFailed');
  else if(s.manual)text=camT('cornersHint');
  else if(s.warn){
    warn=s.warn!=='find'; // "find" is a tip, not a problem: neutral chip
    const board=camMode==='board';
    text=camT({dark:'warnDark',blur:'warnBlur',tilt:board?'warnTiltBoard':'warnTilt',far:board?'warnFarBoard':'warnFar',cutoff:board?'warnCutBoard':'warnCut',glare:'warnGlare',find:board?'warnFindBoard':'warnFind',lowconf:'warnLowConf'}[s.warn],{p:s.conf});
    if(camMode==='id'&&camIdFront)text=`${camT('idBackShort')} — ${text}`;
  }
  // ID card: always say which side is expected.
  else if(camMode==='id'&&(s.state==='stable'||s.state==='tracking'))text=camT(camIdFront?'idBackReady':'idFrontReady');
  else if(camMode==='board'&&s.conf!=null&&s.conf<80&&(s.state==='stable'||s.state==='tracking'))text=camT('confLow',{p:s.conf});   // under 80 %: say so
  else if(s.state==='stable'||s.state==='tracking')text=s.auto?camT('pageLocked'):camT('ready');
  else if(!text)text=camT(search);
  el.textContent=text;el.classList.toggle('warn',warn);el.classList.remove('hidden');
  el.dataset.tone=warn?'warn':s.state==='stable'?'ready':s.state==='tracking'?'track':'search';
}
Scanner.subscribe(s=>{if(currentView==='capture'&&s.cvState==='loading')renderScanHint({state:'loading'});if(currentView==='capture'&&s.cvState==='failed'&&isScanMode(camMode))renderScanHint({state:'manual'})});

// "Hold the phone parallel": iPhone asks permission for motion sensors (from a tap).
function requestTiltPermission(){
  if(camTiltListening||typeof DeviceOrientationEvent==='undefined')return;
  const listen=()=>{camTiltListening=true;addEventListener('deviceorientation',e=>{if(e.beta==null)return;camTilt={beta:e.beta,gamma:e.gamma};Scanner.setTilt(camTilt)})};
  if(typeof DeviceOrientationEvent.requestPermission==='function')DeviceOrientationEvent.requestPermission().then(r=>{if(r==='granted')listen()}).catch(()=>{});
  else listen();
}

// Tap to focus, where the browser lets the page steer the camera (mostly Android Chrome).
function setupTapToFocus(){
  const stage=byId('cameraStage');if(!stage||stage.dataset.focusReady)return;stage.dataset.focusReady='1';
  stage.addEventListener('click',async e=>{
    const caps=cameraTrack?.getCapabilities?.()||{};
    const modes=caps.focusMode||[];if(!caps.pointsOfInterest&&!modes.includes('single-shot'))return;
    const r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
    const ring=byId('focusRing');if(ring){ring.style.left=`${e.clientX-r.left}px`;ring.style.top=`${e.clientY-r.top}px`;ring.classList.remove('hidden','go');void ring.offsetWidth;ring.classList.add('go')}
    try{await cameraTrack.applyConstraints({advanced:[{...(caps.pointsOfInterest?{pointsOfInterest:[{x,y}]}:{}),...(modes.includes('single-shot')?{focusMode:'single-shot'}:{})}]})}catch{}
  });
}

function showQrResult(text){
  Scanner.pause(true);
  const url=/^https?:\/\/\S+$/i.test(text.trim())?text.trim():null;
  const safe=url&&/^https:/i.test(url);
  openSheet({title:camT('qrTitle'),subtitle:url?camT('qrLink'):camT('qrText'),
    body:`<p class="qr-result">${esc(text)}</p>${url&&!safe?`<div class="notice tone-peach">${esc(camT('qrUnsafe'))}</div>`:''}`,
    confirmText:url?camT('qrOpen'):camT('qrCopy'),secondaryText:url?camT('qrCopy'):camT('cancel'),
    onConfirm:()=>{if(url)window.open(url,'_blank','noopener,noreferrer');else copyText(text);return true},
    onSecondary:()=>{if(url)copyText(text)}});
  // Scanning resumes once the sheet is closed.
  const watch=setInterval(()=>{if(!byId('activeSheet')){clearInterval(watch);Scanner.pause(false)}},400);
}
function copyText(t){navigator.clipboard?.writeText(t).then(()=>showToast(camT('qrCopied'))).catch(()=>{})}

// Capture for a scan mode: the page outline found live becomes the crop of the stored photo.
function queueScanCapture(canvas,dest){
  const cur=Scanner.current(),quad=cur?.quad||null,W=canvas.width,H=canvas.height,exact=!!cur?.manual;   // hand-set corners: trusted as they are
  const blob=new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.93));
  const thumb=canvasToJpeg(scaleCanvas(canvas,W,H));
  const stored=id=>scanRenderQueue.add(id);
  const mode=camRetakeId&&(camMode==='book'||camMode==='id')?'document':camMode;
  const ids=[],live=quad?{scanQuad:quad}:{}; // the live outline stays with the photo: refined on the full image before rendering
  if(camRetakeId){
    const id=camRetakeId;camRetakeId=null;
    cameraQueue.add({id,blob,thumb,dest,createdAt:now(),replace:true,edit:scanEdit(mode,quad,W,H),extra:{scanMode:mode,...live},onStored:id=>{stored(id);showToast(camT('retaken'));if(currentView==='capture'){camKeepBatch=true;navigate('scanReview')}}});
    return[];
  }
  if(mode==='book'&&quad){
    ScanCore.splitSpread(quad,cur.gutter??.5).forEach((half,i)=>{
      const id=uid();ids.push(id);
      cameraQueue.add({id,blob,thumb,dest,createdAt:now(),edit:scanEdit('book',half,W,H),extra:{scanMode:'book',...live,scanHalf:i,scanGutter:cur.gutter??.5},onStored:stored});
    });
    showToast(camT('bookSplit'));
    return ids;
  }
  if(mode==='id'){
    const side={blob,edit:scanEdit('id',quad,W,H),quad};
    if(!camIdFront){camIdFront=side;renderScanHint({state:'search'});showToast(camT('idFrontSaved'));return[]}
    const front=camIdFront;camIdFront=null;
    const page=(async()=>{
      const[fb,bb]=await Promise.all([front.blob,side.blob]);
      const[fe,be]=await Promise.all([preciseSideEdit(fb,front),preciseSideEdit(bb,side)]);
      const r=await imageJob('idcard',{front:{blob:fb,edit:fe},back:{blob:bb,edit:be}});
      return{...r,fb,bb,fe,be};
    })();
    const id=uid();ids.push(id);
    cameraQueue.add({id,blob:page.then(r=>r.page),thumb:page.then(r=>r.thumb),dest,createdAt:now(),extra:{scanMode:'id'},
      onStored:async id=>{try{const r=await page;await DB.patch('photos',id,{scanSources:[{blob:r.fb,edit:r.fe},{blob:r.bb,edit:r.be}]})}catch{}if(typeof Ocr!=='undefined')Ocr.enqueue(id)}});
    renderScanHint({state:'search'});showToast(camT('idDone'));
    return ids;
  }
  const id=uid();ids.push(id);
  cameraQueue.add({id,blob,thumb,dest,createdAt:now(),edit:scanEdit(mode,quad,W,H,{refined:exact}),extra:{scanMode:mode,...live},onStored:stored});
  return ids;
}

// ID card side: its outline searched again on the stored photo (the card is small in the frame, so
// the live outline is the least precise there).
async function preciseSideEdit(blob,side){
  if(!side.quad)return side.edit;
  try{const r=await Scanner.refineBlob(blob,side.quad);if(r)return scanEdit('id',r.quad,r.width,r.height,{refined:true})}catch(e){console.warn('Scan refine failed',e)}
  return side.edit;
}

// Imported photos (gallery, or the phone's camera app as fallback) follow the same pipeline.
async function importScanFiles(files,dest){
  const ids=[];
  for(const file of files){
    let det=null;try{det=await Scanner.detectBlob(file,camMode==='id'?'id':camMode)}catch{}
    const W=det?.width||1,H=det?.height||1;let quad=det?.quad||null,refined=false;
    // Edges searched again on the photo itself (detection ran on a 640 px copy).
    if(quad){try{const r=await Scanner.refineBlob(file,quad);if(r){quad=r.quad;refined=true}}catch(e){console.warn('Scan refine failed',e)}}
    if(camMode==='book'&&quad){
      for(const half of ScanCore.splitSpread(quad,det.gutter??.5)){const id=uid();ids.push(id);cameraQueue.add({id,blob:Promise.resolve(file),dest,createdAt:now(),edit:scanEdit('book',half,W,H,{refined}),extra:{scanMode:'book'},onStored:id=>scanRenderQueue.add(id)})}
    }else{
      const id=uid();ids.push(id);
      cameraQueue.add({id,blob:Promise.resolve(file),dest,createdAt:now(),edit:scanEdit(camMode==='id'?'id':camMode,quad,W,H,{refined}),extra:{scanMode:camMode},onStored:id=>scanRenderQueue.add(id)});
    }
  }
  return ids;
}
