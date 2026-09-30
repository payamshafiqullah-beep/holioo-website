// Créer un PDF — sélection de séances, ordre des photos et options de mise en page.
let pdfBuilderUrls=[];

function renderPdfBuilder(){
  for(const url of pdfBuilderUrls)URL.revokeObjectURL(url);
  pdfBuilderUrls=[];

  const ctx=findSessionContext();if(!ctx){navigate('files');return}
  const{course,session}=ctx;
  const allSessions=course.sections.flatMap(s=>s.sessions.map(q=>({section:s,session:q}))).filter(x=>x.session.photoIds.length);
  const photoContext=new Map();
  for(const entry of allSessions)for(const id of entry.session.photoIds)photoContext.set(id,entry);

  let photoOrder=[];
  let orderRenderToken=0;
  const toggle=(id,title,meta,checked=true)=>`<label class="toggle-card"><span class="list-card-copy"><strong>${title}</strong><small>${meta}</small></span><input type="checkbox" id="${id}" class="switch" ${checked?'checked':''}></label>`;

  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:course.name,actions:false})}
    ${PageIntro({eyebrow:'PDF',title:'Créer un PDF',subtitle:'Sélectionnez une ou plusieurs séances du même cours.'})}
    <div class="form-card">${Field({label:'Titre du document',id:'pdfTitle',value:`${course.name} — ${session.title}`})}</div>
    ${SectionTitle('Séances')}
    <div class="list-stack">${allSessions.map(({section,session:q})=>`<label class="check-card"><input type="checkbox" class="pdfSession" value="${q.id}" ${q.id===session.id?'checked':''}>${IconBadge('layers',sectionTone(section.name),'sm')}<span class="list-card-copy"><strong>${esc(q.title)}</strong><small>${esc(section.name)} · ${plural(q.photoIds.length,'photo')}</small></span><i class="check-mark">${icon('check',{size:16,stroke:2.6})}</i></label>`).join('')}</div>

    ${SectionTitle('Ordre des photos')}
    <p class="lead">Maintenez une photo ou faites glisser sa poignée à l’endroit souhaité. L’ordre affiché sera celui du PDF.</p>
    <div class="thumbs compact pdf-order-grid" id="pdfPhotoOrder" aria-label="Ordre des photos du PDF"></div>

    ${SectionTitle('Mise en page')}
    <div class="list-stack">
      ${toggle('pdfCover','Page de couverture','Page de titre sans photo, au début du PDF',false)}
      ${toggle('pdfToc','Table des matières','Liste des séances, sans photo',false)}
      ${toggle('pdfNumbers','Numéroter les pages','« 3 / 12 » en bas de chaque page')}
      ${toggle('pdfSearchable','Texte recherchable','Le texte reconnu sur l’appareil est ajouté (invisible) : recherche et copie dans le PDF')}
    </div>
    ${SectionTitle('Export')}
    <div class="form-card">
      <div class="field"><label for="pdfPageSize">Format des pages</label><select id="pdfPageSize"><option value="a4">A4</option><option value="letter">Letter (US)</option><option value="image">Adapté à chaque photo</option></select></div>
      <div class="field"><label for="pdfQuality">Qualité</label><select id="pdfQuality"><option value="high">Haute (fichier plus lourd)</option><option value="standard" selected>Standard</option><option value="small">Compacte (pour l’envoyer)</option></select></div>
      <p class="field-note" id="pdfOcrNote"></p>
    </div>
    ${ActionButton({label:'Générer le PDF',id:'generatePdf',iconName:'fileText'})}
  </section>`;

  const selectedSessionIds=()=>new Set([...document.querySelectorAll('.pdfSession:checked')].map(x=>x.value));

  const syncPhotoOrder=()=>{
    const selected=selectedSessionIds();
    const allowed=[];
    for(const {session:q} of allSessions)if(selected.has(q.id))allowed.push(...q.photoIds);
    const allowedSet=new Set(allowed);
    photoOrder=photoOrder.filter(id=>allowedSet.has(id));
    const existing=new Set(photoOrder);
    for(const id of allowed)if(!existing.has(id)){photoOrder.push(id);existing.add(id)}
    renderPhotoOrder();
  };

  const renderPhotoOrder=async()=>{
    const host=byId('pdfPhotoOrder');if(!host)return;
    const token=++orderRenderToken;
    for(const url of pdfBuilderUrls)URL.revokeObjectURL(url);
    pdfBuilderUrls=[];
    host._reorder?.destroy();
    host.innerHTML='';

    for(let i=0;i<photoOrder.length;i++){
      const id=photoOrder[i],url=await photoThumbUrl(id);
      if(token!==orderRenderToken)return;
      if(!url)continue;
      pdfBuilderUrls.push(url);
      const entry=photoContext.get(id);
      const card=document.createElement('div');
      card.className='thumb selected pdf-order-thumb';
      card.dataset.photoId=id;
      card.innerHTML=`<img src="${url}" alt="Photo ${i+1}" draggable="false" decoding="async"><span class="num">${i+1}</span><span class="pdf-order-hint" aria-hidden="true">${icon('more',{size:18})}</span>`;
      card.title=entry?`${entry.section.name} · ${entry.session.title}`:'';
      host.appendChild(card);
    }
    makeReorderable(host,{onChange:ids=>{photoOrder=ids}});
  };

  byId('backBtn').onclick=()=>navigate('session');
  document.querySelectorAll('.pdfSession').forEach(cb=>cb.addEventListener('change',syncPhotoOrder));
  byId('generatePdf').onclick=async()=>{
    const ids=[...document.querySelectorAll('.pdfSession:checked')].map(x=>x.value);
    if(!ids.length){showToast('Sélectionnez au moins une séance');return}
    await generatePdfFile(course,ids,{
      title:byId('pdfTitle').value.trim()||course.name,
      cover:byId('pdfCover').checked,
      toc:byId('pdfToc').checked,
      numbers:byId('pdfNumbers').checked,
      searchable:byId('pdfSearchable').checked,
      pageSize:byId('pdfPageSize').value,
      quality:byId('pdfQuality').value,
      photoOrder:[...photoOrder]
    })
  };

  // Last export settings are remembered.
  const prefs=state.pdfPrefs||{};
  if(prefs.pageSize)byId('pdfPageSize').value=prefs.pageSize;
  if(prefs.quality)byId('pdfQuality').value=prefs.quality;
  ['pdfPageSize','pdfQuality'].forEach(id=>byId(id).onchange=()=>{state.pdfPrefs={pageSize:byId('pdfPageSize').value,quality:byId('pdfQuality').value};saveState()});
  syncPhotoOrder();
  updatePdfOcrNote([...photoOrder]);
}

// How many photos already have their text recognised (for the searchable PDF).
async function updatePdfOcrNote(ids){
  const el=byId('pdfOcrNote');if(!el)return;
  let n=0;for(const id of ids){if(await Ocr.get(id))n++}
  if(!byId('pdfOcrNote'))return;
  el.innerHTML=ids.length&&n<ids.length?`${n}/${ids.length} photo(s) avec texte reconnu. <button class="link-btn" id="pdfRunOcr">Reconnaître le texte maintenant</button>`:ids.length?`Texte reconnu sur toutes les photos (${n}).`:'';
  byId('pdfRunOcr')?.addEventListener('click',()=>{Ocr.enqueue(ids);showToast('Reconnaissance du texte en arrière-plan…');const off=Ocr.subscribe(s=>{if(!byId('pdfOcrNote')){off();return}if(!s.pending){off();updatePdfOcrNote(ids)}})});
}
