// Capture — interface caméra plein écran, avec le scanner de documents.
// Camera, zoom, destination and saving live in features/capture-actions.js, live page detection
// in features/scanner.js, the destination sheet in ui/camera-picker.js, texts in features/camera-i18n.js.
// The action buttons are magnetic (ui/magnet.js): a blob that stretches + a glyph that stays sharp.
const magBody=inner=>`<span class="mag-blob" aria-hidden="true"></span><span class="mag-glyph">${inner}</span>`;
function renderCapture(){
  const glass=(id,name,label,extra='',cls='',size=25)=>`<button class="glass-btn magnet ${cls}" id="${id}" aria-label="${esc(label)}" ${extra}>${magBody(icon(name,{size}))}</button>`;
  camMode=SCAN_MODES.includes(state.camMode)?state.camMode:'photo';
  app.innerHTML=`<div class="camera" data-mode="${camMode}">
    <div class="camera-stage" id="cameraStage">
      <video id="cameraVideo" autoplay playsinline muted></video>
      <div class="camera-grid${state.camGrid===false?' hidden':''}" id="cameraGrid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <svg class="scan-overlay" id="scanOverlay" aria-hidden="true"></svg>
      <span class="focus-ring hidden" id="focusRing" aria-hidden="true"></span>
    </div>

    <div class="camera-top">
      ${glass('closeCam','x',camT('close'))}
      <button class="cam-dest" id="camDest" aria-haspopup="dialog"><span class="cam-dest-dot" aria-hidden="true"></span><span class="cam-dest-text" id="camDestText">${esc(camT('chooseDest'))}</span>${icon('chevronRight',{size:16,stroke:2.4})}</button>
      ${glass('torchBtn','zap',camT('flashOff'),'aria-pressed="false"')}
    </div>
    <div class="scan-tools" id="scanTools">
      <button class="scan-tool" id="scanAutoBtn" aria-pressed="true"></button>
      ${glass('gridBtn','layers',camT('grid'),`aria-pressed="${state.camGrid!==false}"`,'small',22)}
    </div>
    <div class="cam-notices">
      <span class="visually-hidden" role="status" id="cameraStatus">${esc(camT('opening'))}</span>
      <div class="cam-notice scan-hint hidden" id="scanHint" role="status" aria-live="polite"></div>
      <button class="cam-notice hidden" id="camSaveState" aria-live="polite"></button>
      <div class="cam-notice warn hidden" id="camStorage" role="status"></div>
    </div>

    <div class="zoom-feedback" id="pinchZoomLabel" aria-live="polite">1.0×</div>
    <div class="cam-panel hidden" id="camPanel" role="alertdialog" aria-live="assertive"></div>

    <div class="camera-bottom">
      <div class="zoom-chips" aria-label="${esc(camT('zoom'))}">
        <button class="zoom-chip" data-zoom="1">1×</button><button class="zoom-chip" data-zoom="2">2×</button><button class="zoom-chip" data-zoom="3">3×</button>
        <input id="zoomRange" class="visually-hidden" type="range" min="1" max="4" step="0.1" value="1" aria-label="${esc(camT('zoom'))}">
      </div>

      <div class="cam-modes" id="camModes" role="tablist" aria-label="${esc(camT('modes'))}">
        ${SCAN_MODES.map(m=>`<button role="tab" class="cam-mode${m===camMode?' active':''}" data-mode="${m}" aria-selected="${m===camMode}">${esc(camT('mode_'+m))}</button>`).join('')}
      </div>

      <div class="camera-controls">
        <button class="gallery-shortcut cam-last magnet" id="lastPhotoBtn" aria-label="${esc(camT('lastPhoto',{n:0}))}" disabled>${magBody(`<span class="cam-last-img" id="camLastImg"></span><b class="cam-count hidden" id="captureCount">0</b>`)}</button>
        <button class="shutter magnet" id="shutter" aria-label="${esc(camT('shutter'))}">${magBody('<span class="shutter-disc"></span>')}</button>
        ${glass('flipCam','switchCamera',camT('switchCam'),'','round-lg',29)}
      </div>

      <div class="camera-footer">
        <button class="camera-text-btn magnet" id="galleryBtn">${magBody(`${icon('upload',{size:18})}${esc(camT('importBtn'))}`)}</button>
        <span></span>
        <button class="camera-done magnet" id="finishCapture">${magBody(esc(camT('done')))}</button>
        <input type="file" id="galleryInput" accept="image/*" multiple hidden>
        <input type="file" id="cameraFallbackInput" accept="image/*" capture="environment" hidden>
      </div>
    </div>
    <div id="camSheetHost"></div>
  </div>`;

  initCameraDestination();
  setupCameraLifecycle();
  attachMagnets(app.querySelector('.camera'));
  setTimeout(async()=>{await startCamera();setupPinchZoom();setupTapToFocus();checkCameraStorage();applyCameraMode(camMode,{initial:true})},0);
  byId('closeCam').onclick=()=>closeCaptureScreen();
  byId('camDest').onclick=()=>openDestinationPicker();
  byId('shutter').onclick=()=>capturePhoto();
  byId('flipCam').onclick=async()=>{cameraFacing=cameraFacing==='environment'?'user':'environment';await startCamera();setupPinchZoom()};
  byId('torchBtn').onclick=toggleTorch;
  byId('galleryBtn').onclick=()=>camDest?byId('galleryInput').click():openDestinationPicker(camT('chooseFirst'));
  byId('galleryInput').onchange=importGallery;
  byId('cameraFallbackInput').onchange=importGallery;
  byId('finishCapture').onclick=finishCapture;
  byId('lastPhotoBtn').onclick=openCaptureReview;
  byId('camSaveState').onclick=()=>cameraQueue.retryNow();
  byId('zoomRange').oninput=e=>setCameraZoom(Number(e.target.value));
  byId('scanAutoBtn').onclick=toggleScanAuto;
  byId('gridBtn').onclick=toggleCameraGrid;
  document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>setCameraZoom(Number(b.dataset.zoom)));
  document.querySelectorAll('#camModes [data-mode]').forEach(b=>b.onclick=()=>applyCameraMode(b.dataset.mode));
  updateCaptureCount();
  renderCameraSaveState(cameraQueue.state());
}
