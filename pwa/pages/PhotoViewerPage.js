async function renderPhotoViewer(){
  setChrome(true);
  const v=currentPhotoViewer;if(!v?.ids?.length){navigate(v?.returnView||'home');return}
  const id=v.ids[v.index],row=await DB.get('photos',id);if(!row?.blob){showToast('Photo introuvable');v.ids=v.ids.filter(x=>x!==id);v.index=Math.max(0,Math.min(v.index,v.ids.length-1));if(!v.ids.length){navigate(v.returnView||'home');return}return renderPhotoViewer()}
  revokeViewerUrl();viewerObjectUrl=URL.createObjectURL(row.blob);
  const status=photoStatusLabel(row);
  app.innerHTML=`<div class="media-viewer" id="mediaViewer">
    <div class="viewer-topbar">
      <button class="viewer-icon" id="viewerBack" aria-label="Retour">‹</button>
      <div class="viewer-heading"><b>${esc(v.title)}</b><span>${v.index+1} / ${v.ids.length}</span></div>
      <span class="badge ${status.cls}">${status.label}</span>
    </div>
    <div class="viewer-stage" id="viewerStage">
      <img id="viewerImage" src="${viewerObjectUrl}" alt="Photo ${v.index+1}" draggable="false">
      <button class="viewer-arrow left" id="viewerPrev" aria-label="Photo précédente">‹</button>
      <button class="viewer-arrow right" id="viewerNext" aria-label="Photo suivante">›</button>
    </div>
    <div class="viewer-footer">
      <div class="viewer-tip">Glissez à gauche/droite • pincez ou double-touchez pour zoomer</div>
      ${v.editable?`<div class="viewer-actions"><button class="btn ghost" id="viewerMove">Déplacer</button><button class="btn coral" id="viewerDelete">Supprimer</button></div>`:''}
    </div>
  </div>`;
  byId('viewerBack').onclick=()=>{revokeViewerUrl();currentCourseId=v.courseId;currentSectionId=v.sectionId;currentSessionId=v.sessionId;navigate(v.returnView||'home')};
  byId('viewerPrev').disabled=v.index===0;byId('viewerNext').disabled=v.index===v.ids.length-1;
  byId('viewerPrev').onclick=()=>viewerStep(-1);byId('viewerNext').onclick=()=>viewerStep(1);
  if(v.editable){byId('viewerMove').onclick=()=>viewerMoveCurrent();byId('viewerDelete').onclick=()=>viewerDeleteCurrent()}
  setupImageGestures();
}