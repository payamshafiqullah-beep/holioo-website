// Cours — vue d'ensemble académique.
let coursesFilter='all';

function renderCourses(){
  setChrome(false);
  app.innerHTML=`<section class="screen">
    ${PageHeader({title:'Mes cours',large:true})}
    ${SearchBar({id:'courseSearch',placeholder:'Rechercher un cours...'})}
    ${FilterChips('courseFilters',[{value:'all',label:'Tous'},{value:'active',label:'Actifs'},{value:'review',label:'À revoir'},{value:'done',label:'Terminés'}],coursesFilter)}
    <p class="reorder-hint">Maintenez un cours puis faites-le glisser pour changer son ordre.</p>
    <div class="card-stack" id="courseList">${state.courses.map((c,i)=>CourseCard(c,i,true)).join('')}</div>
    <div id="courseEmpty" hidden>${EmptyState({iconName:'search',title:'Aucun cours ici',text:'Essayez un autre filtre ou une autre recherche.'})}</div>
    ${ActionButton({label:'Ajouter un cours',id:'addCourse',variant:'soft',iconName:'plus'})}
  </section>`;
  bindCourseCards();
  const list=byId('courseList');
  makeReorderable(list,{itemSelector:'[data-course]',idAttribute:'course',handle:false,onChange:ids=>{
    const courses=new Map(state.courses.map(c=>[c.id,c]));
    state.courses=ids.map(id=>courses.get(id)).filter(Boolean);
    saveState();queueSync();showToast('Ordre des cours enregistré');
  }});
  list.querySelectorAll('[data-course]').forEach(card=>card.onkeydown=e=>{
    if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click()}
  });
  list.querySelectorAll('[data-delete-course]').forEach(button=>button.onclick=e=>{
    e.stopPropagation();confirmDeleteCourse(button.dataset.deleteCourse);
  });
  bindListFilter({searchId:'courseSearch',chipsId:'courseFilters',scope:'#courseList',onChange:({kind,shown})=>{coursesFilter=kind;byId('courseEmpty').hidden=!!shown}});
  byId('addCourse').onclick=openNewCourseSheet;
}

// Also opened from Quick Capture on Accueil when there is no course yet.
function openNewCourseSheet(){
  openSheet({title:'Nouveau cours',subtitle:'Les sections CM, TD et TP sont créées automatiquement.',body:Field({label:'Nom du cours',id:'newCourseName',placeholder:'Ex. Traitement du signal'}),onConfirm:()=>{const name=byId('newCourseName').value.trim();if(!name){showToast('Entrez un nom de cours');return false}const colors=['#5B67F1','#8C5CF5','#FF8A4C','#29ADB5'];state.courses.push(sampleCourse(name,colors[state.courses.length%colors.length]));saveState();render();queueSync();return true}});
}


function confirmDeleteCourse(id){
  const course=state.courses.find(c=>c.id===id);if(!course)return;
  openSheet({title:`Supprimer « ${course.name} » ?`,subtitle:'Le cours et ses séances seront retirés. Ses photos seront conservées dans « Captures à trier » et les PDF resteront dans vos fichiers.',confirmText:'Supprimer',confirmClass:'coral',onConfirm:()=>{
    const sessionIds=course.sections.flatMap(s=>s.sessions.map(q=>q.id));
    removeCourse(id);saveState();queueSync();render();showToast('Cours supprimé');
    purgeSessionInk(sessionIds).catch(console.warn);return true;
  }});
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

const keptNote=photos=>photos?`Les photos (${photos}) seront conservées dans « Captures à trier ». Les PDF déjà créés restent dans Fichiers.`:'Les PDF déjà créés restent dans Fichiers.';

async function confirmDeleteSession(courseId,sectionId,sessionId){
  const course=state.courses.find(c=>c.id===courseId),section=course?.sections.find(s=>s.id===sectionId),session=section?.sessions.find(q=>q.id===sessionId);
  if(!session)return;
  const photos=new Set(session.photoIds||[]).size,ink=await sessionHasNotebookInk(session);
  openSheet({title:`Supprimer « ${session.title} » ?`,subtitle:`${keptNote(photos)}${ink?' Les notes manuscrites de cette séance seront supprimées.':''}`,confirmText:'Supprimer',confirmClass:'coral',onConfirm:()=>{
    removeSessions(course,section,[session]);saveState();queueSync();render();showToast('Séance supprimée');
    purgeSessionInk([session.id]).catch(console.warn);return true;
  }});
}

async function confirmDeleteSection(courseId,sectionId){
  const course=state.courses.find(c=>c.id===courseId),section=course?.sections.find(s=>s.id===sectionId);
  if(!section)return;
  const photos=new Set(section.sessions.flatMap(q=>q.photoIds||[])).size;
  const ink=(await Promise.all(section.sessions.map(q=>sessionHasNotebookInk(q)))).some(Boolean);
  const content=section.sessions.length?`Cette section contient ${plural(section.sessions.length,'séance')} et ${plural(photos,'photo')}. `:'Cette section est vide. ';
  openSheet({title:`Supprimer la section « ${section.name} » ?`,subtitle:`${content}${keptNote(photos)}${ink?' Les notes manuscrites de ses séances seront supprimées.':''}`,confirmText:'Supprimer',confirmClass:'coral',onConfirm:()=>{
    const sessionIds=removeSection(course,section);saveState();queueSync();render();showToast('Section supprimée');
    purgeSessionInk(sessionIds).catch(console.warn);return true;
  }});
}
