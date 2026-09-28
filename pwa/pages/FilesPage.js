function fileKindVisual(title=''){
  const n=title.toLowerCase();
  if(n.endsWith('.pdf')||n.includes('pdf'))return{tone:'pink',label:'PDF',icon:'PDF'};
  if(n.endsWith('.png')||n.endsWith('.jpg')||n.endsWith('.jpeg'))return{tone:'mint',label:'IMG',icon:'▧'};
  return{tone:'sky',label:'DOC',icon:'▤'}
}
async function renderFiles(){
  setChrome(false);appShell.classList.add('pastel-main-view');
  app.innerHTML=`
    <section class="pastel-screen files-pastel">
      ${pastelBrandHeader({kicker:'Bonjour 👋',title:'Vos fichiers au même endroit',subtitle:'Importez, organisez et retrouvez facilement tous vos documents de cours.'})}
      <label class="pastel-search"><span>⌕</span><input id="fileSearch" type="search" placeholder="Rechercher un fichier, un dossier..."></label>
      <div class="pastel-action-grid">
        <button class="pastel-action-card sky" id="importFileAction"><span class="pastel-action-icon">⇧</span><div><strong>Importer des fichiers</strong><small>PDF, images, documents...</small></div><b>›</b></button>
        <button class="pastel-action-card peach" data-nav="capture"><span class="pastel-action-icon">●</span><div><strong>Scanner des documents</strong><small>Avec votre appareil photo</small></div><b>›</b></button>
      </div>
      ${sectionHeading('Mes dossiers','Voir tout','courses')}
      <div class="pastel-folder-grid">
        ${state.courses.slice(0,3).map((c,i)=>`<button class="pastel-folder-card ${['sky','lavender','mint'][i%3]}" data-course="${c.id}"><span class="folder-shape"></span><strong>${esc(c.name)}</strong><small>${c.sections.reduce((a,s)=>a+s.sessions.length,0)} séances</small><em>•••</em></button>`).join('')||'<div class="pastel-empty-wide">Aucun dossier de cours.</div>'}
      </div>
      ${sectionHeading('Fichiers récents','Voir tout','files')}
      <div class="pastel-file-list" id="pastelFileList"></div>
      <input id="genericFileImport" type="file" accept=".pdf,image/*,.doc,.docx" hidden multiple>
    </section>`;
  bindCourseCards();
  const list=byId('pastelFileList');
  const rows=[];
  for(const meta of state.files){
    const row=await DB.get('files',meta.id),visual=fileKindVisual(meta.title);
    rows.push({meta,row,visual})
  }
  const draw=(query='')=>{
    const q=query.trim().toLowerCase(),items=rows.filter(x=>!q||x.meta.title.toLowerCase().includes(q));
    list.innerHTML=items.length?items.map(({meta,row,visual})=>`<button class="pastel-file-row" data-file-id="${meta.id}">
      <span class="pastel-file-icon ${visual.tone}">${visual.icon}</span>
      <span class="pastel-file-copy"><strong>${esc(meta.title)}</strong><small>${fmtDate(meta.createdAt)} • ${meta.pages||'—'} pages</small></span>
      <span class="pastel-file-state">${row?.driveFileId?'Drive':'Local'}</span><span class="pastel-row-menu">•••</span>
    </button>`).join(''):'<div class="pastel-empty-wide">Aucun fichier pour le moment.</div>';
    document.querySelectorAll('[data-file-id]').forEach(b=>b.onclick=()=>openPdfViewer(b.dataset.fileId,'files'))
  };
  draw();
  byId('fileSearch').oninput=e=>draw(e.target.value);
  byId('importFileAction').onclick=()=>byId('genericFileImport').click();
  byId('genericFileImport').onchange=e=>{if(e.target.files?.length)showToast('Import prêt — utilisez Capture ou vos sessions pour classer les fichiers')}
}
