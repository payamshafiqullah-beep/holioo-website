'use strict';
// Recognised text (features/ocr.js) in the screens, and exporting a session's images.

// Viewer "Texte": the text of this photo, to read or copy; recognised on demand if needed.
async function openPhotoText(photoId){
  const o=await Ocr.get(photoId),row=await DB.get('photos',photoId);
  if(o?.text){
    const stale=row&&(o.editedAt||null)!==(row.editedAt||null);
    openSheet({title:'Texte reconnu',subtitle:stale?'La photo a changé depuis : le texte va être mis à jour.':'Reconnu sur cet appareil (français et anglais).',
      body:`<textarea class="ocr-text" readonly rows="12">${esc(o.text)}</textarea>`,confirmText:'Copier le texte',secondaryText:'Fermer',
      onConfirm:()=>{navigator.clipboard?.writeText(o.text).then(()=>showToast('Texte copié')).catch(()=>{});return true}});
    if(stale)Ocr.enqueue(photoId);
    return;
  }
  if(o&&!o.text){showToast('Aucun texte trouvé sur cette photo');return}
  Ocr.enqueue(photoId);
  showToast(Ocr.pending()>1?`Reconnaissance du texte… (${Ocr.pending()} en attente)`:'Reconnaissance du texte… Le premier usage télécharge le module (~7 Mo).');
  const off=Ocr.subscribe(async s=>{if(s.current===photoId||Ocr.pending())return;off();const r=await Ocr.get(photoId);if(currentView==='photoViewer')showToast(r?.text?'Texte reconnu — touchez « Texte »':'Aucun texte trouvé')});
}

async function sessionOcrCount(session){
  let done=0;for(const id of session.photoIds){const o=await Ocr.get(id);if(o)done++}
  return done;
}
async function updateSessionOcrLabel(session){
  const btn=byId('ocrSession');if(!btn)return;
  const done=await sessionOcrCount(session),n=session.photoIds.length,label=btn.querySelector('span:last-child')||btn;
  const pending=Ocr.pending();
  label.textContent=pending?`Reconnaissance du texte… ${done}/${n}`:done===n?`Texte reconnu (${n}/${n})`:done?`Reconnaître le texte (${done}/${n})`:'Reconnaître le texte';
}
function recognizeSessionText(session){
  if(!session.photoIds.length)return;
  Ocr.enqueue(session.photoIds);
  showToast('Reconnaissance du texte en arrière-plan. Vous pouvez continuer à utiliser Holioo.');
  const off=Ocr.subscribe(()=>{if(currentView!=='session'){off();return}updateSessionOcrLabel(session);if(!Ocr.pending())off()});
  updateSessionOcrLabel(session);
}

// Files search: photos whose recognised text matches.
async function showOcrResults(q){
  const box=byId('ocrResults');if(!box)return;
  if(String(q||'').trim().length<3){box.hidden=true;box.innerHTML='';return}
  const found=await Ocr.search(q);
  if(byId('fileSearch')?.value!==q)return;
  const items=[];
  for(const r of found){
    let ctx=null;for(const c of state.courses)for(const s of c.sections)for(const q2 of s.sessions)if(q2.photoIds.includes(r.photoId))ctx={course:c,section:s,session:q2};
    if(ctx)items.push({...r,ctx});
  }
  // Typed notes (features/notes.js) match too.
  const notes=typeof searchNotes==='function'?await searchNotes(q):[];
  if(byId('fileSearch')?.value!==q)return;
  box.hidden=!items.length&&!notes.length;
  box.innerHTML=(items.length?`${SectionTitle('Dans le texte de vos photos',{count:items.length})}<div class="list-stack">${items.map((r,i)=>ListCard({iconName:'fileText',tone:'sky',title:r.ctx.session.title,meta:`${r.ctx.course.name} · ${r.ctx.section.name} — ${r.snippet}`,attrs:`data-ocr-hit="${i}"`})).join('')}</div>`:'')
    +(notes.length?`${SectionTitle('Dans vos notes',{count:notes.length})}<div class="list-stack">${notes.map((r,i)=>ListCard({iconName:'note',tone:'lavender',title:r.session.title,meta:`${r.course.name} · ${r.section.name} — ${r.excerpt}`,attrs:`data-note-hit="${i}"`})).join('')}</div>`:'');
  box.querySelectorAll('[data-note-hit]').forEach(b=>b.onclick=()=>{const r=notes[+b.dataset.noteHit];navigate('session',{courseId:r.course.id,sectionId:r.section.id,sessionId:r.session.id})});
  box.querySelectorAll('[data-ocr-hit]').forEach(b=>b.onclick=()=>{const r=items[+b.dataset.ocrHit],s=r.ctx.session;
    openPhotoViewer(s.photoIds,Math.max(0,s.photoIds.indexOf(r.photoId)),{title:s.title,source:'session',sourceId:s.id,editable:true,returnView:'files',courseId:r.ctx.course.id,sectionId:r.ctx.section.id,sessionId:s.id})});
}

// Session → images (the edited version of each photo), through the share sheet when possible.
async function exportSessionImages(course,section,session){
  const files=[];
  const base=Drive.safeName(`${course.name}_${section.name}_${session.title}`).replace(/\s+/g,'_');
  for(let i=0;i<session.photoIds.length;i++){
    const row=await photoRow(session.photoIds[i]);if(!row?.blob)continue;
    const b=photoBlob(row);files.push(new File([b],`${base}_${String(i+1).padStart(2,'0')}.jpg`,{type:b.type||'image/jpeg'}));
  }
  if(!files.length){showToast('Aucune image à exporter');return}
  try{
    if(navigator.canShare?.({files})){await navigator.share({files,title:session.title});return}
  }catch(e){if(e?.name==='AbortError')return}
  for(const f of files){const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);await new Promise(r=>setTimeout(r,250))}
  showToast(`${files.length} image(s) enregistrée(s)`);
}
