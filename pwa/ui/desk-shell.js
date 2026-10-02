'use strict';
// Tablet & computer layout (window ≥ 768 px): an icon toolbar on top, the course tree on the left
// (courses → sections → séances), the screen in a wide canvas. Built only when the window is that wide and
// removed below it, so phones (and the 720–767 px rail) keep exactly their own DOM and styles.
// Styles: `.desk` block at the end of styles.css. The sidebar is docked from 1100 px, a drawer below.

const deskQuery=window.matchMedia('(min-width:768px)');
const deskDockQuery=window.matchMedia('(min-width:1100px)');
const isDesk=()=>deskQuery.matches;
const deskOpenNodes=new Set();      // courses / sections unfolded in the tree
let deskFilterText='',deskDrawerOpen=false;

const DESK_TOOLS=[
  {view:'home',label:'Accueil',iconName:'home'},
  {view:'courses',label:'Cours',iconName:'book'},
  {view:'library',label:'Bibliothèque',iconName:'library'},
  {view:'files',label:'Fichiers',iconName:'folder'}
];

function DeskToolbar(){
  const count=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  const tool=(attrs,label,iconName,extra='')=>`<button class="desk-tool" type="button" ${attrs} title="${esc(label)}" aria-label="${esc(label)}">${icon(iconName,{size:21})}${extra}</button>`;
  return`<div class="desk-toolbar-start">
      ${tool('id="deskSideToggle" aria-controls="deskSidebar"','Afficher ou masquer les cours','sidebar')}
      <span class="wordmark desk-wordmark" aria-label="Holioo">Holioo<i></i></span>
    </div>
    <nav class="desk-toolbar-nav" aria-label="Navigation principale">
      ${DESK_TOOLS.map(t=>`<button class="desk-tab" type="button" data-nav="${t.view}" data-desk-tab="${t.view}" title="${t.label}">${icon(t.iconName,{size:19})}<span>${t.label}</span></button>`).join('')}
    </nav>
    <div class="desk-toolbar-end">
      <button class="desk-capture" type="button" data-nav="capture" title="Prendre des photos" aria-label="Prendre des photos">${icon('camera',{size:19,stroke:2})}<span>Capture</span></button>
      ${tool('data-nav="inbox"',`Captures à trier${count?` : ${count}`:''}`,'inbox',count?`<b class="icon-btn-badge">${count>99?'99+':count}</b>`:'')}
      ${tool('data-nav="files"','Rechercher','search')}
      ${tool('data-nav="sync"','Synchronisation','cloud')}
      ${AvatarButton()}
    </div>`;
}

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

function deskMount(){
  if(byId('deskToolbar'))return;
  const bar=document.createElement('header');bar.id='deskToolbar';bar.className='desk-toolbar';
  const side=document.createElement('aside');side.id='deskSidebar';side.className='desk-sidebar';side.setAttribute('aria-label','Cours');
  side.innerHTML=`<div class="desk-side-head"><label class="desk-filter">${icon('search',{size:17})}<input id="deskFilter" type="search" placeholder="Filtrer les cours" autocomplete="off" aria-label="Filtrer les cours"></label></div><nav class="desk-tree-box" id="deskTree" aria-label="Cours, sections et séances"></nav><div class="desk-side-foot"><button class="desk-new" type="button" id="deskNewSession">${icon('plus',{size:17})}<span>Nouvelle séance</span></button></div>`;
  const scrim=document.createElement('div');scrim.id='deskScrim';scrim.className='desk-scrim';
  appShell.prepend(bar);bar.after(side);side.after(scrim);
  appShell.classList.add('desk');
  bar.addEventListener('click',e=>{if(e.target.closest('#deskSideToggle'))deskToggleSidebar()});
  scrim.addEventListener('click',()=>deskSetDrawer(false));
  byId('deskFilter').addEventListener('input',e=>{deskFilterText=e.target.value;deskFillTree()});
  byId('deskNewSession').addEventListener('click',deskNewSession);
  side.addEventListener('keydown',e=>{if(e.key==='Escape'&&!deskDockQuery.matches){deskSetDrawer(false);byId('deskSideToggle')?.focus()}});
  byId('deskTree').addEventListener('click',e=>{
    const t=e.target.closest('[data-desk-toggle]');
    if(t){const id=t.dataset.deskToggle;deskOpenNodes.has(id)?deskOpenNodes.delete(id):deskOpenNodes.add(id);deskFillTree();byId('deskTree').querySelector(`[data-desk-toggle="${id}"]`)?.focus();return}
    const go=e.target.closest('[data-desk-go]');if(!go)return;
    const d=go.dataset;
    if(d.courseId)deskOpenNodes.add(d.courseId);if(d.sectionId)deskOpenNodes.add(d.sectionId);
    if(!deskDockQuery.matches)deskSetDrawer(false);
    navigate(d.deskGo,{courseId:d.courseId,sectionId:d.sectionId,sessionId:d.sessionId});
  });
}
function deskUnmount(){
  for(const id of['deskToolbar','deskSidebar','deskScrim'])byId(id)?.remove();
  appShell.classList.remove('desk','desk-docked','desk-side-closed','desk-side-open');
}

function deskSidebarClosed(){return state.settings.deskSidebar==='closed'}
function deskToggleSidebar(){
  if(deskDockQuery.matches){state.settings.deskSidebar=deskSidebarClosed()?'open':'closed';saveState();deskApplySidebar()}
  else deskSetDrawer(!deskDrawerOpen);
}
function deskSetDrawer(open){
  deskDrawerOpen=open;deskApplySidebar();
  if(open)requestAnimationFrame(()=>(byId('deskSidebar')?.querySelector('.desk-link.active,.desk-link')||byId('deskFilter'))?.focus());
}
function deskApplySidebar(){
  const docked=deskDockQuery.matches,shown=docked?!deskSidebarClosed():deskDrawerOpen;
  appShell.classList.toggle('desk-docked',docked);
  appShell.classList.toggle('desk-side-closed',docked&&!shown);
  appShell.classList.toggle('desk-side-open',!docked&&shown);
  const side=byId('deskSidebar');if(side){side.inert=!shown;side.toggleAttribute('aria-hidden',!shown)}
  byId('deskSideToggle')?.setAttribute('aria-expanded',String(shown));
}

function deskFillTree(){
  const box=byId('deskTree');if(!box)return;
  box.innerHTML=DeskTree();
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

// Called after every render (app.js): builds or removes the desk chrome and refreshes it.
function syncDesk(){
  if(!isDesk()){if(byId('deskToolbar'))deskUnmount();return}
  deskMount();
  // The drawer closes once a screen is chosen.
  const at=`${currentView}:${currentSessionId}:${currentSectionId}:${currentCourseId}`;
  if(at!==syncDesk.at){syncDesk.at=at;deskDrawerOpen=false}
  if(currentCourseId)deskOpenNodes.add(currentCourseId);
  if(currentSectionId&&['section','session'].includes(currentView))deskOpenNodes.add(currentSectionId);
  byId('deskToolbar').innerHTML=DeskToolbar();
  document.querySelectorAll('[data-desk-tab]').forEach(b=>{const on=b.dataset.deskTab===currentView;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const filter=byId('deskFilter');if(filter&&filter.value!==deskFilterText)filter.value=deskFilterText;
  deskFillTree();
  deskApplySidebar();
  document.dispatchEvent(new CustomEvent('holioo:desk'));
}
const deskLayoutChanged=()=>{deskDrawerOpen=false;syncDesk();if(typeof render==='function'&&currentView)render().catch(e=>console.error(e))};
deskQuery.addEventListener('change',deskLayoutChanged);
deskDockQuery.addEventListener('change',()=>{deskDrawerOpen=false;deskApplySidebar()});
