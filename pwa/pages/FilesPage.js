// Fichiers — gestionnaire de fichiers local-first.

async function renderFiles(){
  setChrome(false);

  const rows=await Promise.all(state.files.map(async meta=>({meta,row:await DB.get('files',meta.id)})));
  const photoRefs=state.courses.flatMap(c=>c.sections.flatMap(s=>s.sessions.flatMap(q=>q.photoIds.map((id,index)=>({id,index,course:c,section:s,session:q})))))
    .sort((a,b)=>new Date(b.session.createdAt)-new Date(a.session.createdAt));
  let usage='';
  try{const est=await navigator.storage?.estimate?.();if(est?.usage)usage=`${(est.usage/1048576).toFixed(1)} Mo utilisés sur cet appareil`}catch{}
  const synced=rows.filter(r=>r.row?.driveFileId);
  const recentSessions=state.courses.flatMap(c=>c.sections.flatMap(s=>s.sessions.map(q=>({c,s,q})))).sort((a,b)=>new Date(b.q.createdAt)-new Date(a.q.createdAt)).slice(0,3);

  const pdfCard=({meta,row},kind)=>FileCard({id:meta.id,iconName:'fileText',tone:'pink',title:meta.title,meta:`${fmtDate(meta.createdAt)} · ${meta.pages?plural(meta.pages,'page'):'PDF importé'}`,tag:row?.driveFileId?Tag('Drive','mint'):Tag('Local','neutral'),search:meta.title,kind});
  app.innerHTML=`<section class="screen">
    ${PageHeader({title:'Fichiers',large:true})}
    ${SearchBar({id:'fileSearch',placeholder:'Rechercher un fichier...'})}
    <div class="storage-card">
      ${IconBadge('hardDrive','sky','md')}
      <div class="storage-copy"><strong>${plural(state.files.length,'PDF')} · ${plural(photoRefs.length,'photo')}</strong><small>${usage?`${usage} · `:''}<span data-sync-text>${esc(syncIndicator.text)}</span></small></div>
      <button class="icon-btn" data-nav="sync" aria-label="Synchronisation">${icon('cloud',{size:20})}</button>
    </div>
    <div class="action-row">
      ${ActionButton({label:'Importer',id:'importFileAction',variant:'soft',iconName:'upload'})}
      ${ActionButton({label:'Scanner',variant:'capture',iconName:'scan',attrs:'data-nav="capture"'})}
    </div>
    <input id="genericFileImport" type="file" accept=".pdf,application/pdf,image/*" hidden multiple>

    <div id="ocrResults" class="ocr-results" hidden></div>
    <div id="filesContent">
      <div data-filter-group>
        ${SectionTitle('Dossiers',{action:'Voir tout',nav:'courses'})}
        <div class="folder-grid">${state.courses.map((c,i)=>{const v=courseVisual(c,i),s=courseStats(c);return`<button class="folder-card tone-${v.tone}" data-course="${c.id}" data-search="${esc(c.name.toLowerCase())}">${icon('folder',{size:26})}<strong>${esc(c.name)}</strong><small>${plural(s.sessions,'séance')} · ${plural(s.photos,'photo')}</small></button>`}).join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('Récents')}
        <div class="list-stack">${[...rows.slice(0,2).map(r=>pdfCard(r,'recent')),...recentSessions.map(({c,s,q})=>ListCard({iconName:'image',tone:'sky',title:q.title,meta:`${c.name} · ${s.name} · ${plural(q.photoIds.length,'photo')}`,attrs:`data-session-open="${q.id}"`,search:`${q.title} ${c.name}`}))].join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('PDF',{count:rows.length})}
        <div class="list-stack">${rows.map(r=>pdfCard(r,'pdf')).join('')}</div>
      </div>
      <div data-filter-group>
        <div class="section-title-row"><h2 class="section-title files-image-heading">${icon('image',{size:18})}<span>Images</span> <span class="count">${photoRefs.length}</span></h2></div>
        <div class="files-image-groups" id="filesImages"></div>
      </div>
      <div data-filter-group id="exportsGroup">
        ${SectionTitle('Exports',{count:synced.length})}
        <div class="list-stack">${synced.map(r=>pdfCard(r,'export')).join('')}</div>
      </div>
    </div>
    <div id="filesEmpty" hidden>${EmptyState({iconName:'folder',title:'Aucun fichier',text:'Importez un PDF ou capturez vos cours pour commencer.'})}</div>
  </section>`;

  // Images are loaded after the layout so the screen appears instantly.
  const grid=byId('filesImages'),recentPhotos=photoRefs,groups=new Map();
  const imageGroup=ref=>{
    let g=groups.get(ref.session.id);if(g)return g;
    const title=`${ref.course.name} · ${ref.section.name} · ${ref.session.title}`;
    g=document.createElement('section');
    g.className='files-image-session';
    g.dataset.sessionId=ref.session.id;
    g.dataset.search=`${ref.course.name} ${ref.section.name} ${ref.section.type||''} ${ref.session.title}`.toLowerCase();
    g.innerHTML=`<div class="files-image-session-head"><span class="files-image-session-title" title="${esc(title)}">${esc(title)}</span><small>${plural(ref.session.photoIds.length,'photo')}</small></div><div class="image-grid"></div>`;
    grid.appendChild(g);groups.set(ref.session.id,g);return g;
  };
  for(const ref of recentPhotos){
    const url=await photoThumbUrl(ref.id);if(!url||!grid.isConnected)continue;
    const b=document.createElement('div');b.className='image-tile';b.dataset.photoId=ref.id;b.dataset.search=`${ref.session.title} ${ref.course.name} ${ref.section.name} ${ref.section.type||''}`.toLowerCase();
    b.innerHTML=`<button class="image-open" aria-label="Ouvrir ${esc(ref.session.title)}"><img src="${url}" alt="${esc(ref.session.title)}" loading="lazy" decoding="async"></button>`;
    b.querySelector('.image-open').onclick=()=>openPhotoViewer(ref.session.photoIds,ref.session.photoIds.indexOf(ref.id),{title:ref.session.title,source:'session',sourceId:ref.session.id,editable:true,returnView:'files',courseId:ref.course.id,sectionId:ref.section.id,sessionId:ref.session.id});
    attachItemMenu(b,photoMenu(ref.id,()=>onFilesPhotoRemoved(ref.id)));
    imageGroup(ref).querySelector('.image-grid').appendChild(b);
  }

  bindCourseCards();
  bindListFilter({searchId:'fileSearch',scope:'#filesContent',onChange:({shown})=>byId('filesEmpty').hidden=!!shown});
  // The recognised text of photos is searched too.
  byId('fileSearch')?.addEventListener('input',e=>{clearTimeout(renderFiles.t);renderFiles.t=setTimeout(()=>showOcrResults(e.target.value),250)});
  document.querySelectorAll('[data-file-open]').forEach(b=>b.onclick=()=>openPdfViewer(b.dataset.fileOpen,'files'));
  document.querySelectorAll('.file-card').forEach(card=>{const meta=state.files.find(f=>f.id===card.querySelector('[data-file-open]')?.dataset.fileOpen);if(meta)attachItemMenu(card,pdfMenu(meta))});
  document.querySelectorAll('[data-file-menu]').forEach(b=>b.onclick=()=>openFileMenu(b.dataset.fileMenu));
  document.querySelectorAll('[data-session-open]').forEach(b=>b.onclick=()=>{const ctx=findSessionContext(b.dataset.sessionOpen);if(!ctx)return;currentCourseId=ctx.course.id;currentSectionId=ctx.section.id;currentSessionId=ctx.session.id;navigate('session')});
  byId('importFileAction').onclick=()=>byId('genericFileImport').click();
  byId('genericFileImport').onchange=importLocalFiles;
}

// A deleted photo leaves the grid in place: re-rendering the whole screen collapses the page and loses the scroll position.
function onFilesPhotoRemoved(id){
  const grid=byId('filesImages'),tile=currentView==='files'&&[...(grid?.querySelectorAll('.image-tile')||[])].find(t=>t.dataset.photoId===id);
  if(!tile)return render();
  const group=tile.closest('.files-image-session');
  tile.remove();
  if(group){
    const left=group.querySelectorAll('.image-tile').length,badge=group.querySelector('.files-image-session-head small');
    if(badge)badge.textContent=plural(left,'photo');
    if(!left)group.remove();
  }
  const photos=state.courses.reduce((n,c)=>n+c.sections.reduce((m,s)=>m+s.sessions.reduce((k,q)=>k+q.photoIds.length,0),0),0);
  const count=grid.closest('[data-filter-group]')?.querySelector('.section-title .count');if(count)count.textContent=photos;
  const total=document.querySelector('.storage-copy strong');if(total)total.textContent=`${plural(state.files.length,'PDF')} · ${plural(photos,'photo')}`;
}

async function openFileMenu(fileId){
  const meta=state.files.find(f=>f.id===fileId),row=meta?await DB.get('files',fileId):null;
  if(!meta)return;
  if(!row?.blob){showToast('PDF absent de cet appareil : maintenez-le pour le supprimer');return}
  openActionSheet(meta.title,[
    {label:'Ouvrir',iconName:'maximize',onClick:()=>openPdfViewer(fileId,'files')},
    {label:'Partager',iconName:'share',tone:'sky',onClick:()=>sharePdf(meta,row)},
    {label:'Partager avec des personnes Holioo',iconName:'users',tone:'lavender',onClick:()=>sharePdfWithPeople(meta,row)},
    {label:'Publier dans la bibliothèque',iconName:'globe',tone:'mint',onClick:()=>publishPdfToLibrary(meta,row)},
    {label:'Enregistrer une copie',iconName:'download',tone:'mint',onClick:()=>downloadPdf(meta,row)},
    {label:row.driveFileId?'Déjà dans Google Drive':'Synchroniser vers Drive',iconName:'cloud',tone:'peach',onClick:()=>syncPdfNow(meta,row)}
  ],`${fmtDate(meta.createdAt)}${meta.pages?` · ${plural(meta.pages,'page')}`:''}`);
}

// PDFs go to Fichiers; images become a capture batch in Inbox.
async function importLocalFiles(e){
  const files=[...(e.target.files||[])];e.target.value='';
  const pdfs=files.filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name)),images=files.filter(f=>f.type.startsWith('image/'));
  for(const f of pdfs){
    const id=uid(),title=f.name.replace(/\.pdf$/i,'');
    await DB.put('files',{id,blob:f,createdAt:now(),syncState:'pending'});
    state.files.unshift({id,title,fileName:f.name,courseId:null,sessionIds:[],createdAt:now(),pages:null,imported:true});
  }
  if(images.length){
    const ids=[];for(const f of images){const id=uid();await DB.put('photos',{id,blob:f,createdAt:now(),syncState:'pending'});ids.push(id)}
    state.inbox.unshift({id:uid(),title:'Images importées',photoIds:ids,createdAt:now()});
  }
  if(!pdfs.length&&!images.length){showToast('Format non pris en charge — PDF ou images uniquement');return}
  saveState();queueSync();
  showToast([pdfs.length?plural(pdfs.length,'PDF importé','PDF importés'):'',images.length?`${plural(images.length,'image')} dans Captures`:''].filter(Boolean).join(' · '));
  render();
}
