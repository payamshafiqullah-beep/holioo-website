'use strict';
// Screens and sheets: navigate(), the bottom sheet, toasts.
function setChrome(hidden){appShell.classList.toggle('hidden-chrome',hidden)}
function setNav(view){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===view))}
function navigate(view,payload={}){
  if(view==='home'&&appUpdateReady&&reloadIfSafe())return;
  if(view==='capture'&&currentView!=='capture')prepareCameraEntry(currentView,payload.cameraDest);
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
