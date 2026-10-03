// Séance — galerie de photos, PDF, publication.
// Galerie or Carnet: the last choice is kept on this device (state.settings.sessionView).
function sessionViewToggle(active){
  return `<div class="session-view-toggle" id="sessionViewToggle" role="tablist" aria-label="Mode d’affichage">
    <button class="view-toggle-btn ${active==='gallery'?'active':''}" type="button" data-session-view="gallery" role="tab" aria-selected="${active==='gallery'}">${icon('image',{size:16})}<span>Galerie</span></button>
    <button class="view-toggle-btn ${active==='notebook'?'active':''}" type="button" data-session-view="notebook" role="tab" aria-selected="${active==='notebook'}">${icon('pencil',{size:16})}<span>Carnet</span></button>
  </div>`;
}

function notebookToolbar(){
  const tool=(name,label,color,active=false)=>`<button class="ink-tool ${active?'active':''}" type="button" data-ink-tool="${name}" title="${esc(label)}" aria-label="${esc(label)}"><span class="ink-swatch" style="--swatch:${color}"></span></button>`;
  return `<div class="ink-toolbar" id="notebookToolbar" aria-label="Outils d’écriture">
    ${tool('pen-black','Stylo noir','#111827',true)}
    ${tool('pen-blue','Stylo bleu','#2563EB')}
    ${tool('pen-red','Stylo rouge','#E5484D')}
    ${tool('highlighter','Surligneur jaune','#FACC15')}
    <button class="ink-tool" type="button" data-ink-eraser title="Gomme" aria-label="Gomme">${icon('eraser',{size:18})}</button>
    <span class="ink-sep" aria-hidden="true"></span>
    ${[['Fin',6],['Moyen',10],['Épais',15]].map(([label,d],i)=>`<button class="ink-tool ink-size" type="button" data-ink-size="${i}" title="Épaisseur : ${label.toLowerCase()}" aria-label="Épaisseur : ${label.toLowerCase()}"><span class="ink-size-dot" style="--d:${d}px"></span></button>`).join('')}
    <span class="ink-sep" aria-hidden="true"></span>
    <button class="ink-tool" type="button" data-ink-ruler title="Règle" aria-label="Règle">${icon('ruler',{size:18})}</button>
    <button class="ink-tool" type="button" id="inkUndo" data-ink-undo title="Annuler" aria-label="Annuler">${icon('undo',{size:18})}</button>
    <button class="ink-tool" type="button" id="inkRedo" data-ink-redo title="Rétablir" aria-label="Rétablir">${icon('redo',{size:18})}</button>
  </div>`;
}

async function renderSession(){
  const ctx=findSessionContext();if(!ctx){navigate('courses');return}
  const{course,section,session}=ctx,n=session.photoIds.length,pub=session.visibility==='public';
  // The phone has no Carnet (the toggle is gone, the Galerie is the only view); the tablet / computer keeps both.
  const phone=!isDesk(),active=!phone&&state.settings?.sessionView==='notebook'?'notebook':'gallery',canWrite=active==='notebook'&&notebookCanEdit();
  const actions=n||active==='notebook'?`<div class="button-stack">
        ${ActionButton({label:'Créer un PDF',id:'buildPdf',iconName:'fileText'})}
        ${n?`${ActionButton({label:pub?'Publiée dans la bibliothèque':'Publier dans la bibliothèque',id:'publishSession',variant:pub?'soft':'ghost',iconName:pub?'checkCircle':'globe'})}
        ${ActionButton({label:'Reconnaître le texte',id:'ocrSession',variant:'ghost',iconName:'scan'})}
        ${ActionButton({label:'Exporter les images',id:'exportImages',variant:'ghost',iconName:'share'})}
        ${ActionButton({label:'Partager avec des personnes Holioo',id:'shareSessionPeople',variant:'ghost',iconName:'users'})}`:''}
        ${ActionButton({label:'Renommer la séance',id:'renameSession',variant:'ghost',iconName:'pencil'})}
      </div>`:'';
  const pdfs=state.files.filter(f=>f.sessionIds?.includes(session.id));
  const pdfRow=pdfs.length?`${SectionTitle('PDF',{count:pdfs.length})}
      <div class="pdf-row" id="sessionPdfs">${pdfs.map(f=>`<div class="thumb pdf-thumb" data-pdf-id="${f.id}" role="button" tabindex="0" aria-label="Ouvrir ${esc(f.title)}"><span class="pdf-thumb-icon">${icon('fileText',{size:30})}</span><strong>${esc(f.title)}</strong><small>${f.pages?esc(plural(f.pages,'page')):'PDF'}</small></div>`).join('')}</div>`:'';
  const galleryView=pdfRow+(n?`${SectionTitle('Galerie',{action:'Plein écran',id:'openFirstPhoto'})}
      <div class="thumbs" id="sessionThumbs"></div>
      <p class="reorder-hint">${icon('more',{size:14})}Maintenez une photo puis faites-la glisser pour changer l’ordre. Touchez la poignée pour la déplacer ou la supprimer.</p>`
    :pdfs.length?'':EmptyState({iconName:'camera',title:'Aucune photo',text:'Cette séance ne contient pas encore de photos.'}));
  const notebookView=active!=='notebook'?'':`${SectionTitle('Carnet',{action:'+ Page blanche',id:'addBlankPage'})}
      ${canWrite?`<div class="session-notebook-help">${icon('pencil',{size:15})}<span>${state.settings.drawWithFinger?'Écrivez au stylet ou au doigt.':'Écrivez au stylet. Le doigt sert à faire défiler la page.'}</span></div>`:''}
      <div class="notebook" id="sessionNotebook"></div>
      ${canWrite?notebookToolbar():''}`;
  app.innerHTML=`<section class="screen${active==='notebook'?' screen-wide':''}">
    ${PageHeader({back:true,title:`${course.name} · ${section.name}`})}
    ${PageIntro({eyebrow:'SÉANCE',title:session.title,subtitle:`${plural(n,'photo')} · ${fmtDate(session.createdAt)}`})}
    ${ActionButton({label:n?'Ajouter des photos':'Prendre des photos',id:'addSessionPhotos',variant:'capture',iconName:'camera',attrs:'data-nav="capture"'})}
    ${phone?'':sessionViewToggle(active)}
    <div class="session-gallery-view ${active==='gallery'?'':'hidden'}">${galleryView}</div>
    <div class="session-notebook-view ${active==='notebook'?'':'hidden'}">${notebookView}</div>
    ${actions}
  </section>`;
  byId('backBtn').onclick=()=>navigate('section');
  byId('sessionViewToggle')?.addEventListener('click',async e=>{
    const next=e.target.closest('[data-session-view]')?.dataset.sessionView;
    if(!next||next===active)return;
    state.settings.sessionView=next;saveState();
    await render();
  });
  if(pdfs.length){
    const row=byId('sessionPdfs'),open=id=>openPdfViewer(id,'session');
    row.querySelectorAll('[data-pdf-id]').forEach(card=>{
      const meta=state.files.find(f=>f.id===card.dataset.pdfId);if(!meta)return;
      card.onclick=e=>{if(!e.target.closest('[data-reorder-handle]'))open(meta.id)};
      card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===card){e.preventDefault();open(meta.id)}};
      attachItemMenu(card,pdfSessionMenu(meta),{press:false});
    });
    // Same ⋯ grip as the photos (Déplacer / Supprimer); dragging a card only changes the order of this row.
    makeReorderable(row,{itemSelector:'[data-pdf-id]',idAttribute:'pdfId',onHandle:itemMenuFromHandle,onChange:ids=>{
      const slots=state.files.map((f,i)=>ids.includes(f.id)?i:-1).filter(i=>i>=0),byIdMap=new Map(state.files.map(f=>[f.id,f]));
      ids.forEach((id,k)=>{state.files[slots[k]]=byIdMap.get(id)});saveState();queueSync();showToast('Ordre enregistré');
    }});
  }
  if(active==='gallery'&&n){
    await fillSessionThumbs(session);
    byId('openFirstPhoto').onclick=()=>openPhotoViewer(session.photoIds,0,{title:session.title,source:'session',sourceId:session.id,editable:true,returnView:'session',courseId:course.id,sectionId:section.id,sessionId:session.id});
  }
  if(active==='notebook'){
    await renderSessionNotebook({course,section,session});
    byId('addBlankPage')?.addEventListener('click',async()=>{
      addBlankNotebookBlock(notebookRuntime.doc,notebookSelectedBlockId);
      await saveNotebookDoc(notebookRuntime.doc);
      await renderSessionNotebook({course,section,session});
      [...document.querySelectorAll('.notebook-block')].find(b=>b.dataset.blockId===notebookSelectedBlockId)?.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }
  byId('buildPdf')?.addEventListener('click',()=>navigate('pdfBuilder'));
  byId('ocrSession')?.addEventListener('click',()=>recognizeSessionText(session));
  byId('exportImages')?.addEventListener('click',()=>exportSessionImages(course,section,session));
  byId('shareSessionPeople')?.addEventListener('click',()=>shareSessionWithPeople(course,section,session));
  if(n)updateSessionOcrLabel(session);
  byId('publishSession')?.addEventListener('click',()=>publishSession(course,section,session));
  byId('renameSession')?.addEventListener('click',()=>openSheet({title:'Renommer la séance',body:Field({label:'Titre',id:'renameValue',value:session.title}),onConfirm:()=>{const title=byId('renameValue').value.trim()||session.title;if(title!==session.title){const problem=sessionTitleProblem(section,title,session.id);if(problem){showToast(problem);return false}}session.title=title;saveState();render();queueSync();return true}}));
}
