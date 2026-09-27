async function renderFiles(){
  app.innerHTML=`${pageHead('Fichiers','Ouvrez les PDF directement dans Holioo, puis choisissez de partager ou de synchroniser.','FICHIERS')}<div class="grid" id="fileList"></div>`;
  if(!state.files.length){byId('fileList').innerHTML='<div class="card empty"><div class="empty-icon">▱</div>Aucun PDF pour le moment.</div>';return}
  for(const f of state.files){
    const row=await DB.get('files',f.id),el=document.createElement('button');el.className='card row card-button';
    const status=row?.driveFileId?{label:'DRIVE',cls:'green'}:row?.syncState==='drive_full'?{label:'DRIVE PLEIN',cls:'coral'}:row?.syncState==='error'?{label:'ERREUR',cls:'coral'}:{label:'LOCAL',cls:'gray'};
    el.innerHTML=`<span class="pdf-icon">PDF</span><span class="grow"><span class="title">${esc(f.title)}</span><span class="meta">${f.pages||'—'} pages • ${fmtDate(f.createdAt)}</span></span><span class="badge ${status.cls}">${status.label}</span><span class="chev">›</span>`;
    el.onclick=()=>openPdfViewer(f.id,'files');
    byId('fileList').appendChild(el);
  }
}