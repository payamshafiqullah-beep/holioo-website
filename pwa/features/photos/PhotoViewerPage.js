// Visionneuse photo plein écran (glisser, pincer, double-toucher).
async function renderPhotoViewer(){
  setChrome(true);
  const v=currentPhotoViewer;if(!v?.ids?.length){navigate(v?.returnView||'home');return}
  const id=v.ids[v.index],row=await photoRow(id);
  if(!row?.blob){showToast('Photo introuvable');v.ids=v.ids.filter(x=>x!==id);v.index=Math.max(0,Math.min(v.index,v.ids.length-1));if(!v.ids.length){navigate(v.returnView||'home');return}return renderPhotoViewer()}
  revokeViewerUrl();viewerObjectUrl=URL.createObjectURL(photoBlob(row));
  const status=photoStatusLabel(row);
  app.innerHTML=`<div class="media-viewer" id="mediaViewer">
    <div class="viewer-topbar">
      <button class="glass-btn" id="viewerBack" aria-label="Retour">${icon('chevronLeft',{size:22})}</button>
      <div class="viewer-heading"><b>${esc(v.title)}</b><span>${v.index+1} / ${v.ids.length}</span></div>
      <span class="badge ${status.cls}">${status.label}</span>
    </div>
    <div class="viewer-stage" id="viewerStage">
      <img id="viewerImage" src="${viewerObjectUrl}" alt="Photo ${v.index+1}" draggable="false">
      <button class="viewer-arrow left" id="viewerPrev" aria-label="Photo précédente">${icon('chevronLeft',{size:24})}</button>
      <button class="viewer-arrow right" id="viewerNext" aria-label="Photo suivante">${icon('chevronRight',{size:24})}</button>
    </div>
    <div class="viewer-dock dark"><button class="dock-btn edit" id="viewerEdit">${icon('crop',{size:22})}<small>Modifier</small></button><button class="dock-btn" id="viewerText">${icon('fileText',{size:22})}<small>Texte</small></button>${v.editable?`${v.source==='session'?`<button class="dock-btn" id="viewerMove">${icon('arrowUpRight',{size:22})}<small>Déplacer</small></button>`:''}<button class="dock-btn danger" id="viewerDelete">${icon('trash',{size:22})}<small>Supprimer</small></button>`:''}</div>
  </div>`;
  byId('viewerBack').onclick=()=>{revokeViewerUrl();currentCourseId=v.courseId;currentSectionId=v.sectionId;currentSessionId=v.sessionId;navigate(v.returnView||'home')};
  byId('viewerPrev').disabled=v.index===0;byId('viewerNext').disabled=v.index===v.ids.length-1;
  byId('viewerPrev').onclick=()=>viewerStep(-1);byId('viewerNext').onclick=()=>viewerStep(1);
  // Crop, straighten, perspective and filters; the original photo is always kept.
  byId('viewerText').onclick=()=>openPhotoText(v.ids[v.index]);
  byId('viewerEdit').onclick=()=>openPhotoEditor({ids:v.ids,index:v.index,fromEl:byId('viewerImage'),onSaved:()=>{if(currentView==='photoViewer')renderPhotoViewer()}});
  if(v.editable){if(byId('viewerMove'))byId('viewerMove').onclick=()=>viewerMoveCurrent();byId('viewerDelete').onclick=()=>viewerDeleteCurrent()}
  setupImageGestures();
}
