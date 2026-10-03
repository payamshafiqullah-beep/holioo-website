'use strict';
// Menu for every item that can be renamed / moved and deleted (courses, sections, séances,
// photos, PDFs). Press ~450 ms: two round actions open above the finger, with the same ring and
// liquid-glass lens as Quick Capture (ui/radial-menu.js, used as is). Slide and release on one to choose
// it. Lifting the finger without choosing while it is still over the menu (where it pressed — even with
// a shaking hand —, between the actions) leaves the menu open: tap an action, or tap outside / × to close.
// Lifting past the actions (a swipe away) closes it. Moving more than 10 px before 450 ms is a scroll,
// not a press. The screen behind is blurred and dimmed; the pressed item stays sharp above it, a little
// bigger. No tap action follows a long-press. Right-click opens the menu on desktop.
//
//   attachItemMenu(el,{name, title, rename(newName), move(), remove()},{press})
//     press:false      reorderable items (courses, séance / Captures photos): opened by the grip's tap only, see itemMenuFromHandle
//     rename(newName)  named items: left action "Renommer", edited in place, never empty
//     move()           unnamed items (photos): left action "Déplacer"
//     reposition()     gallery photos (tablet / computer): left action "Changer la position" instead of "Déplacer"
//     remove()         hides the item at once, returns {undo(), commit()}: "Supprimé · Annuler" for 5 s,
//                      then commit() makes it final (a new deletion or leaving the app commits at once)
//     name             shown above the rings;  title: selector of the text edited by "Renommer" (default strong)
//
// The menu is one createRadialMenu on a hidden element. The long-press is detected on the item; at 450 ms
// the menu opens with begin() and the same finger keeps driving it (move, lift) from the document, wherever
// its events go (they stay on the pressed item) — no pointer capture needed, so it works the same on iOS.

const ITEM_MENU={ms:450,slop:10,undoMs:5000};
let itemMenuRadial=null,itemMenuCur=null,itemMenuSwallow=0,itemMenuHeld=null,itemUndo=null;   // itemMenuHeld: id of the finger holding the menu

if(typeof window!=='undefined'&&window.addEventListener){
  // The click that follows a long-press (touch or mouse) must not open or select anything.
  window.addEventListener('click',e=>{if(performance.now()<itemMenuSwallow&&!e.target.closest?.('[data-haptic]')){e.preventDefault();e.stopImmediatePropagation()}},true);
  const held=e=>itemMenuHeld!==null&&e.pointerId===itemMenuHeld;
  const letGo=()=>{itemMenuHeld=null;itemMenuSwallow=performance.now()+500};
  // Slide: the lens follows. Lift: an action is chosen, or the menu stays open for taps / closes
  // (ui/radial-menu.js decides by where the finger is). The system took the touch: open for taps.
  document.addEventListener('pointermove',e=>{if(held(e))itemMenuRadial?.move(e.clientX,e.clientY)},true);
  document.addEventListener('pointerup',e=>{if(held(e)){letGo();itemMenuRadial?.lift(e.clientX,e.clientY)}},true);
  document.addEventListener('pointercancel',e=>{if(held(e)){letGo();itemMenuRadial?.interrupt()}},true);
  // Another finger while the first one never reported its lift: the menu goes on with taps.
  document.addEventListener('pointerdown',e=>{if(itemMenuHeld!==null&&!held(e)){letGo();itemMenuRadial?.interrupt()}},true);
  // The same finger's touch events (iOS sends both): the page must not scroll under the menu, and a
  // lift or cancel reported only here is not lost (the radial menu ignores whichever comes second).
  document.addEventListener('touchmove',e=>{
    if(itemMenuHeld===null)return;
    if(e.cancelable)e.preventDefault();
    const t=e.touches[0];if(t)itemMenuRadial?.move(t.clientX,t.clientY);
  },{passive:false});
  document.addEventListener('touchend',e=>{
    if(itemMenuHeld===null||e.touches.length)return;
    const t=e.changedTouches[0];letGo();if(t)itemMenuRadial?.lift(t.clientX,t.clientY);
  },true);
  document.addEventListener('touchcancel',()=>{if(itemMenuHeld!==null){letGo();itemMenuRadial?.interrupt()}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)itemUndoCommit()});
  window.addEventListener('pagehide',itemUndoCommit);
}

function itemMenuGet(){
  if(itemMenuRadial)return itemMenuRadial;
  const proxy=document.createElement('div');proxy.className='item-menu-proxy';proxy.setAttribute('aria-hidden','true');
  document.body.appendChild(proxy);
  itemMenuRadial=createRadialMenu({
    trigger:proxy,
    items:()=>itemMenuCur.items,
    origin:()=>itemMenuCur.at,
    describe:({item})=>({title:itemMenuCur?.name||'',sub:item?item.label:'Glissez vers une action'}),
    onSelect:item=>{const c=itemMenuCur;itemMenuCur=null;c?.act(item.id)},
    label:'Actions',closeLabel:'Fermer',centerHtml:icon('x',{size:26,stroke:2.4})
  });
  return itemMenuRadial;
}

function itemMenuOpen(el,o,at,pointer){
  const radial=itemMenuGet();
  if(radial.isOpen())radial.close();
  const lead=o.reposition?{id:'position',label:'Changer la position',icon:'arrowsUpDown',color:'#506BFF'}:o.move?{id:'move',label:'Déplacer',icon:'folder',color:'#506BFF'}:{id:'rename',label:'Renommer',icon:'pencil',color:'#506BFF'};
  const del={id:'delete',label:'Supprimer',icon:'trash',color:'#E5484D'};
  itemMenuCur={name:o.name,at,items:[lead,del].map(a=>({...a,short:'',aria:a.label})),act:id=>{
    if(id==='delete')itemDelete(o.remove);
    else if(id==='position')o.reposition();
    else if(id==='move')o.move();
    else itemRename(el.querySelector(o.title||'strong'),o.name,v=>{o.rename(v);saveState();queueSync();render()},o.check);
  }};
  // The finger is down: it drives the menu (slide-and-release, see the document listeners above).
  if(pointer){if(radial.begin(at.x,at.y,pointer.id))itemMenuHeld=pointer.id}
  else radial.open();
  const overlay=document.querySelector('.radial');
  if(overlay){
    // Everything behind is blurred and dimmed; a copy of the pressed item sits above, sharp and a little bigger.
    overlay.classList.add('item-menu');
    const r=el.getBoundingClientRect(),lift=el.cloneNode(true);
    lift.removeAttribute('id');lift.removeAttribute('data-item-menu');lift.removeAttribute('tabindex');
    lift.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));lift.querySelectorAll('img').forEach(i=>i.loading='eager');
    lift.classList.add('item-menu-lift');lift.setAttribute('aria-hidden','true');lift.inert=true;
    Object.assign(lift.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});
    overlay.querySelector('.radial-backdrop').after(lift);
    requestAnimationFrame(()=>lift.classList.add('on'));
  }
  document.querySelectorAll('.radial .radial-item.r1').forEach(b=>{
    const a=itemMenuCur?.items[+b.dataset.i],dot=b.querySelector('.radial-dot');
    if(a&&dot){dot.innerHTML=icon(a.icon,{size:26,stroke:2.2});dot.style.cssText='display:grid;place-items:center;line-height:0'}
  });
}

// {press:false}: no long-press / right-click trigger; the menu is opened only by itemMenuFromHandle (the two-dot grip).
function attachItemMenu(el,o,{press:byPress=true}={}){
  if(!el||el.dataset.itemMenu)return;
  el.dataset.itemMenu='1';
  el._itemMenu=at=>{const r=el.getBoundingClientRect();itemMenuOpen(el,o,at||{x:r.left+r.width/2,y:r.top+r.height/2},null)};
  if(!byPress)return;
  let press=null,type='';
  const clear=()=>{if(press){clearTimeout(press.t);press=null}};
  el.addEventListener('pointerdown',e=>{
    type=e.pointerType;clear();
    if(!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest('input,textarea,[data-reorder-handle]'))return;
    const p={id:e.pointerId,type:e.pointerType,x:e.clientX,y:e.clientY};
    p.t=setTimeout(()=>{if(press!==p)return;press=null;itemMenuOpen(el,o,{x:p.x,y:p.y},p)},ITEM_MENU.ms);
    press=p;
  });
  el.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>ITEM_MENU.slop)clear()});
  el.addEventListener('pointerup',clear);el.addEventListener('pointercancel',clear);
  el.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(type!=='mouse'&&type!=='')return;   // a touch long-press is handled above
    const r=el.getBoundingClientRect();
    itemMenuOpen(el,o,e.clientX||e.clientY?{x:e.clientX,y:e.clientY}:{x:r.left+r.width/2,y:r.top+r.height/2},null);
  });
}

// The two-dot grip of a reorderable item (ui/reorder.js, onHandle): a tap opens the item's menu, anchored on the grip.
function itemMenuFromHandle(card,grip){
  const r=grip.getBoundingClientRect();
  card._itemMenu?.({x:r.left+r.width/2,y:r.top+r.height/2});
}

// ─── Rename, in place ───
// An input laid over the text (the text may sit inside a button, where an input cannot live).
// `check(name)` → a message when the name can't be used (already taken): Enter keeps editing, leaving cancels.
function itemRename(textEl,current,save,check=null){
  if(!textEl)return;
  const input=document.createElement('input'),cs=getComputedStyle(textEl);
  input.className='inline-rename';input.value=current||'';input.maxLength=80;input.enterKeyHint='done';input.setAttribute('aria-label','Nouveau nom');
  input.style.font=cs.font;input.style.letterSpacing=cs.letterSpacing;
  const place=()=>{
    const r=textEl.getBoundingClientRect(),left=Math.max(8,r.left-8);
    Object.assign(input.style,{left:`${left}px`,top:`${r.top-5}px`,width:`${Math.min(Math.max(r.width+16,160),window.innerWidth-left-8)}px`,height:`${r.height+10}px`});
  };
  let done=false;
  const finish=(ok,leaving=false)=>{
    if(done)return;
    const v=input.value.trim();
    if(ok&&!v){showToast('Le nom ne peut pas être vide');input.focus();return}
    const problem=ok&&v!==current&&check?check(v):'';
    if(problem){showToast(problem);if(!leaving){input.focus();return}ok=false}
    done=true;
    window.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);
    input.remove();textEl.style.visibility='';
    if(ok&&v!==current)save(v);
  };
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true)}else if(e.key==='Escape'){e.preventDefault();finish(false)}});
  input.addEventListener('blur',()=>finish(!!input.value.trim(),true));
  input.addEventListener('click',e=>e.stopPropagation());
  place();textEl.style.visibility='hidden';document.body.appendChild(input);
  window.addEventListener('scroll',place,true);window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);
  input.focus();input.select();
}

// ─── Delete: no dialog, "Supprimé · Annuler" for 5 s ───
function itemUndoCommit(){
  const u=itemUndo;if(!u)return;
  itemUndo=null;clearTimeout(u.timer);u.bar.remove();
  try{Promise.resolve(u.commit?.()).catch(e=>console.warn(e))}catch(e){console.warn(e)}
}
function itemDelete(remove){
  itemUndoCommit();   // an earlier deletion becomes final
  let res;
  try{res=remove()}catch(e){console.error(e);showToast('Suppression impossible. Réessayez.');return}
  const bar=document.createElement('div');bar.className='undo-bar';bar.setAttribute('role','status');
  bar.innerHTML='<span>Supprimé</span><button type="button">Annuler</button>';
  const u=itemUndo={...res,bar,timer:setTimeout(itemUndoCommit,ITEM_MENU.undoMs)};
  bar.querySelector('button').onclick=()=>{if(itemUndo!==u)return;itemUndo=null;clearTimeout(u.timer);bar.remove();u.undo()};
  document.body.appendChild(bar);
}

// What a deletion changes, taken before it and put back by Annuler: which sections / séances every course
// has (same objects, same order), Captures, favourites, timetable, last camera destination, PDF links.
function itemSnapshot(){
  const courses=state.courses.map(c=>({c,sections:c.sections.map(s=>({s,sessions:[...s.sessions]}))}));
  const inbox=[...state.inbox],favorites=[...state.favorites],cameraLast=state.cameraLast;
  const timetable=Array.isArray(state.timetable)?[...state.timetable]:null;
  const files=state.files.map(f=>[f,Array.isArray(f.sessionIds)?[...f.sessionIds]:null]);
  return()=>{
    state.courses=courses.map(x=>{x.c.sections=x.sections.map(y=>{y.s.sessions=y.sessions;return y.s});return x.c});
    state.inbox=inbox;state.favorites=favorites;state.cameraLast=cameraLast;
    if(timetable)state.timetable=timetable;
    for(const[f,ids]of files)if(ids)f.sessionIds=ids;
  };
}
// The same for photos: which ones every séance / Captures batch holds.
function itemPhotoSnapshot(){
  const lists=[],add=b=>{if(!b)return;lists.push(b);(b.splitQueue||[]).forEach(add)};
  for(const c of state.courses)for(const s of c.sections)s.sessions.forEach(add);
  state.inbox.forEach(add);add(currentBatch);add(state.captureDraft);
  const saved=lists.map(b=>[b,[...(b.photoIds||[])]]),inbox=[...state.inbox],selected=currentBatch?.selected&&new Set(currentBatch.selected);
  return()=>{for(const[b,ids]of saved)b.photoIds=ids;state.inbox=inbox;if(selected&&currentBatch)currentBatch.selected=selected};
}

// ─── What each kind of item offers (the delete is the app's own: removeCourse, removeSection, …) ───
function courseMenu(course){
  return{name:course.name,title:'.course-card-copy strong',rename:v=>{course.name=v},check:v=>courseNameProblem(v,course.id),remove:()=>{
    const restore=itemSnapshot(),ids=course.sections.flatMap(s=>s.sessions.map(q=>q.id));
    removeCourse(course.id);saveState();queueSync();render();
    return{undo:()=>{restore();saveState();render()},commit:()=>purgeSessionInk(ids)};
  }};
}
function sectionMenu(course,section){
  return{name:section.name,rename:v=>{section.name=v},check:v=>sectionNameProblem(course,v,section.id),remove:()=>{
    const restore=itemSnapshot(),ids=removeSection(course,section);
    saveState();queueSync();render();
    return{undo:()=>{restore();saveState();render()},commit:()=>purgeSessionInk(ids)};
  }};
}
function sessionMenu(course,section,session){
  return{name:session.title,rename:v=>{session.title=v},check:v=>sessionTitleProblem(section,v,session.id),remove:()=>{
    const restore=itemSnapshot();
    removeSessions(course,section,[session]);saveState();queueSync();render();
    return{undo:()=>{restore();saveState();render()},commit:()=>purgeSessionInk([session.id])};
  }};
}
function pdfMenu(meta){
  return{name:meta.title,rename:v=>{meta.title=v;if(meta.fileName)meta.fileName=`${Drive.safeName(v)}.pdf`},remove:()=>{
    const at=state.files.indexOf(meta);
    state.files=state.files.filter(f=>f!==meta);saveState();render();
    return{undo:()=>{state.files.splice(Math.min(at,state.files.length),0,meta);saveState();queueSync();render()},commit:()=>removeLocalPdf(meta.id)};
  }};
}
// A PDF inside a séance: the same two actions as its photos (Déplacer = course → section → séance, Supprimer).
function pdfSessionMenu(meta){
  const{remove}=pdfMenu(meta);
  return{name:meta.title,move:()=>openPdfMoveSheet(meta),remove};
}
// `removed`: how the screen shows it gone (default: redraw).
function photoMenu(id,removed=()=>render()){
  return{name:'Photo',move:()=>itemMovePhoto(id),remove:()=>{
    const restore=itemPhotoSnapshot();
    detachPhoto(id);saveState();removed();
    return{undo:()=>{restore();saveState();render()},commit:()=>removeLocalPhoto(id)};
  }};
}

// Déplacer: Course → Section → Séance (or a new séance).
function itemMovePhoto(id){
  if(!state.courses.length){showToast('Créez d’abord un cours');return}
  const here=state.courses.flatMap(c=>c.sections.flatMap(s=>s.sessions.filter(q=>q.photoIds.includes(id)).map(q=>({c,s,q}))))[0];
  const opt=(v,t,sel)=>`<option value="${esc(v)}"${sel?' selected':''}>${esc(t)}</option>`;
  const field=(label,sel)=>`<div class="field"><label>${label}</label><select id="${sel}"></select></div>`;
  openSheet({title:'Déplacer la photo',subtitle:'Cours → section → séance',body:field('Cours','mvCourse')+field('Section','mvSection')+field('Séance','mvSession'),confirmText:'Déplacer',confirmClass:'purple',onConfirm:()=>{
    const c=course(),s=section();
    if(!c||!s){showToast('Ce cours n’a pas de section');return false}
    let q=s.sessions.find(x=>x.id===byId('mvSession').value);
    if(!q){const num=(s.sessions.at(-1)?.number||0)+1;q={id:uid(),number:num,title:`${s.name} ${num}`,photoIds:[],createdAt:now(),visibility:'private'};s.sessions.push(q)}
    detachPhoto(id);q.photoIds.push(id);saveState();queueSync();render();showToast('Photo déplacée');return true;
  }});
  const course=()=>state.courses.find(c=>c.id===byId('mvCourse').value),section=()=>course()?.sections.find(s=>s.id===byId('mvSection').value);
  const fillSessions=()=>{byId('mvSession').innerHTML=(section()?.sessions||[]).filter(q=>q.id!==here?.q.id).map(q=>opt(q.id,q.title)).join('')+opt('new','＋ Nouvelle séance')};
  const fillSections=()=>{byId('mvSection').innerHTML=(course()?.sections||[]).map(s=>opt(s.id,s.name,s.id===here?.s.id)).join('');fillSessions()};
  byId('mvCourse').innerHTML=state.courses.map(c=>opt(c.id,c.name,c.id===(here?.c||state.courses[0]).id)).join('');
  byId('mvCourse').onchange=fillSections;byId('mvSection').onchange=fillSessions;
  fillSections();
}
