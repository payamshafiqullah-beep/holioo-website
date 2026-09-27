function renderCapture(){
  if(!state.captureDraft){state.captureDraft={id:uid(),photoIds:[],createdAt:now()};saveState()}
  captureIds=[...state.captureDraft.photoIds];

  app.innerHTML=`<div class="capture-screen pro-camera">
    <div class="capture-head pro-camera-head">
      <button id="closeCam" class="camera-icon-btn" aria-label="Fermer">×</button>
      <div class="capture-title-wrap">
        <div class="capture-title">Capture</div>
        <div class="capture-subtitle">Local-first • classement après</div>
      </div>
      <span class="capture-counter" id="captureCount">0</span>
    </div>

    <div class="camera-stage pro-camera-stage" id="cameraStage">
      <video id="cameraVideo" autoplay playsinline muted></video>

      <div class="camera-grid" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>

      <div class="camera-status-pill" id="cameraStatus">Prêt</div>
      <div class="camera-zoom-pill" id="pinchZoomLabel">1.0×</div>

      <aside class="capture-gallery-rail" aria-label="Photos de cette capture">
        <button class="rail-import" id="galleryRailImport" aria-label="Importer depuis la galerie">＋</button>
        <div class="rail-thumbs" id="captureGalleryRail"></div>
      </aside>

      <div class="camera-gesture-hint">Pincez avec deux doigts pour zoomer</div>
    </div>

    <div class="camera-console">
      <div class="quick-zoom" aria-label="Zoom rapide">
        <button class="zoom-chip" data-zoom="1">1×</button>
        <button class="zoom-chip" data-zoom="2">2×</button>
        <button class="zoom-chip" data-zoom="3">3×</button>
      </div>

      <div class="camera-tools pro-tools">
        <button class="tool-btn" id="torchBtn"><span>☀</span><small>Torche</small></button>
        <button class="tool-btn" id="cropLastBtn"><span>⌗</span><small>Recadrer</small></button>
        <button class="tool-btn" id="flipCam"><span>↺</span><small>Retourner</small></button>
        <button class="tool-btn" id="galleryBtn"><span>▧</span><small>Galerie</small></button>
        <input type="file" id="galleryInput" accept="image/*" multiple hidden>
      </div>

      <div class="zoom-row compact-zoom">
        <span>1×</span>
        <input id="zoomRange" type="range" min="1" max="4" step="0.1" value="1" aria-label="Zoom">
        <span id="zoomLabel">1.0×</span>
      </div>

      <div class="shutter-row pro-shutter-row">
        <button class="finish-camera-btn" id="finishCapture">Terminer</button>
        <button class="shutter" id="shutter" aria-label="Prendre une photo"><span></span></button>
        <button class="last-photo-btn" id="lastPhotoBtn" aria-label="Dernière photo"><span>▧</span></button>
      </div>
    </div>

    <div id="cropEditorHost"></div>
  </div>`;

  setTimeout(async()=>{await startCamera();await renderCaptureGalleryRail();setupPinchZoom()},0);

  byId('closeCam').onclick=()=>closeCaptureScreen();
  byId('shutter').onclick=capturePhoto;
  byId('flipCam').onclick=async()=>{cameraFacing=cameraFacing==='environment'?'user':'environment';await startCamera();setupPinchZoom()};
  byId('torchBtn').onclick=toggleTorch;
  byId('galleryBtn').onclick=()=>byId('galleryInput').click();
  byId('galleryRailImport').onclick=()=>byId('galleryInput').click();
  byId('galleryInput').onchange=importGallery;
  byId('finishCapture').onclick=finishCapture;
  byId('zoomRange').oninput=e=>setCameraZoom(Number(e.target.value));
  byId('cropLastBtn').onclick=()=>captureIds.length?openCropEditor(captureIds[captureIds.length-1]):showToast('Aucune photo à recadrer');
  byId('lastPhotoBtn').onclick=()=>captureIds.length?openCropEditor(captureIds[captureIds.length-1]):byId('galleryInput').click();
  document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>setCameraZoom(Number(b.dataset.zoom)));
  updateCaptureCount();
}
