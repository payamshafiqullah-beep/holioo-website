// Lecteur PDF plein écran.
async function renderPdfViewer(){
  setChrome(true);
  const meta=state.files.find(f=>f.id===currentFileId),row=meta?await DB.get('files',meta.id):null;
  if(!meta||!row?.blob){showToast('PDF introuvable sur cet appareil');navigate('files');return}
  revokeViewerUrl();viewerObjectUrl=URL.createObjectURL(row.blob);
  const status=row.driveFileId?{label:'Drive',tone:'mint'}:row.syncState==='drive_full'?{label:'Drive plein',tone:'pink'}:row.syncState==='error'?{label:'Erreur',tone:'pink'}:{label:'Local',tone:'neutral'};
  const course=state.courses.find(c=>c.id===meta.courseId);
  app.innerHTML=`<div class="pdf-viewer">
    <header class="page-header">
      <div class="page-header-left"><button class="icon-btn" id="pdfBack" aria-label="Retour">${icon('chevronLeft',{size:22})}</button><span class="viewer-title"><strong>${esc(meta.title)}</strong><small>${esc(course?.name||'PDF')} · <span id="pdfPageCount">${meta.pages?plural(meta.pages,'page'):'—'}</span></small></span></div>
      <div class="page-header-right">${Tag(status.label,status.tone)}<button class="icon-btn danger" id="pdfDelete" aria-label="Supprimer le PDF">${icon('trash',{size:22})}</button></div>
    </header>
    <div class="pdf-frame-wrap"><div class="pdf-pages" id="pdfPages"><p class="pdf-loading">Chargement du PDF…</p></div></div>
    <div class="viewer-dock">
      <button class="dock-btn" id="pdfShare">${icon('share',{size:22})}<small>Partager</small></button>
      <button class="dock-btn" id="pdfPublish">${icon('globe',{size:22})}<small>Bibliothèque</small></button>
      <button class="dock-btn" id="pdfDrive">${icon('cloud',{size:22})}<small>${row.driveFileId?'Déjà dans Drive':'Synchroniser vers Drive'}</small></button>
      <button class="dock-btn" id="pdfDownload">${icon('download',{size:22})}<small>Enregistrer une copie</small></button>
    </div>
  </div>`;
  byId('pdfBack').onclick=()=>{revokeViewerUrl();navigate(currentPdfReturnView||'files')};
  byId('pdfDelete').onclick=()=>confirmDeletePdf(meta.id,currentPdfReturnView);
  byId('pdfShare').onclick=()=>sharePdf(meta,row);
  byId('pdfPublish').onclick=()=>publishPdfToLibrary(meta,row);
  byId('pdfDrive').onclick=()=>syncPdfNow(meta,row);
  byId('pdfDownload').onclick=()=>downloadPdf(meta,row);
  const host=byId('pdfPages');
  try{
    await renderPdfPages(row.blob,host,{onCount:n=>{byId('pdfPageCount')&&(byId('pdfPageCount').textContent=plural(n,'page'));if(meta.pages!==n){meta.pages=n;saveState()}}});
  }catch(e){
    // Offline before pdf.js was ever cached: fall back to the browser's own viewer.
    console.warn(e);if(!host.isConnected)return;
    host.parentElement.innerHTML=`<iframe title="${esc(meta.title)}" src="${viewerObjectUrl}#toolbar=0&navpanes=0"></iframe><a class="pdf-fallback" href="${viewerObjectUrl}" target="_blank" rel="noopener">${icon('maximize',{size:16})}Ouvrir le PDF en plein écran</a>`;
  }
}
