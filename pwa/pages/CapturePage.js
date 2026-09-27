function renderCapture(){
  if(!state.captureDraft){state.captureDraft={id:uid(),photoIds:[],createdAt:now()};saveState()}
  captureIds=[...state.captureDraft.photoIds];

  app.innerHTML=`<div class="capture-screen camera-v3">
    <div class="camera-v3-viewfinder" id="cameraStage">
      <video id="cameraVideo" autoplay playsinline muted></video>

      <div class="camera-v3-grid" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>

      <div class="camera-v3-top">
        <button id="closeCam" class="camera-v3-circle" aria-label="Fermer">×</button>

        <div class="camera-v3-status">
          <span class="camera-v3-live-dot"></span>
          <span id="cameraStatus">Prêt</span>
        </div>

        <div class="camera-v3-top-actions">
          <button class="camera-v3-circle" id="torchBtn" aria-label="Torche">
            <span>ϟ</span><small>Flash</small>
          </button>
          <button class="camera-v3-circle" id="cropLastBtn" aria-label="Recadrer la dernière photo">
            <span>⌗</span><small>Crop</small>
          </button>
        </div>
      </div>

      <div class="camera-v3-counter" aria-live="polite">
        <b id="captureCount">0</b>
        <span>photos</span>
      </div>

      <div class="camera-v3-zoom-feedback" id="pinchZoomLabel">1.0×</div>

      <aside class="camera-v3-filmstrip" aria-label="Photos récentes">
        <div class="camera-v3-filmstrip-head">
          <span>Captures</span>
          <button id="galleryRailImport" aria-label="Ajouter depuis la galerie">＋</button>
        </div>
        <div class="rail-thumbs camera-v3-filmstrip-list" id="captureGalleryRail"></div>
      </aside>


      <div class="camera-v3-bottom">
        <div class="camera-v3-zoom-row" aria-label="Zoom">
          <button class="zoom-chip" data-zoom="1">1×</button>
          <button class="zoom-chip" data-zoom="2">2×</button>
          <button class="zoom-chip" data-zoom="3">3×</button>
          <input id="zoomRange" class="camera-v3-hidden-range" type="range" min="1" max="4" step="0.1" value="1" aria-label="Zoom">
        </div>

        <div class="camera-v3-primary-controls">
          <button class="camera-v3-gallery-preview" id="lastPhotoBtn" aria-label="Dernière photo">
            <span>▧</span>
          </button>

          <button class="camera-v3-shutter" id="shutter" aria-label="Prendre une photo">
            <span></span>
          </button>

          <button class="camera-v3-flip" id="flipCam" aria-label="Changer de caméra">
            <span>↻</span>
          </button>
        </div>

        <div class="camera-v3-footer">
          <button class="camera-v3-footer-btn" id="galleryBtn">
            <span>Galerie</span>
          </button>
          <div class="camera-v3-mode">PHOTO</div>
          <button class="camera-v3-footer-btn strong" id="finishCapture">Terminer</button>
          <input type="file" id="galleryInput" accept="image/*" multiple hidden>
        </div>
      </div>
    </div>

    <div id="cropEditorHost"></div>
  </div>`;

  setTimeout(async()=>{await startCamera();await renderCaptureGalleryRail();setupPinchZoom()},0);

  byId('closeCam').onclick=()=>closeCaptureScreen();
  byId('shutter').onclick=capturePhoto;
  byId('flipCam').onclick=async()=>{
    cameraFacing=cameraFacing==='environment'?'user':'environment';
    await startCamera();
    setupPinchZoom();
  };
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
