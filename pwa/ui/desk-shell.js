'use strict';
// Tablet & computer layout (window ≥ 768 px): an icon toolbar on top, the course navigator on the left, a breadcrumb
// above the page, the screen in a wide canvas. Built only when the window is that wide and removed below it, so phones
// (and the 720–767 px rail) keep exactly their own DOM and styles. Styles: `.desk` block at the end of styles.css.
//
// Toolbar: sidebar button (hides / shows the navigator), logo (Accueil), Galerie, Caméra, Notes, PDF, Drive sync, spacer,
// Réglages, profile. The active screen is highlighted; on the Notes page the spacer holds undo / redo and
// "Enregistrement… / Enregistré".
// Sidebar: the course navigator (ui/course-navigator.js), the same on every screen including Notes. Breadcrumb
// (course › type › session) under the toolbar on the screens that follow the selection.

const deskQuery=window.matchMedia('(min-width:768px)');
const isDesk=()=>deskQuery.matches;

// Which toolbar button each screen belongs to.
const DESK_TAB_OF={gallery:'gallery',session:'gallery',live:'capture',capture:'capture',notes:'notes',pdfBuilder:'pdf',pdfViewer:'pdf',sync:'sync'};
const DESK_TABS=[
  {id:'gallery',label:'Galerie',iconName:'images',attrs:'data-nav="gallery"',title:'Galerie : les photos du cours'},
  {id:'capture',label:'Caméra',iconName:'camera',attrs:'data-nav="capture"',cls:'desk-capture',title:'Prendre des photos'},
  {id:'notes',label:'Notes',iconName:'penLine',attrs:'data-desk-act="notes"',title:'Notes : page libre pour écrire, dessiner et placer les photos'},
  {id:'pdf',label:'PDF',iconName:'fileText',attrs:'data-desk-act="pdf"',title:'Créer un PDF'},
  {id:'sync',label:'Drive',iconName:'cloud',attrs:'data-desk-act="sync"',title:'Synchroniser avec Google Drive',dot:true}
];
const deskActiveTab=()=>DESK_TAB_OF[currentView]||'';

function DeskToolbar(){
  const active=deskActiveTab();
  const tab=t=>`<button class="desk-tab${t.cls?` ${t.cls}`:''}${t.id===active?' active':''}" type="button" ${t.attrs} data-desk-tab="${t.id}" title="${esc(t.title)}" aria-label="${esc(t.label)}"${t.id===active?' aria-current="page"':''}>${icon(t.iconName,{size:19,stroke:t.id==='capture'?2:1.9})}<span>${t.label}</span>${t.dot?'<i class="sync-dot" data-sync-dot></i>':''}</button>`;
  return`<div class="desk-toolbar-start">
      <button class="desk-tool" type="button" id="deskSideToggle" aria-controls="deskSidebar" aria-expanded="${!deskSidebarClosed()}" title="Afficher ou masquer les cours" aria-label="Afficher ou masquer les cours">${icon('sidebar',{size:21})}</button>
      <button class="desk-logo" type="button" data-nav="home" title="Accueil" aria-label="Holioo, accueil"><span class="wordmark desk-wordmark">Holioo<i></i></span></button>
    </div>
    <nav class="desk-toolbar-nav" aria-label="Navigation principale">${DESK_TABS.map(tab).join('')}</nav>
    <div class="desk-toolbar-spacer" id="deskSpacer">${currentView==='notes'&&typeof canvasTopBarHtml==='function'?canvasTopBarHtml():''}</div>
    <div class="desk-toolbar-end">
      <button class="desk-tool" type="button" id="deskSettings" data-desk-act="settings" aria-haspopup="true" aria-expanded="false" title="Réglages" aria-label="Réglages">${icon('settings',{size:21})}</button>
      ${AvatarButton()}
    </div>`;
}

function deskMount(){
  if(byId('deskToolbar'))return;
  const bar=document.createElement('header');bar.id='deskToolbar';bar.className='desk-toolbar';
  const side=document.createElement('aside');side.id='deskSidebar';side.className='desk-sidebar';side.setAttribute('aria-label','Cours');
  const crumb=document.createElement('nav');crumb.id='deskCrumb';crumb.className='desk-crumb';crumb.setAttribute('aria-label','Fil d’Ariane');
  appShell.prepend(bar);bar.after(side);side.after(crumb);
  appShell.classList.add('desk');
  navigatorMount(side);
  bar.addEventListener('click',e=>{
    if(e.target.closest('#deskSideToggle')){deskToggleSidebar();return}
    const act=e.target.closest('[data-desk-act]')?.dataset.deskAct;
    if(act==='pdf')deskPdf();else if(act==='sync')deskSync();else if(act==='settings')deskToggleMenu();else if(act==='notes')deskNotes();
  });
  crumb.addEventListener('click',navigatorCrumbClick);
}
function deskUnmount(){
  deskCloseMenu();
  for(const id of['deskToolbar','deskSidebar','deskCrumb'])byId(id)?.remove();
  appShell.classList.remove('desk','desk-side-closed','desk-crumb-on','desk-notes');
}

// The navigator is shown by default (hidden by default in a narrow window); the toolbar button remembers the choice.
const deskSidebarClosed=()=>(state.settings.deskSidebar||(window.innerWidth<1000?'closed':'open'))==='closed';
function deskToggleSidebar(){state.settings.deskSidebar=deskSidebarClosed()?'open':'closed';saveState();deskApplySidebar()}
function deskApplySidebar(){
  const closed=deskSidebarClosed();
  appShell.classList.toggle('desk-side-closed',closed);
  const side=byId('deskSidebar');if(side){side.inert=closed;side.toggleAttribute('aria-hidden',closed)}
  byId('deskSideToggle')?.setAttribute('aria-expanded',String(!closed));
}

// ── Toolbar actions ──
// PDF: on the Notes page the page itself is exported; elsewhere the PDF builder opens on what the navigator has
// selected (it works from a séance: the selected one, else the latest of the selected type or course that has photos).
function deskPdf(){
  if(currentView==='notes'&&typeof exportCanvasPdf==='function'){exportCanvasPdf();return}
  const sel=navigatorSelection(),c=sel.course||(typeof galleryCourse==='function'?galleryCourse():null);
  const q=sel.session?{section:sel.section,session:sel.session}:c?navPickSession(c,sel.section,{photos:true})||navPickSession(c,null,{photos:true}):null;
  if(!c||!q){showToast(c?'Ce cours n’a pas encore de séance':'Créez d’abord un cours');return}
  navigate('pdfBuilder',{courseId:c.id,sectionId:q.section.id,sessionId:q.session.id});
}
// Drive: one tap sends and receives now; without a connection the screen to connect opens.
function deskSync(){
  if(!guestMode&&currentUser&&driveStatus?.connected){runDriveSync('manual');return}
  navigate('sync');
}

// Réglages: a small menu under the gear: the automatic sync switch and the screens the toolbar has no button for.
function deskCloseMenu({focus=false}={}){
  const m=byId('deskMenu');if(!m)return;
  m.remove();document.removeEventListener('pointerdown',deskMenuOutside,true);document.removeEventListener('keydown',deskMenuKey,true);
  const b=byId('deskSettings');b?.setAttribute('aria-expanded','false');b?.classList.remove('open');if(focus)b?.focus();
}
const deskMenuOutside=e=>{if(!e.target.closest('#deskMenu,#deskSettings'))deskCloseMenu()};
function deskMenuKey(e){
  if(e.key==='Escape'){e.preventDefault();deskCloseMenu({focus:true});return}
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  const items=[...document.querySelectorAll('#deskMenu button,#deskMenu input')],at=items.indexOf(document.activeElement);
  e.preventDefault();items[(at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
}
function deskToggleMenu(){
  if(byId('deskMenu')){deskCloseMenu({focus:true});return}
  const btn=byId('deskSettings');if(!btn)return;
  const count=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  const go=[['home','Accueil','home'],['library','Bibliothèque','library'],['files','Fichiers et recherche','folder'],['inbox','Captures à trier','inbox',count],['live','Capture en direct','radio'],['sync','Google Drive','cloud']];
  const m=document.createElement('div');m.id='deskMenu';m.className='desk-menu';m.setAttribute('aria-label','Réglages');
  m.innerHTML=`<p class="desk-menu-title">Réglages</p>
    <label class="desk-menu-row"><span>Synchroniser automatiquement</span><input type="checkbox" id="deskAutoSync" class="switch" ${state.settings.autoDriveSync?'checked':''}></label>
    <hr>
    ${go.map(([v,label,ic,n])=>`<button class="desk-menu-item" type="button" data-desk-menu-go="${v}">${icon(ic,{size:18})}<span>${esc(label)}</span>${n?`<b class="desk-count">${n>99?'99+':n}</b>`:''}</button>`).join('')}`;
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  m.style.top=`${r.bottom+8}px`;m.style.right=`${Math.max(8,window.innerWidth-r.right)}px`;
  btn.setAttribute('aria-expanded','true');btn.classList.add('open');
  m.addEventListener('click',e=>{const v=e.target.closest('[data-desk-menu-go]')?.dataset.deskMenuGo;if(v){deskCloseMenu();navigate(v)}});
  byId('deskAutoSync').addEventListener('change',e=>{state.settings.autoDriveSync=e.target.checked;saveState();showToast(e.target.checked?'Synchronisation automatique activée':'Synchronisation automatique désactivée')});
  document.addEventListener('pointerdown',deskMenuOutside,true);document.addEventListener('keydown',deskMenuKey,true);
  m.querySelector('button')?.focus();
}

// Called after every render (app.js): builds or removes the desk chrome and refreshes it.
function syncDesk(){
  if(!isDesk()){if(byId('deskToolbar'))deskUnmount();return}
  deskMount();deskCloseMenu();
  appShell.classList.toggle('desk-notes',currentView==='notes');
  byId('deskToolbar').innerHTML=DeskToolbar();
  const crumb=byId('deskCrumb'),html=PageBreadcrumb();
  crumb.innerHTML=html;appShell.classList.toggle('desk-crumb-on',!!html);
  navigatorRefresh();
  deskApplySidebar();
  document.dispatchEvent(new CustomEvent('holioo:desk'));
}
const deskLayoutChanged=()=>{syncDesk();if(typeof render==='function'&&currentView)render().catch(e=>console.error(e))};
deskQuery.addEventListener('change',deskLayoutChanged);
