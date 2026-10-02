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
  makeReorderable(list,{itemSelector:'[data-course]',idAttribute:'course',onChange:ids=>{
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
  const sessions=course.sections.flatMap(s=>s.sessions),sessionIds=new Set(sessions.map(s=>s.id));
  keepPhotosOfRemovedSessions(course,sessions);
  state.courses=state.courses.filter(c=>c.id!==id);
  if(state.cameraLast?.courseId===id)state.cameraLast=null;
  if(Array.isArray(state.timetable))state.timetable=state.timetable.filter(t=>t.courseId!==id);
  state.favorites=state.favorites.filter(f=>f!==id&&!sessionIds.has(f));
  if(currentCourseId===id){currentCourseId=null;currentSectionId=null;currentSessionId=null}
}
