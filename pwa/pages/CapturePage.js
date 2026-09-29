// Capture — interface caméra plein écran.
// Camera, zoom, crop and batch logic live in features/capture-actions.js.
function renderCapture(){
  if(!state.captureDraft){state.captureDraft={id:uid(),photoIds:[],createdAt:now()};saveState()}
  captureIds=[...state.captureDraft.photoIds];
  const glass=(id,name,label,extra='')=>`<button class="glass-btn" id="${id}" aria-label="${label}" ${extra}>${icon(name,{size:21})}</button>`;
  app.innerHTML=`<div class="camera">
    <div class="camera-stage" id="cameraStage">
      <video id="cameraVideo" autoplay playsinline muted></video>
      <div class="camera-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    </div>

    <div class="camera-top">
      ${glass('closeCam','x','Fermer')}
      <span class="camera-status"><i></i><span id="cameraStatus">Ouverture…</span></span>
      <div class="camera-top-actions">
        ${glass('torchBtn','zap','Flash')}
        ${glass('cropLastBtn','crop','Recadrer la dernière photo')}
      </div>
    </div>

    <div class="zoom-feedback" id="pinchZoomLabel" aria-live="polite">1.0×</div>

    <div class="camera-bottom">
      <div class="camera-rail" aria-label="Photos de cette capture">
        <button id="galleryRailImport" class="rail-add" aria-label="Ajouter depuis la galerie">${icon('plus',{size:20})}</button>
        <div class="rail-thumbs" id="captureGalleryRail"></div>
      </div>

      <div class="zoom-chips" aria-label="Zoom">
        <button class="zoom-chip" data-zoom="1">1×</button><button class="zoom-chip" data-zoom="2">2×</button><button class="zoom-chip" data-zoom="3">3×</button>
        <input id="zoomRange" class="visually-hidden" type="range" min="1" max="4" step="0.1" value="1" aria-label="Zoom">
      </div>

      <div class="camera-controls">
        <button class="gallery-shortcut" id="lastPhotoBtn" aria-label="Galerie">${icon('image',{size:24})}</button>
        <button class="shutter" id="shutter" aria-label="Prendre une photo"><span></span></button>
        <button class="glass-btn round-lg" id="flipCam" aria-label="Changer de caméra">${icon('switchCamera',{size:24})}</button>
      </div>

      <div class="camera-footer">
        <button class="camera-text-btn" id="galleryBtn">${icon('upload',{size:16})}Importer</button>
        <span class="camera-mode">PHOTO</span>
        <button class="camera-done" id="finishCapture">Terminer <b id="captureCount">0</b></button>
        <input type="file" id="galleryInput" accept="image/*" multiple hidden>
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
