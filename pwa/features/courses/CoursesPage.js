// Cours — vue d'ensemble académique.
let coursesFilter='all';

function renderCourses(){
  setChrome(false);
  app.innerHTML=`<section class="screen">
    ${PageHeader({title:'Mes cours',large:true})}
    ${SearchBar({id:'courseSearch',placeholder:'Rechercher un cours...'})}
    ${FilterChips('courseFilters',[{value:'all',label:'Tous'},{value:'active',label:'Actifs'},{value:'review',label:'À revoir'},{value:'done',label:'Terminés'}],coursesFilter)}
    <p class="reorder-hint">Maintenez un cours puis faites-le glisser pour changer l’ordre. Touchez la poignée pour le renommer ou le supprimer.</p>
    <div class="card-stack" id="courseList">${state.courses.map((c,i)=>CourseCard(c,i,true)).join('')}</div>
    <div id="courseEmpty" hidden>${EmptyState({iconName:'search',title:'Aucun cours ici',text:'Essayez un autre filtre ou une autre recherche.'})}</div>
    ${ActionButton({label:courseLimitReached()?COURSE_LIMIT_MESSAGE:'Ajouter un cours',id:'addCourse',variant:'soft',iconName:'plus',disabled:courseLimitReached()})}
  </section>`;
  bindCourseCards();
  const list=byId('courseList');
  makeReorderable(list,{itemSelector:'[data-course]',idAttribute:'course',onHandle:itemMenuFromHandle,onChange:ids=>{
    const courses=new Map(state.courses.map(c=>[c.id,c]));
    state.courses=ids.map(id=>courses.get(id)).filter(Boolean);
    saveState();queueSync();showToast('Ordre des cours enregistré');
  }});
  list.querySelectorAll('[data-course]').forEach(card=>card.onkeydown=e=>{
    if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click()}
  });
  list.querySelectorAll('[data-course]').forEach(card=>{const c=state.courses.find(x=>x.id===card.dataset.course);if(c)attachItemMenu(card,courseMenu(c),{press:false})});
  bindListFilter({searchId:'courseSearch',chipsId:'courseFilters',scope:'#courseList',onChange:({kind,shown})=>{coursesFilter=kind;byId('courseEmpty').hidden=!!shown}});
  enableMultiSelect({root:list,itemSelector:'[data-course]',idOf:el=>el.dataset.course,noun:['cours','cours'],remove:bulkRemoveCourses});
  byId('addCourse').onclick=openNewCourseSheet;
}

// Also opened from Quick Capture on Accueil when there is no course yet.
// `onCreated(course)`: called with the new course just before the screen is drawn again (tablet / computer Galerie). Used as a click handler too, so anything that is not a function is ignored.
function openNewCourseSheet(onCreated=null){
  if(courseLimitReached()){showToast(COURSE_LIMIT_MESSAGE);return}
  openSheet({title:'Nouveau cours',subtitle:'Les sections CM, TD et TP sont créées automatiquement.',body:Field({label:'Nom du cours',id:'newCourseName',placeholder:'Ex. Traitement du signal'}),onConfirm:()=>{const name=byId('newCourseName').value.trim();const problem=courseNameProblem(name);if(problem){showToast(problem);return false}const colors=['#5B67F1','#8C5CF5','#FF8A4C','#29ADB5'];const course=addCourse(name,colors[state.courses.length%colors.length]);if(!course){showToast(COURSE_LIMIT_MESSAGE);return false}if(typeof onCreated==='function')onCreated(course);saveState();render();queueSync();return true}});
}


function removeCourse(id){
  const course=state.courses.find(c=>c.id===id);if(!course)return;
  const sessionIds=new Set();
  const assigned=new Set(state.inbox.flatMap(b=>b.photoIds||[]));
  for(const other of state.courses)if(other.id!==id)for(const section of other.sections)for(const session of section.sessions)for(const photoId of session.photoIds||[])assigned.add(photoId);
  for(const section of course.sections)for(const session of section.sessions){
    sessionIds.add(session.id);
    const photoIds=[...new Set(session.photoIds||[])].filter(photoId=>!assigned.has(photoId));
    photoIds.forEach(photoId=>assigned.add(photoId));
    if(photoIds.length)state.inbox.push({id:uid(),title:`${course.name} · ${session.title}`,photoIds,createdAt:session.createdAt||now()});
  }
  state.courses=state.courses.filter(c=>c.id!==id);
  if(state.cameraLast?.courseId===id)state.cameraLast=null;
  if(Array.isArray(state.timetable))state.timetable=state.timetable.filter(t=>t.courseId!==id);
  state.favorites=state.favorites.filter(f=>f!==id&&!sessionIds.has(f));
  if(currentCourseId===id){currentCourseId=null;currentSectionId=null;currentSessionId=null}
}

// ---------- Sections and séances ----------
// What happens to the content: photos that no other séance or capture batch holds go back to "Captures à trier"
// (as when a course is deleted), PDFs stay in Fichiers, and the handwriting of a removed séance is deleted with it.
function removeSessions(course,section,sessions){
  const gone=new Set(sessions.map(q=>q.id));
  const assigned=new Set(state.inbox.flatMap(b=>b.photoIds||[]));
  for(const c of state.courses)for(const s of c.sections)for(const q of s.sessions)if(!gone.has(q.id))for(const id of q.photoIds||[])assigned.add(id);
  for(const q of sessions){
    const photoIds=[...new Set(q.photoIds||[])].filter(id=>!assigned.has(id));
    photoIds.forEach(id=>assigned.add(id));
    if(photoIds.length)state.inbox.push({id:uid(),title:`${course.name} · ${section.name} · ${q.title}`,photoIds,createdAt:q.createdAt||now()});
  }
  section.sessions=section.sessions.filter(q=>!gone.has(q.id));
  state.favorites=state.favorites.filter(f=>!gone.has(f));
  for(const f of state.files)if(Array.isArray(f.sessionIds))f.sessionIds=f.sessionIds.filter(id=>!gone.has(id));
  if(state.cameraLast&&gone.has(state.cameraLast.sessionId))state.cameraLast={...state.cameraLast,sessionId:null};
  if(gone.has(currentSessionId))currentSessionId=null;
}

function removeSection(course,section){
  const sessionIds=section.sessions.map(q=>q.id);
  removeSessions(course,section,[...section.sessions]);
  course.sections=course.sections.filter(s=>s.id!==section.id);
  if(state.cameraLast?.sectionId===section.id)state.cameraLast=null;
  if(Array.isArray(state.timetable))state.timetable=state.timetable.filter(t=>t.sectionId!==section.id);
  if(currentSectionId===section.id){currentSectionId=null;currentSessionId=null}
  return sessionIds;
}
