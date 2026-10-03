'use strict';
// Tablet & computer layout (window ≥ 768 px): an icon toolbar on top, a sidebar on the left, the screen in a wide
// canvas. Built only when the window is that wide and removed below it, so phones (and the 720–767 px rail) keep
// exactly their own DOM and styles. Styles: `.desk` block at the end of styles.css.
//
// Toolbar: logo (Accueil), Galerie, Caméra, Notes, PDF, Drive sync, spacer, Réglages, profile. The active screen is
// highlighted; on the Notes page the spacer holds undo / redo and "Enregistrement… / Enregistré".
// Sidebar (`deskMode`): beside the Galerie it is the course list (photo counts, CM / TD / TP / Tous, "Ajouter un
// cours"); Notes has no sidebar (it floats its own photo tray); every other screen keeps the course → section →
// séance tree. Docked always for the course list, from 1100 px for the tree (a drawer below).

const deskQuery=window.matchMedia('(min-width:768px)');
const deskDockQuery=window.matchMedia('(min-width:1100px)');
const isDesk=()=>deskQuery.matches;
const deskOpenNodes=new Set();      // courses / sections unfolded in the tree
let deskFilterText='',deskDrawerOpen=false;

const deskMode=()=>currentView==='gallery'?'courses':currentView==='notes'?'none':'tree';
const deskDocked=()=>deskMode()==='courses'||deskDockQuery.matches;

// Which toolbar button each screen belongs to.
const DESK_TAB_OF={gallery:'gallery',courses:'gallery',course:'gallery',section:'gallery',session:'gallery',live:'capture',capture:'capture',notes:'notes',pdfBuilder:'pdf',pdfViewer:'pdf',sync:'sync'};
const DESK_TABS=[
  {id:'gallery',label:'Galerie',iconName:'images',attrs:'data-nav="gallery"',title:'Galerie : les photos du cours'},
  {id:'capture',label:'Caméra',iconName:'camera',attrs:'data-nav="capture"',cls:'desk-capture',title:'Prendre des photos'},
  {id:'notes',label:'Notes',iconName:'penLine',attrs:'data-desk-act="notes"',title:'Notes : page libre pour écrire, dessiner et placer les photos'},
  {id:'pdf',label:'PDF',iconName:'fileText',attrs:'data-desk-act="pdf"',title:'Créer un PDF'},
  {id:'sync',label:'Drive',iconName:'cloud',attrs:'data-desk-act="sync"',title:'Synchroniser avec Google Drive',dot:true}
];
const deskActiveTab=()=>DESK_TAB_OF[currentView]||'';

function DeskToolbar(){
  const active=deskActiveTab(),mode=deskMode();
  const tab=t=>`<button class="desk-tab${t.cls?` ${t.cls}`:''}${t.id===active?' active':''}" type="button" ${t.attrs} data-desk-tab="${t.id}" title="${esc(t.title)}" aria-label="${esc(t.label)}"${t.id===active?' aria-current="page"':''}>${icon(t.iconName,{size:19,stroke:t.id==='capture'?2:1.9})}<span>${t.label}</span>${t.dot?'<i class="sync-dot" data-sync-dot></i>':''}</button>`;
  return`<div class="desk-toolbar-start">
      ${mode==='none'?'':`<button class="desk-tool" type="button" id="deskSideToggle" aria-controls="deskSidebar" title="Afficher ou masquer les cours" aria-label="Afficher ou masquer les cours">${icon('sidebar',{size:21})}</button>`}
      <button class="desk-logo" type="button" data-nav="home" title="Accueil" aria-label="Holioo, accueil"><span class="wordmark desk-wordmark">Holioo<i></i></span></button>
    </div>
    <nav class="desk-toolbar-nav" aria-label="Navigation principale">${DESK_TABS.map(tab).join('')}</nav>
    <div class="desk-toolbar-spacer" id="deskSpacer">${currentView==='notes'&&typeof canvasTopBarHtml==='function'?canvasTopBarHtml():''}</div>
    <div class="desk-toolbar-end">
      <button class="desk-tool" type="button" id="deskSettings" data-desk-act="settings" aria-haspopup="true" aria-expanded="false" title="Réglages" aria-label="Réglages">${icon('settings',{size:21})}</button>
      ${AvatarButton()}
    </div>`;
}

// ── Sidebar content ──
function deskSessionCount(section){return section.sessions.length}
function DeskTree(){
  const q=deskFilterText.trim().toLowerCase();
  const match=s=>!q||String(s||'').toLowerCase().includes(q);
  const twisty=(id,open,label)=>`<button class="desk-twisty" type="button" data-desk-toggle="${id}" aria-expanded="${open}" aria-label="${open?'Replier':'Déplier'} ${esc(label)}">${icon('chevronRight',{size:16})}</button>`;
  const courses=state.courses.filter(c=>!c.done).map((c,i)=>{
    const sections=c.sections.map(s=>{
      const sessions=s.sessions.filter(x=>match(x.title)||match(s.name)||match(c.name));
      if(q&&!sessions.length&&!match(s.name)&&!match(c.name))return'';
      const open=!!q||deskOpenNodes.has(s.id);
      return`<li class="desk-node-wrap">
        <div class="desk-node${currentView==='section'&&currentSectionId===s.id?' active':''}">${twisty(s.id,open,s.name)}<button class="desk-link" type="button" data-desk-go="section" data-course-id="${c.id}" data-section-id="${s.id}"><strong>${esc(s.name)}</strong><span class="desk-count">${deskSessionCount(s)}</span></button></div>
        ${open?`<ul class="desk-sessions">${sessions.map(x=>`<li><button class="desk-link desk-session${currentView==='session'&&currentSessionId===x.id?' active':''}" type="button" data-desk-go="session" data-course-id="${c.id}" data-section-id="${s.id}" data-session-id="${x.id}" ${currentView==='session'&&currentSessionId===x.id?'aria-current="page"':''}><strong>${esc(x.title)}</strong><small>${plural(x.photoIds?.length||0,'photo')}</small></button></li>`).join('')||`<li class="desk-empty">Aucune séance</li>`}</ul>`:''}
      </li>`;
    }).join('');
    if(q&&!sections&&!match(c.name))return'';
    const open=!!q||deskOpenNodes.has(c.id);
    return`<li class="desk-node-wrap">
      <div class="desk-node desk-course${currentView==='course'&&currentCourseId===c.id?' active':''}">${twisty(c.id,open,c.name)}<button class="desk-link" type="button" data-desk-go="course" data-course-id="${c.id}"><i class="desk-dot tone-${courseVisual(c,i).tone}"${c.color?` style="--dot:${esc(c.color)}"`:''}></i><strong>${esc(c.name)}</strong></button></div>
      ${open?`<ul class="desk-sections">${sections}</ul>`:''}
    </li>`;
  }).join('');
  return courses?`<ul class="desk-tree">${courses}</ul>`:`<p class="desk-empty">${q?'Aucun résultat':'Aucun cours'}</p>`;
}

// Beside the Galerie: every running course with its number of photos; the one on screen is highlighted.
function DeskCourses(){
  const q=deskFilterText.trim().toLowerCase();
  const items=state.courses.map((c,i)=>({c,i})).filter(({c})=>!c.done&&(!q||String(c.name).toLowerCase().includes(q))).map(({c,i})=>{
    const n=galleryCourseCount(c),on=currentView==='gallery'&&currentCourseId===c.id;
    return`<li><button class="desk-link desk-course-link${on?' active':''}" type="button" data-desk-go="gallery" data-course-id="${c.id}"${on?' aria-current="true"':''}><i class="desk-dot tone-${courseVisual(c,i).tone}"${c.color?` style="--dot:${esc(c.color)}"`:''}></i><strong>${esc(c.name)}</strong><span class="desk-count" title="${esc(plural(n,'photo'))}" aria-label="${esc(plural(n,'photo'))}">${n}</span></button></li>`;
  }).join('');
  return items?`<ul class="desk-tree desk-courses">${items}</ul>`:`<p class="desk-empty">${q?'Aucun résultat':'Aucun cours'}</p>`;
}
function DeskPills(){
  const f=galleryValidFilter(state.settings.galleryFilter);
  return GALLERY_FILTERS.map(x=>`<button class="desk-pill${x.id===f?' active':''}" type="button" role="tab" aria-selected="${x.id===f}" data-gallery-filter="${x.id}" title="${esc(galleryFilterLabel(x.id))}">${x.label}</button>`).join('');
}

function deskMount(){
  if(byId('deskToolbar'))return;
  const bar=document.createElement('header');bar.id='deskToolbar';bar.className='desk-toolbar';
  const side=document.createElement('aside');side.id='deskSidebar';side.className='desk-sidebar';side.setAttribute('aria-label','Cours');
  side.innerHTML=`<div class="desk-side-head"><label class="desk-filter">${icon('search',{size:17})}<input id="deskFilter" type="search" placeholder="Filtrer les cours" autocomplete="off" aria-label="Rechercher un cours"></label></div><nav class="desk-tree-box" id="deskTree" aria-label="Cours, sections et séances"></nav><div class="desk-pills" id="deskPills" role="tablist" aria-label="Type de section"></div><div class="desk-side-foot"><button class="desk-new" type="button" id="deskNewSession">${icon('plus',{size:17})}<span>Nouvelle séance</span></button><button class="desk-new" type="button" id="deskNewCourse">${icon('plus',{size:17})}<span>Ajouter un cours</span></button></div>`;
  const scrim=document.createElement('div');scrim.id='deskScrim';scrim.className='desk-scrim';
  appShell.prepend(bar);bar.after(side);side.after(scrim);
  appShell.classList.add('desk');
  bar.addEventListener('click',e=>{
    if(e.target.closest('#deskSideToggle')){deskToggleSidebar();return}
    const act=e.target.closest('[data-desk-act]')?.dataset.deskAct;
    if(act==='pdf')deskPdf();else if(act==='sync')deskSync();else if(act==='settings')deskToggleMenu();else if(act==='notes')deskNotes();
  });
  scrim.addEventListener('click',()=>deskSetDrawer(false));
  byId('deskFilter').addEventListener('input',e=>{deskFilterText=e.target.value;deskFillTree()});
  byId('deskNewSession').addEventListener('click',deskNewSession);
  byId('deskNewCourse').addEventListener('click',deskNewCourse);
  byId('deskPills').addEventListener('click',e=>{
    const f=e.target.closest('[data-gallery-filter]')?.dataset.galleryFilter;
    if(!f||f===galleryValidFilter(state.settings.galleryFilter))return;
    state.settings.galleryFilter=f;saveState();render().catch(err=>console.error(err));
  });
  side.addEventListener('keydown',e=>{if(e.key==='Escape'&&!deskDocked()){deskSetDrawer(false);byId('deskSideToggle')?.focus()}});
  byId('deskTree').addEventListener('click',e=>{
    const t=e.target.closest('[data-desk-toggle]');
    if(t){const id=t.dataset.deskToggle;deskOpenNodes.has(id)?deskOpenNodes.delete(id):deskOpenNodes.add(id);deskFillTree();byId('deskTree').querySelector(`[data-desk-toggle="${id}"]`)?.focus();return}
    const go=e.target.closest('[data-desk-go]');if(!go)return;
    const d=go.dataset;
    if(d.courseId)deskOpenNodes.add(d.courseId);if(d.sectionId)deskOpenNodes.add(d.sectionId);
    if(!deskDocked())deskSetDrawer(false);
    navigate(d.deskGo,{courseId:d.courseId,sectionId:d.sectionId,sessionId:d.sessionId});
  });
}
function deskUnmount(){
  deskCloseMenu();
  for(const id of['deskToolbar','deskSidebar','deskScrim'])byId(id)?.remove();
  appShell.classList.remove('desk','desk-docked','desk-side-closed','desk-side-open','desk-mode-courses','desk-mode-tree','desk-mode-none','desk-notes');
}

function deskSidebarClosed(){return state.settings.deskSidebar==='closed'}
function deskToggleSidebar(){
  if(deskDocked()){state.settings.deskSidebar=deskSidebarClosed()?'open':'closed';saveState();deskApplySidebar()}
  else deskSetDrawer(!deskDrawerOpen);
}
function deskSetDrawer(open){
  deskDrawerOpen=open;deskApplySidebar();
  if(open)requestAnimationFrame(()=>(byId('deskSidebar')?.querySelector('.desk-link.active,.desk-link')||byId('deskFilter'))?.focus());
}
function deskApplySidebar(){
  const has=deskMode()!=='none',docked=has&&deskDocked(),shown=has&&(docked?!deskSidebarClosed():deskDrawerOpen);
  appShell.classList.toggle('desk-docked',docked);
  appShell.classList.toggle('desk-side-closed',docked&&!shown);
  appShell.classList.toggle('desk-side-open',has&&!docked&&shown);
  const side=byId('deskSidebar');if(side){side.inert=!shown;side.toggleAttribute('aria-hidden',!shown)}
  byId('deskSideToggle')?.setAttribute('aria-expanded',String(shown));
}

function deskFillTree(){
  const box=byId('deskTree');if(!box)return;
  const mode=deskMode();
  box.innerHTML=mode==='courses'?DeskCourses():mode==='tree'?DeskTree():'';
  const pills=byId('deskPills');if(pills)pills.innerHTML=mode==='courses'?DeskPills():'';
  box.querySelectorAll('[data-desk-go]').forEach(el=>{
    const c=getCourse(el.dataset.courseId);if(!c)return;
    const s=el.dataset.sectionId?getSection(c,el.dataset.sectionId):null,q=s&&el.dataset.sessionId?getSession(s,el.dataset.sessionId):null;
    const menu=q?sessionMenu(c,s,q):s?sectionMenu(c,s):courseMenu(c);
    attachItemMenu(el,{...menu,title:'strong'});
  });
}

// "Nouvelle séance" in the sidebar: in the section on screen (or the first one of the course on screen).
function deskNewSession(){
  const c=getCourse()||state.courses[0];
  const s=(c&&getSection(c))||c?.sections[0];
  if(!c||!s){navigate('courses');return}
  navigate('section',{courseId:c.id,sectionId:s.id});
  requestAnimationFrame(()=>byId('newSession')?.click());
}
// "Ajouter un cours" beside the Galerie: the new course opens in the Galerie.
function deskNewCourse(){openNewCourseSheet(c=>{currentCourseId=c.id;currentSectionId=null;currentSessionId=null})}

// ── Toolbar actions ──
// PDF: on the Notes page the page itself is exported; elsewhere the PDF builder opens on the course on screen
// (it works from a séance: the one of the photos shown, else the latest).
function deskPdf(){
  if(currentView==='notes'&&typeof exportCanvasPdf==='function'){exportCanvasPdf();return}
  const c=getCourse()||(typeof galleryCourse==='function'?galleryCourse():null);
  const q=c&&typeof galleryPdfSession==='function'?galleryPdfSession(c):null;
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
  const go=[['home','Accueil','home'],['courses','Mes cours','book'],['library','Bibliothèque','library'],['files','Fichiers et recherche','folder'],['inbox','Captures à trier','inbox',count],['live','Capture en direct','radio'],['sync','Google Drive','cloud']];
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
  const mode=deskMode();
  for(const m of['courses','tree','none'])appShell.classList.toggle(`desk-mode-${m}`,m===mode);
  appShell.classList.toggle('desk-notes',currentView==='notes');
  // The drawer closes once a screen is chosen.
  const at=`${currentView}:${currentSessionId}:${currentSectionId}:${currentCourseId}`;
  if(at!==syncDesk.at){syncDesk.at=at;deskDrawerOpen=false}
  if(currentCourseId)deskOpenNodes.add(currentCourseId);
  if(currentSectionId&&['section','session'].includes(currentView))deskOpenNodes.add(currentSectionId);
  byId('deskToolbar').innerHTML=DeskToolbar();
  const filter=byId('deskFilter');
  if(filter){filter.placeholder=mode==='courses'?'Rechercher':'Filtrer les cours';if(filter.value!==deskFilterText)filter.value=deskFilterText}
  deskFillTree();
  deskApplySidebar();
  document.dispatchEvent(new CustomEvent('holioo:desk'));
}
const deskLayoutChanged=()=>{deskDrawerOpen=false;syncDesk();if(typeof render==='function'&&currentView)render().catch(e=>console.error(e))};
deskQuery.addEventListener('change',deskLayoutChanged);
deskDockQuery.addEventListener('change',()=>{deskDrawerOpen=false;deskApplySidebar()});
