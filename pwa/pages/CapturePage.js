function renderCapture(){
  if(!state.captureDraft){state.captureDraft={id:uid(),photoIds:[],createdAt:now()};saveState()}
  captureIds=[...state.captureDraft.photoIds];
  app.innerHTML=`<div class="capture-screen camera-pastel">
    <div class="camera-v3-viewfinder" id="cameraStage">
      <video id="cameraVideo" autoplay playsinline muted></video>
      <div class="camera-v3-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>

      <div class="camera-pastel-top">
        <button id="closeCam" class="camera-glass-btn close" aria-label="Fermer">×</button>
        <div class="camera-pastel-actions">
          <button class="camera-glass-btn" id="torchBtn" aria-label="Flash"><span>ϟ</span><small>A</small></button>
          <button class="camera-glass-btn crop" id="cropLastBtn" aria-label="Recadrer la dernière photo"><span>⌗</span></button>
        </div>
      </div>

      <div class="camera-pastel-count"><b id="captureCount">0</b><span>photos</span></div>
      <div class="camera-v3-zoom-feedback" id="pinchZoomLabel">1.0×</div>

      <aside class="camera-v3-filmstrip camera-pastel-filmstrip" aria-label="Photos récentes">
        <button id="galleryRailImport" class="camera-pastel-add" aria-label="Ajouter depuis la galerie">＋</button>
        <div class="rail-thumbs camera-v3-filmstrip-list" id="captureGalleryRail"></div>
      </aside>

      <div class="camera-pastel-bottom">
        <div class="camera-pastel-zoom" aria-label="Zoom">
          <button class="zoom-chip" data-zoom="1">1×</button><button class="zoom-chip" data-zoom="2">2×</button><button class="zoom-chip" data-zoom="3">3×</button>
          <input id="zoomRange" class="camera-v3-hidden-range" type="range" min="1" max="4" step="0.1" value="1" aria-label="Zoom">
        </div>
        <div class="camera-pastel-modes" role="tablist"><button class="active">Document</button><button>Tableau</button><button>Livre</button><button>Autre</button></div>
        <div class="camera-pastel-controls">
          <button class="camera-pastel-thumb" id="lastPhotoBtn" aria-label="Galerie">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"></rect><circle cx="9" cy="9.5" r="1.6"></circle><path d="M5.8 16.5l4.2-4.1a1.35 1.35 0 0 1 1.9 0l2.1 2.1"></path><path d="M13 15.6l2.1-2.1a1.35 1.35 0 0 1 1.9 0l1.3 1.3"></path></svg>
          </button>
          <button class="camera-pastel-shutter" id="shutter" aria-label="Prendre une photo"><span></span></button>
          <button class="camera-pastel-flip" id="flipCam" aria-label="Changer de caméra">↻</button>
        </div>
        <div class="camera-pastel-finish-row">
          <button id="galleryBtn">Galerie</button><span>PHOTO</span><button id="finishCapture">Terminer</button>
          <input type="file" id="galleryInput" accept="image/*" multiple hidden>
        </div>
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
  document.querySelectorAll('.camera-pastel-modes button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.camera-pastel-modes button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  updateCaptureCount();
}
