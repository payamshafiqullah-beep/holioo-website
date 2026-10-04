'use strict';
// Course navigator (tablet / computer, window ≥ 768 px): the ONE course tree every desk screen shares — Galerie, Notes,
// Séance, PDF builder and every other screen beside them. It lives in the sidebar built by ui/desk-shell.js; the
// toolbar's sidebar button hides and shows it. Logic (pure, tested): features/navigator-logic.js.
//
// - The list of courses (a colour dot each). Tap a course: it is selected and unfolds its sessions grouped by CM / TD / TP
//   (and custom sections); tap it again to fold it (the arrow folds / unfolds without selecting). The search filters courses.
// - Tap a type (CM / TD / TP) to select it, tap a session to select it (highlighted). "+" beside each type adds a session;
//   "Ajouter un cours" at the bottom adds a course. Long-press / right-click: rename / delete (features/item-menu.js).
// - What a choice does depends on the screen (navTargetView): the Galerie shows that part of the course; on Notes the
//   selected session is the one the note is saved in; the Séance and the PDF builder open that session.
// - The breadcrumb above the page (course › type › session, PageBreadcrumb) is made from the same selection.
// Phones never get here: they keep Cours → section → séance (pages/CoursesPage.js …).

const navigatorState={open:new Set(),query:'',lastCourse:null};
// Screens that follow the selection (highlight, breadcrumb); on the others the tree is only a way in.
const NAV_SELECTION_VIEWS=['gallery','notes','session','pdfBuilder'];
const navigatorSelection=()=>navResolve(state.courses,{courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
const navigatorShows=()=>NAV_SELECTION_VIEWS.includes(currentView);

function CourseNavigatorShell(){
  return`<div class="cnav-head"><label class="cnav-search">${icon('search',{size:17})}<input id="cnavSearch" type="search" placeholder="Rechercher un cours" autocomplete="off" aria-label="Rechercher un cours"></label></div>
    <nav class="cnav-tree" id="cnavTree" aria-label="Cours, types et séances"></nav>
    <div class="cnav-foot"><button class="cnav-new" type="button" id="cnavAddCourse">${icon('plus',{size:17})}<span>Ajouter un cours</span></button></div>`;
}

function CourseNavigatorTree(){
  const sel=navigatorSelection(),live=navigatorShows(),q=navigatorState.query.trim();
  const courses=navFilterCourses(state.courses,q);
  if(!courses.length)return`<p class="cnav-empty">${q?'Aucun cours trouvé':'Aucun cours : ajoutez-en un ci-dessous.'}</p>`;
  const on=(kind,id)=>live&&sel.kind===kind&&(kind==='course'?sel.course:kind==='section'?sel.section:sel.session)?.id===id;
  return`<ul class="cnav-courses">${courses.map(c=>{
    const open=navigatorState.open.has(c.id),v=courseVisual(c,state.courses.indexOf(c));
    const types=open?`<ul class="cnav-types">${c.sections.map(s=>`<li class="cnav-type">
        <div class="cnav-row cnav-type-row${on('section',s.id)?' selected':''}">
          <button class="cnav-link" type="button" data-nav-section="${s.id}" data-course-id="${c.id}"${on('section',s.id)?' aria-current="true"':''}><strong>${esc(s.name)}</strong></button>
          <button class="cnav-add" type="button" data-nav-add="${s.id}" data-course-id="${c.id}" title="Nouvelle séance ${esc(s.name)}" aria-label="Nouvelle séance ${esc(s.name)}">${icon('plus',{size:16,stroke:2.2})}</button>
        </div>
        <ul class="cnav-sessions">${s.sessions.map(x=>`<li><button class="cnav-link cnav-session${on('session',x.id)?' selected':''}" type="button" data-nav-session="${x.id}" data-section-id="${s.id}" data-course-id="${c.id}"${on('session',x.id)?' aria-current="true"':''}><strong>${esc(x.title)}</strong><small>${plural(x.photoIds?.length||0,'photo')}</small></button></li>`).join('')||'<li class="cnav-none">Aucune séance</li>'}</ul>
      </li>`).join('')}</ul>`:'';
    return`<li class="cnav-course">
      <div class="cnav-row cnav-course-row${on('course',c.id)?' selected':''}">
        <button class="cnav-twisty" type="button" data-nav-toggle="${c.id}" aria-expanded="${open}" aria-label="${open?'Replier':'Déplier'} ${esc(c.name)}">${icon('chevronRight',{size:16})}</button>
        <button class="cnav-link" type="button" data-nav-course="${c.id}"${on('course',c.id)?' aria-current="true"':''}><i class="cnav-dot tone-${v.tone}"${c.color?` style="--dot:${esc(c.color)}"`:''}></i><strong>${esc(c.name)}</strong></button>
      </div>${types}
    </li>`;
  }).join('')}</ul>`;
}

// Redraws the tree (after every screen, and after a fold / search). The course on screen is unfolded once, when it changes.
function navigatorRefresh(){
  const box=byId('cnavTree');if(!box)return;
  const sel=navigatorSelection();
  if(navigatorShows()&&sel.course&&sel.course.id!==navigatorState.lastCourse){navigatorState.lastCourse=sel.course.id;navigatorState.open.add(sel.course.id)}
  const top=box.scrollTop;
  box.innerHTML=CourseNavigatorTree();box.scrollTop=top;
  const add=byId('cnavAddCourse');if(add){const full=courseLimitReached();add.disabled=full;add.querySelector('span').textContent=full?COURSE_LIMIT_MESSAGE:'Ajouter un cours'}
  box.querySelectorAll('[data-nav-course],[data-nav-section],[data-nav-session]').forEach(el=>{
    const d=el.dataset,c=getCourse(d.courseId||d.navCourse);if(!c)return;
    const s=d.navSection?getSection(c,d.navSection):d.sectionId?getSection(c,d.sectionId):null,q=d.navSession&&s?getSession(s,d.navSession):null;
    attachItemMenu(el,{...(q?sessionMenu(c,s,q):d.navSection&&s?sectionMenu(c,s):courseMenu(c)),title:'strong'});
  });
  // The selected row stays in view when it was chosen elsewhere (camera, Notes, breadcrumb).
  const row=box.querySelector('.selected');
  if(row){const t=row.offsetTop-box.offsetTop,b=t+row.offsetHeight;if(t<box.scrollTop)box.scrollTop=t-8;else if(b>box.scrollTop+box.clientHeight)box.scrollTop=b-box.clientHeight+8}
}

// The one entry point of a choice (tree, breadcrumb): sets the selection and goes to the screen that fits it.
function navigatorSelect(kind,ids){
  const next=navIds(kind,ids);let view=navTargetView(currentView,kind,isDesk());
  currentCourseId=next.courseId;currentSectionId=next.sectionId;currentSessionId=next.sessionId;
  // The PDF builder works from a séance: given a course or a type, it takes the latest one that has photos.
  if(view==='pdfBuilder'&&kind!=='session'){
    const c=getCourse(),q=c&&navPickSession(c,getSection(c)||null,{photos:true});
    if(q){currentSectionId=q.section.id;currentSessionId=q.session.id}else view='gallery';
  }
  if(currentCourseId)navigatorState.open.add(currentCourseId);
  navigate(view);
}

function navigatorAddSession(courseId,sectionId){
  const c=getCourse(courseId),s=c&&getSection(c,sectionId);if(!c||!s)return;
  const auto=navNewSession(s).title;
  openSheet({title:`Nouvelle séance ${s.name}`,subtitle:`Le titre automatique sera « ${auto} ».`,body:Field({label:'Titre personnalisé (facultatif)',id:'sessionTitle',placeholder:`${auto} — sujet`}),confirmText:'Créer',onConfirm:()=>{
    const title=byId('sessionTitle').value.trim()||auto,problem=sessionTitleProblem(s,title);
    if(problem){showToast(problem);return false}
    const q={id:uid(),number:navNewSession(s).number,title,photoIds:[],createdAt:now(),visibility:'private'};
    s.sessions.push(q);saveState();queueSync();
    navigatorSelect('session',{courseId:c.id,sectionId:s.id,sessionId:q.id});
    return true;
  }});
}
// The new course is selected and shown where the screen can show it (Galerie, Notes …).
function navigatorAddCourse(){
  openNewCourseSheet(c=>{
    const ids=navIds('course',{courseId:c.id});
    currentCourseId=ids.courseId;currentSectionId=null;currentSessionId=null;
    currentView=navTargetView(currentView,'course',isDesk());navigatorState.open.add(c.id);
  });
}

function navigatorMount(side){
  side.innerHTML=CourseNavigatorShell();
  byId('cnavSearch').addEventListener('input',e=>{navigatorState.query=e.target.value;navigatorRefresh()});
  byId('cnavAddCourse').addEventListener('click',navigatorAddCourse);
  byId('cnavTree').addEventListener('click',e=>{
    const t=e.target.closest('[data-nav-toggle]');
    if(t){const id=t.dataset.navToggle,o=navigatorState.open;o.has(id)?o.delete(id):o.add(id);navigatorRefresh();byId('cnavTree').querySelector(`[data-nav-toggle="${id}"]`)?.focus();return}
    const add=e.target.closest('[data-nav-add]');
    if(add){navigatorAddSession(add.dataset.courseId,add.dataset.navAdd);return}
    const course=e.target.closest('[data-nav-course]');
    if(course){
      const id=course.dataset.navCourse,sel=navigatorShows()?navigatorSelection():{kind:null};
      const tap=navCourseTap(navigatorState.open,sel,id);
      if(tap.select)navigatorSelect('course',{courseId:id});
      else{navigatorRefresh();byId('cnavTree').querySelector(`[data-nav-course="${id}"]`)?.focus()}
      return;
    }
    const section=e.target.closest('[data-nav-section]');
    if(section){navigatorSelect('section',{courseId:section.dataset.courseId,sectionId:section.dataset.navSection});return}
    const session=e.target.closest('[data-nav-session]');
    if(session)navigatorSelect('session',{courseId:session.dataset.courseId,sectionId:session.dataset.sectionId,sessionId:session.dataset.navSession});
  });
}

// ── Breadcrumb: course › type › session, above the page ──
function PageBreadcrumb(){
  if(!navigatorShows())return'';
  const parts=navBreadcrumb(state.courses,{courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
  if(!parts.length)return'';
  return`<ol class="crumb-list">${parts.map((p,i)=>i===parts.length-1
    ?`<li class="crumb-here" aria-current="page"><span>${esc(p.label)}</span></li>`
    :`<li><button class="crumb-link" type="button" data-crumb="${i}">${esc(p.label)}</button><i class="crumb-sep" aria-hidden="true">${icon('chevronRight',{size:14})}</i></li>`).join('')}</ol>`;
}
function navigatorCrumbClick(e){
  const i=e.target.closest('[data-crumb]')?.dataset.crumb;if(i===undefined)return;
  const p=navBreadcrumb(state.courses,{courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId})[+i];
  if(p)navigatorSelect(p.kind,p.ids);
}
