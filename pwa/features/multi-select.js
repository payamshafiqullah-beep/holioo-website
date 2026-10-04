// Multi-select + bulk delete. One helper, used by the séance gallery (photos), Fichiers (PDF, images) and Mes cours.
//   enableMultiSelect({root, itemSelector, idOf, noun, remove})
// A "Sélectionner" button above `root` turns the list into selection mode: a tap picks / unpicks an item (opening, long-press
// menus and drag-reorder are paused), a bar at the bottom shows the count with Tout / Supprimer. Supprimer asks to confirm,
// then runs `remove(ids)` through itemDelete — the app's own "Supprimé · Annuler" bar, so the whole deletion can be undone.
// The mode lives in the page's DOM: any re-render (after the delete too) ends it.

const MSEL_PAUSED_EVENTS=['pointerdown','mousedown','touchstart','contextmenu','keydown'];

function enableMultiSelect({root,itemSelector,idOf,noun=['élément','éléments'],remove,label='Sélectionner'}){
  if(!root||root.dataset.mselReady)return null;
  root.dataset.mselReady='1';
  const picked=new Set();let on=false,bar=null;
  const top=document.createElement('div');top.className='msel-top';
  top.innerHTML=`<button class="link-btn" type="button">${esc(label)}</button>`;
  root.before(top);
  const toggleBtn=top.firstElementChild;
  const items=()=>[...root.querySelectorAll(itemSelector)];
  const count=n=>`${n} ${n>1?noun[1]:noun[0]}`;
  const paint=()=>{
    for(const el of items()){const p=picked.has(idOf(el));el.classList.toggle('msel-picked',on&&p);if(on)el.setAttribute('aria-pressed',String(p));else el.removeAttribute('aria-pressed')}
    if(!bar)return;
    bar.querySelector('.msel-count').textContent=picked.size?`${count(picked.size)} sélectionné${picked.size>1?'s':''}`:'Rien de sélectionné';
    bar.querySelector('[data-msel-del]').disabled=!picked.size;
    bar.querySelector('[data-msel-all]').textContent=picked.size&&picked.size===items().length?'Aucun':'Tout';
  };
  const pick=el=>{const id=idOf(el);if(id==null)return;picked.has(id)?picked.delete(id):picked.add(id);paint()};
  const onClick=e=>{
    if(!on)return;const el=e.target.closest(itemSelector);if(!el)return;
    e.preventDefault();e.stopPropagation();pick(el);
  };
  // Capture phase on the list: the item's own tap, long-press menu and drag handlers never see the touch while selecting.
  const swallow=e=>{
    if(!on)return;const el=e.target.closest?.(itemSelector);if(!el)return;
    if(e.type==='keydown'){if(e.key==='Enter'||e.key===' '){e.stopPropagation();e.preventDefault();pick(el)}return}
    e.stopPropagation();
  };
  const stop=()=>{
    on=false;picked.clear();root.classList.remove('msel-on');toggleBtn.textContent=label;
    bar?.remove();bar=null;paint();
  };
  const confirmDelete=()=>{
    if(!picked.size)return;
    const ids=[...picked];
    openSheet({title:`Supprimer ${count(ids.length)} ?`,subtitle:'Vous pourrez encore annuler pendant quelques secondes.',confirmText:'Supprimer',confirmClass:'coral',onConfirm:()=>{
      stop();itemDelete(()=>remove(ids));return true;
    }});
  };
  const start=()=>{
    on=true;root.classList.add('msel-on');toggleBtn.textContent='Terminer';
    bar=document.createElement('div');bar.className='msel-bar';bar.setAttribute('role','toolbar');
    bar.innerHTML=`<button type="button" class="msel-all" data-msel-all>Tout</button><span class="msel-count" aria-live="polite"></span><button type="button" class="msel-del" data-msel-del disabled>${icon('trash',{size:18})}<span>Supprimer</span></button>`;
    (root.closest('.screen')||document.body).appendChild(bar);
    bar.querySelector('[data-msel-all]').onclick=()=>{
      const all=items().map(idOf).filter(x=>x!=null);
      if(picked.size===all.length)picked.clear();else all.forEach(id=>picked.add(id));
      paint();
    };
    bar.querySelector('[data-msel-del]').onclick=confirmDelete;
    paint();
  };
  toggleBtn.onclick=()=>on?stop():start();
  root.addEventListener('click',onClick,true);
  for(const t of MSEL_PAUSED_EVENTS)root.addEventListener(t,swallow,true);
  return{stop,isOn:()=>on};
}

// ---------- the bulk deletions (same data changes as the single ones in item-menu.js, one undo for all) ----------
function bulkRemovePhotos(ids){
  const restore=itemPhotoSnapshot();
  ids.forEach(detachPhoto);saveState();queueSync();render();
  return{undo:()=>{restore();saveState();render()},commit:()=>Promise.all(ids.map(id=>removeLocalPhoto(id)))};
}
function bulkRemovePdfs(ids){
  const gone=new Set(ids),before=[...state.files],metas=before.filter(f=>gone.has(f.id));
  state.files=before.filter(f=>!gone.has(f.id));saveState();queueSync();render();
  return{undo:()=>{state.files=before;saveState();queueSync();render()},commit:()=>Promise.all(metas.map(m=>removeLocalPdf(m.id)))};
}
function bulkRemoveCourses(ids){
  const restore=itemSnapshot(),sessionIds=state.courses.filter(c=>ids.includes(c.id)).flatMap(c=>c.sections.flatMap(s=>s.sessions.map(q=>q.id)));
  ids.forEach(removeCourse);saveState();queueSync();render();
  return{undo:()=>{restore();saveState();render()},commit:()=>purgeSessionInk(sessionIds)};
}
function bulkRemoveSessions(course,section,ids){
  const restore=itemSnapshot(),gone=section.sessions.filter(q=>ids.includes(q.id));
  removeSessions(course,section,gone);saveState();queueSync();render();
  return{undo:()=>{restore();saveState();render()},commit:()=>purgeSessionInk(gone.map(q=>q.id))};
}
function bulkRemoveSections(course,ids){
  const restore=itemSnapshot(),sessionIds=[];
  for(const s of course.sections.filter(x=>ids.includes(x.id)))sessionIds.push(...removeSection(course,s));
  saveState();queueSync();render();
  return{undo:()=>{restore();saveState();render()},commit:()=>purgeSessionInk(sessionIds)};
}
// Captures: a whole batch goes; its photos are deleted from the device unless a séance still holds them.
function bulkRemoveBatches(ids){
  const restore=itemPhotoSnapshot(),gone=state.inbox.filter(b=>ids.includes(b.id)),photoIds=[...new Set(gone.flatMap(b=>b.photoIds||[]))];
  state.inbox=state.inbox.filter(b=>!ids.includes(b.id));saveState();queueSync();render();
  return{undo:()=>{restore();saveState();render()},commit:()=>{
    const kept=new Set([...state.inbox.flatMap(b=>b.photoIds||[]),...state.courses.flatMap(c=>c.sections.flatMap(s=>s.sessions.flatMap(q=>q.photoIds||[])))]);
    return Promise.all(photoIds.filter(id=>!kept.has(id)).map(id=>removeLocalPhoto(id)));
  }};
}
