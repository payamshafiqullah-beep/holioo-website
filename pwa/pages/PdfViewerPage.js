async function renderPdfViewer(){
  setChrome(true);
  const meta=state.files.find(f=>f.id===currentFileId),row=meta?await DB.get('files',meta.id):null;
  if(!meta||!row?.blob){showToast('PDF introuvable sur cet appareil');navigate('files');return}
  revokeViewerUrl();viewerObjectUrl=URL.createObjectURL(row.blob);
  const status=row.driveFileId?{label:'DRIVE',cls:'green'}:row.syncState==='drive_full'?{label:'DRIVE PLEIN',cls:'coral'}:row.syncState==='error'?{label:'ERREUR',cls:'coral'}:{label:'LOCAL',cls:'gray'};
  const course=state.courses.find(c=>c.id===meta.courseId);
  app.innerHTML=`<div class="pdf-viewer-page">
    <div class="pdf-viewer-head">
      <button class="viewer-icon light" id="pdfBack" aria-label="Retour">‹</button>
      <div class="grow"><div class="pdf-viewer-title">${esc(meta.title)}</div><div class="meta">${esc(course?.name||'PDF')} • ${meta.pages||'—'} pages</div></div>
      <span class="badge ${status.cls}">${status.label}</span>
    </div>
    <div class="pdf-frame-wrap">
      <iframe id="pdfFrame" title="${esc(meta.title)}" src="${viewerObjectUrl}#toolbar=0&navpanes=0"></iframe>
      <a class="pdf-fallback" href="${viewerObjectUrl}" target="_blank" rel="noopener">Ouvrir le PDF en plein écran</a>
    </div>
    <div class="pdf-viewer-actions">
      <button class="btn primary" id="pdfShare">Partager</button>
      <button class="btn green" id="pdfDrive">${row.driveFileId?'Déjà dans Drive':'Synchroniser vers Drive'}</button>
      <button class="btn ghost" id="pdfDownload">Enregistrer une copie</button>
    </div>
  </div>`;
  byId('pdfBack').onclick=()=>{revokeViewerUrl();navigate(currentPdfReturnView||'files')};
  byId('pdfShare').onclick=()=>sharePdf(meta,row);
  byId('pdfDrive').onclick=()=>syncPdfNow(meta,row);
  byId('pdfDownload').onclick=()=>downloadPdf(meta,row);
}