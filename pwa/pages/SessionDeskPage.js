// Séance on a tablet or computer (window ≥ 768 px, ui/desk-shell.js): each photo large on the left with its
// typed note beside it, the séance's own note on top. "Notes" opens the séance's free page (pages/NotesCanvasPage.js); the old Carnet
// is not offered here any more. Phones keep pages/SessionPage.js.
// Notes: features/notes.js (saved on the device, copied to Drive, merged from the other devices).

let deskSessionCleanup=null;

function DeskPhotoRow(id,i,text){
  return`<li class="desk-row" data-photo-id="${id}">
    <figure class="desk-photo">
      <button class="desk-photo-btn" type="button" data-open-photo="${id}" aria-label="Ouvrir la photo ${i+1}"><img alt="Photo ${i+1}" decoding="async"></button>
      <span class="num">${i+1}</span>
    </figure>
    <label class="desk-note" data-note-state>
      <span class="desk-note-label">Photo ${i+1}<i class="desk-note-saved" aria-hidden="true">${icon('check',{size:13})}</i></span>
      <textarea data-note-photo="${id}" rows="4" placeholder="Vos notes sur cette photo…">${esc(text)}</textarea>
    </label>
  </li>`;
}

// Previews first; the full photo once the row comes near the screen.
function deskLoadPhotos(box){
  const io=new IntersectionObserver(entries=>{
    for(const en of entries){
      if(!en.isIntersecting)continue;io.unobserve(en.target);
      const id=en.target.dataset.photoId,img=en.target.querySelector('img');
      photoRow(id).then(row=>{const b=photoBlob(row);if(b&&img.isConnected)img.src=thumbUrl(b)}).catch(()=>{});
    }
  },{rootMargin:'800px 0px'});
  box.querySelectorAll('.desk-row').forEach(async row=>{
    const url=await photoThumbUrl(row.dataset.photoId);
    const img=row.querySelector('img');if(url&&img.isConnected&&!img.src)img.src=url;
    io.observe(row);
  });
  return()=>io.disconnect();
}

async function renderSessionDesk(){
  deskSessionCleanup?.();deskSessionCleanup=null;
  const ctx=findSessionContext();if(!ctx){navigate('courses');return}
  const{course,section,session}=ctx,n=session.photoIds.length,pub=session.visibility==='public';
  const notes=await notesFor(session.id);
  const tool=(id,label,iconName,attrs='')=>`<button class="desk-action" type="button" id="${id}" ${attrs}>${icon(iconName,{size:17})}<span>${esc(label)}</span></button>`;
  const notesView=`<label class="desk-session-note" data-note-state>
      <span class="desk-note-label">Notes de la séance<i class="desk-note-saved" aria-hidden="true">${icon('check',{size:13})}</i></span>
      <textarea id="deskSessionNote" rows="3" placeholder="Résumé, questions, points à revoir…">${esc(notes.session.text)}</textarea>
    </label>
    ${n?`<ol class="desk-rows" id="deskRows">${session.photoIds.map((id,i)=>DeskPhotoRow(id,i,notes.photos[id]?.text||'')).join('')}</ol>`
      :EmptyState({iconName:'camera',title:'Aucune photo',text:'Prenez des photos avec votre téléphone : elles apparaissent ici, prêtes à être annotées.'})}`;
  app.innerHTML=`<section class="screen screen-wide desk-session">
    ${PageHeader({back:true,title:`${course.name} · ${section.name}`})}
    <div class="desk-session-head">
      <div class="page-intro"><p class="eyebrow">SÉANCE</p><h1 class="hero-title">${esc(session.title)}</h1><p class="lead">${plural(n,'photo')} · ${fmtDate(session.createdAt)}</p></div>
      <div class="desk-session-actions">
        ${tool('addSessionPhotos',n?'Ajouter des photos':'Prendre des photos','camera','data-nav="capture"')}
        ${tool('openNotes','Notes','penLine')}
        ${tool('buildPdf','Créer un PDF','fileText')}
        ${n?`${tool('publishSession',pub?'Publiée':'Publier','globe')}${tool('ocrSession','Reconnaître le texte','scan')}${tool('exportImages','Exporter','share')}`:''}
        ${tool('renameSession','Renommer','pencil')}
      </div>
    </div>
    <div class="desk-session-body">${notesView}</div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('section');
  byId('openNotes').addEventListener('click',()=>navigate('notes',{courseId:course.id,sectionId:section.id,sessionId:session.id}));
  const cleanups=[];
  const fields=new Map();
  const sessionField=byId('deskSessionNote');fields.set('',bindNoteField(sessionField,session.id,null));
  const box=byId('deskRows');
  if(box){
    box.querySelectorAll('textarea[data-note-photo]').forEach(t=>fields.set(t.dataset.notePhoto,bindNoteField(t,session.id,t.dataset.notePhoto)));
    box.querySelectorAll('[data-open-photo]').forEach(b=>{
      const id=b.dataset.openPhoto;
      b.onclick=()=>openPhotoViewer(session.photoIds,Math.max(0,session.photoIds.indexOf(id)),{title:session.title,source:'session',sourceId:session.id,editable:true,returnView:'session',courseId:course.id,sectionId:section.id,sessionId:session.id});
      attachItemMenu(b.closest('.desk-photo'),photoMenu(id));
    });
    cleanups.push(deskLoadPhotos(box));
    makeReorderable(box,{holdMs:6e5,onChange:ids=>{session.photoIds=[...ids,...session.photoIds.filter(x=>!ids.includes(x))];saveState();queueSync();showToast('Ordre enregistré');box.querySelectorAll('.desk-row').forEach((r,i)=>{const l=r.querySelector('.desk-note-label');if(l)l.firstChild.textContent=`Photo ${i+1}`})}});
  }
  // Notes typed on another device appear in place (a field being typed in is left alone).
  cleanups.push(onNotesChanged((sid,doc,{remote})=>{
    if(!remote||sid!==session.id)return;
    fields.get('')?.setText(doc.session.text);
    for(const[id,f]of fields)if(id)f.setText(doc.photos[id]?.text||'');
  }));
  if(typeof pullSessionNotes==='function')pullSessionNotes(session.id).catch(e=>console.warn('Notes pull',e));
  deskSessionCleanup=()=>cleanups.forEach(fn=>fn());
  byId('buildPdf')?.addEventListener('click',()=>navigate('pdfBuilder'));
  byId('ocrSession')?.addEventListener('click',()=>recognizeSessionText(session));
  byId('exportImages')?.addEventListener('click',()=>exportSessionImages(course,section,session));
  if(n)updateSessionOcrLabel(session);
  byId('publishSession')?.addEventListener('click',()=>publishSession(course,section,session));
  byId('renameSession')?.addEventListener('click',()=>openSheet({title:'Renommer la séance',body:Field({label:'Titre',id:'renameValue',value:session.title}),onConfirm:()=>{const title=byId('renameValue').value.trim()||session.title;if(title!==session.title){const problem=sessionTitleProblem(section,title,session.id);if(problem){showToast(problem);return false}}session.title=title;saveState();render();queueSync();return true}}));
}
