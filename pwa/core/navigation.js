'use strict';
// Screens and sheets: navigate(), the bottom sheet, toasts.
function setChrome(hidden){appShell.classList.toggle('hidden-chrome',hidden)}
function setNav(view){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===view))}
// Where Retour goes: the screens the person really came through, newest last. A tab (Accueil, Cours, Bibliothèque, Fichiers) starts a
// fresh trail; screens with their own way back (camera, viewers, scan review, login) are never put on it. goBack() returns to the
// last entry (with its course / section / séance), and only when there is none to the screen the page names as its default.
const NAV_ROOTS=['home','courses','library','files'];
const NAV_UNTRACKED=new Set(['login','blocked','academicSetup','capture','scanReview','photoViewer','pdfViewer','sharedViewer']);
let navStack=[],navRestoring=false;
const navHere=()=>({view:currentView,courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
function navRemember(view,payload){
  if(navRestoring)return;
  if(NAV_ROOTS.includes(view)){navStack=[];return}
  if(NAV_UNTRACKED.has(view)||NAV_UNTRACKED.has(currentView))return;
  const moved=view!==currentView||(payload.courseId&&payload.courseId!==currentCourseId)||(payload.sectionId&&payload.sectionId!==currentSectionId)||(payload.sessionId&&payload.sessionId!==currentSessionId);
  if(!moved)return;
  navStack.push(navHere());if(navStack.length>40)navStack.shift();
}
function goBack(fallback='home'){
  while(navStack.length){
    const e=navStack.pop();
    if(e.view===currentView&&e.courseId===currentCourseId&&e.sectionId===currentSectionId&&e.sessionId===currentSessionId)continue;
    navRestoring=true;
    try{currentCourseId=e.courseId;currentSectionId=e.sectionId;currentSessionId=e.sessionId;navigate(e.view)}finally{navRestoring=false}
    return;
  }
  navigate(fallback);
}
function navigate(view,payload={}){
  if(view==='home'&&appUpdateReady&&reloadIfSafe())return;
  if(view==='capture'&&currentView!=='capture')prepareCameraEntry(currentView,payload.cameraDest);
  navRemember(view,payload);
  appShell.classList.toggle('capture-active',view==='capture');
  if(view!=='capture')stopCamera();if(currentView==='scanReview'&&view!=='scanReview'&&typeof flushScanDelete==='function')flushScanDelete();if(currentView==='session'&&view!=='session'&&typeof flushNotebook==='function')flushNotebook();currentView=view;
  if(['home','courses','library','files'].includes(view)&&typeof sessionReturnView!=='undefined')sessionReturnView=null;
  if(payload.courseId)currentCourseId=payload.courseId;if(payload.sectionId)currentSectionId=payload.sectionId;if(payload.sessionId)currentSessionId=payload.sessionId;
  const mainViews=['home','courses','capture','library','files'];setNav(mainViews.includes(view)?view:'');setChrome(['login','blocked','academicSetup','photoViewer','pdfViewer','capture','scanReview','admin','sharedViewer'].includes(view));window.scrollTo(0,0);render().catch(e=>{console.error(e);showToast('Une erreur est survenue')});
}
document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();navigate(n.dataset.nav)}});

// ONE way in and out for every bottom sheet. body.sheet-open (kept in step with #sheetRoot's content, whoever clears it) is what
// hides the floating bars (selection bar, undo bar) while a sheet is up: see the z-index scale at the top of styles.css.
function mountSheet(html){sheetRoot.innerHTML=html}
function closeSheet(){sheetRoot.innerHTML=''}
new MutationObserver(()=>document.body.classList.toggle('sheet-open',!!sheetRoot.firstElementChild)).observe(sheetRoot,{childList:true});

function openSheet({title,subtitle='',body='',confirmText='Enregistrer',confirmClass='primary',onConfirm=null,secondaryText='Annuler',onSecondary=null}){
  mountSheet(`<div class="sheet" id="activeSheet"><div class="sheet-card"><div class="sheet-handle"></div><h2 class="sheet-title">${esc(title)}</h2>${subtitle?`<p class="sheet-sub">${esc(subtitle)}</p>`:''}<div>${body}</div><div class="sheet-actions"><button class="action-btn ${confirmClass==='coral'?'danger':'primary'} full" id="sheetConfirm">${esc(confirmText)}</button>${secondaryText?`<button class="action-btn ghost full" id="sheetCancel">${esc(secondaryText)}</button>`:''}</div></div></div>`);
  const close=closeSheet;document.getElementById('sheetCancel')?.addEventListener('click',async()=>{if(onSecondary)await onSecondary();close()});document.getElementById('activeSheet')?.addEventListener('click',e=>{if(e.target.id==='activeSheet')close()});document.getElementById('sheetConfirm').addEventListener('click',async()=>{const ok=onConfirm?await onConfirm(close):true;if(ok!==false&&sheetRoot.innerHTML)close()});
  return close;
}
