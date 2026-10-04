// Lecteur PDF plein écran.
async function renderPdfViewer(){
  setChrome(!isDesk());   // tablet / computer: the toolbar and the matières sidebar stay in the normal view; only fullscreen hides them
  const meta=state.files.find(f=>f.id===currentFileId),row=meta?await DB.get('files',meta.id):null;
  if(!meta||!row?.blob){showToast('PDF introuvable sur cet appareil');navigate('files');return}
  revokeViewerUrl();viewerObjectUrl=URL.createObjectURL(row.blob);
  const status=row.driveFileId?{label:'Drive',tone:'mint'}:row.syncState==='drive_full'?{label:'Drive plein',tone:'pink'}:row.syncState==='error'?{label:'Erreur',tone:'pink'}:{label:'Local',tone:'neutral'};
  const course=state.courses.find(c=>c.id===meta.courseId);
  app.innerHTML=`<div class="pdf-viewer${isDesk()?' pdf-ink-desk':''}">
    <header class="page-header">
      <div class="page-header-left"><button class="icon-btn" id="pdfBack" aria-label="Retour">${icon('chevronLeft',{size:22})}</button><span class="viewer-title"><strong>${esc(meta.title)}</strong><small>${esc(course?.name||'PDF')} · <span id="pdfPageCount">${meta.pages?plural(meta.pages,'page'):'—'}</span></small></span></div>
      <div class="page-header-right">${Tag(status.label,status.tone)}<button class="icon-btn danger" id="pdfDelete" aria-label="Supprimer le PDF">${icon('trash',{size:22})}</button></div>
    </header>
    <div class="pdf-frame-wrap"><div class="pdf-pages" id="pdfPages"><p class="pdf-loading">Chargement du PDF…</p></div>
      <button class="pdf-fs-btn" id="pdfFullscreen" type="button" aria-label="Plein écran" aria-pressed="false">${icon('maximize',{size:20})}</button>
      <button class="pdf-corner-back" id="pdfCornerBack" type="button" aria-label="Retour">${icon('chevronLeft',{size:20})}</button>
      <output class="pdf-pill" id="pdfPill" aria-live="polite">1 / 1</output>
      <div class="pdf-pager" id="pdfPager" hidden>
        <button type="button" id="pdfPrev" aria-label="Page précédente">${icon('chevronLeft',{size:18})}</button>
        <output id="pdfPageNow" aria-live="polite">1 / 1</output>
        <button type="button" id="pdfNext" aria-label="Page suivante">${icon('chevronRight',{size:18})}</button>
        <span class="pdf-pager-sep"></span>
        <button type="button" id="pdfZoomOut" aria-label="Zoom arrière">−</button>
        <output id="pdfZoomNow">100 %</output>
        <button type="button" id="pdfZoomIn" aria-label="Zoom avant">+</button>
      </div></div>
    <div class="viewer-dock">
      <button class="dock-btn" id="pdfShare">${icon('share',{size:22})}<small>Partager</small></button>
      <button class="dock-btn" id="pdfSharePeople">${icon('users',{size:22})}<small>Avec Holioo</small></button>
      <button class="dock-btn" id="pdfPublish">${icon('globe',{size:22})}<small>Bibliothèque</small></button>
      <button class="dock-btn" id="pdfDrive">${icon('cloud',{size:22})}<small>${row.driveFileId?'Déjà dans Drive':'Synchroniser vers Drive'}</small></button>
      <button class="dock-btn" id="pdfDownload">${icon('download',{size:22})}<small>Enregistrer une copie</small></button>
    </div>
  </div>`;
  byId('pdfDelete').onclick=()=>confirmDeletePdf(meta.id,currentPdfReturnView);
  byId('pdfShare').onclick=()=>sharePdf(meta,row);
  byId('pdfSharePeople').onclick=()=>sharePdfWithPeople(meta,row);
  byId('pdfPublish').onclick=()=>publishPdfToLibrary(meta,row);
  byId('pdfDrive').onclick=()=>syncPdfNow(meta,row);
  byId('pdfDownload').onclick=()=>downloadPdf(meta,row);
  const host=byId('pdfPages'),viewer=document.querySelector('.pdf-viewer'),fsBtn=byId('pdfFullscreen');
  // Last page, scroll position and zoom are kept per PDF on this device and restored on reopening.
  const posKey=`holioo.pdfpos.${meta.id}`;
  let saved={};try{saved=JSON.parse(localStorage.getItem(posKey)||'{}')||{}}catch{}
  let ctl=null,ink=null;
  const savePos=()=>{if(!ctl||!host.isConnected)return;try{localStorage.setItem(posKey,JSON.stringify({page:ctl.page(),ratio:+ctl.pageRatio().toFixed(3),zoom:+ctl.zoom.toFixed(2)}))}catch{}};
  // Full screen: the real Fullscreen API where it exists, always the immersive layout (header and dock hidden; iPhone has no element fullscreen).
  const setImmersive=on=>{viewer.classList.toggle('pdf-immersive',on);if(isDesk())setChrome(on);fsBtn.setAttribute('aria-pressed',String(on));fsBtn.setAttribute('aria-label',on?'Quitter le plein écran':'Plein écran');fsBtn.innerHTML=icon(on?'minimize':'maximize',{size:20});ink?.fullscreen(on||isDesk());setTimeout(()=>host.dispatchEvent(new Event('scroll')),50)};
  const onFsChange=()=>{if(!document.fullscreenElement&&viewer.classList.contains('pdf-immersive'))setImmersive(false)};
  document.addEventListener('fullscreenchange',onFsChange);
  fsBtn.onclick=async()=>{
    const on=!viewer.classList.contains('pdf-immersive');setImmersive(on);
    try{if(on)await viewer.requestFullscreen?.();else if(document.fullscreenElement)await document.exitFullscreen()}catch{}
  };
  const leave=()=>{savePos();ink?.flush();document.removeEventListener('fullscreenchange',onFsChange);if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{})};
  byId('pdfCornerBack').onclick=()=>fsBtn.click();   // fullscreen: back = leave fullscreen only, no navigation
  byId('pdfBack').onclick=()=>{leave();revokeViewerUrl();navigate(currentPdfReturnView||'files')};
  window.addEventListener('pagehide',()=>{savePos();ink?.flush()},{once:true});
  try{
    ctl=await renderPdfPages(row.blob,host,{zoom:saved.zoom||1,page:saved.page||1,ratio:saved.ratio||0,
      onCount:n=>{byId('pdfPageCount')&&(byId('pdfPageCount').textContent=plural(n,'page'));if(meta.pages!==n){meta.pages=n;saveState()}},
      onPage:(n,total,info)=>{
        const now=byId('pdfPageNow');if(!now)return;now.textContent=`${n} / ${total}`;byId('pdfPill').textContent=`${n} / ${total}`;
        byId('pdfZoomNow').textContent=`${Math.round((ctl?.zoom??saved.zoom??1)*100)} %`;
        if(info?.settled||info?.zoom)savePos();
      }});
    if(!ctl||!host.isConnected)return;
    try{ink=await createPdfInk({fileId:meta.id,host,boxes:ctl.boxes,aspects:ctl.aspects,viewer,frame:host.parentElement})}catch(err){console.warn(err)}   // no ink must never cost the reader
    if(!host.isConnected){ink?.destroy();return}
    ink?.fullscreen(viewer.classList.contains('pdf-immersive')||isDesk());   // tablet / computer: pen, highlighter and eraser work in the normal view too
    byId('pdfPager').hidden=false;
    byId('pdfZoomNow').textContent=`${Math.round(ctl.zoom*100)} %`;
    byId('pdfPrev').onclick=()=>ctl.goTo(Math.max(1,(ctl.pageRatio()>.05?ctl.page():ctl.page()-1)));
    byId('pdfNext').onclick=()=>ctl.goTo(Math.min(ctl.count,ctl.page()+1));
    byId('pdfZoomOut').onclick=()=>ctl.setZoom(ctl.zoom/1.25);
    byId('pdfZoomIn').onclick=()=>ctl.setZoom(ctl.zoom*1.25);
  }catch(e){
    // Offline before pdf.js was ever cached: fall back to the browser's own viewer.
    console.warn(e);if(!host.isConnected)return;
    host.parentElement.innerHTML=`<iframe title="${esc(meta.title)}" src="${viewerObjectUrl}#toolbar=0&navpanes=0"></iframe><a class="pdf-fallback" href="${viewerObjectUrl}" target="_blank" rel="noopener">${icon('maximize',{size:16})}Ouvrir le PDF en plein écran</a>`;
  }
}
