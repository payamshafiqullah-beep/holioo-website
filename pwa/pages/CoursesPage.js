// Cours — vue d'ensemble académique.
let coursesFilter='all';

function renderCourses(){
  setChrome(false);
  app.innerHTML=`<section class="screen">
    ${PageHeader({title:'Mes cours',large:true})}
    ${SearchBar({id:'courseSearch',placeholder:'Rechercher un cours...'})}
    ${FilterChips('courseFilters',[{value:'all',label:'Tous'},{value:'active',label:'Actifs'},{value:'review',label:'À revoir'},{value:'done',label:'Terminés'}],coursesFilter)}
    <div class="card-stack" id="courseList">${state.courses.map((c,i)=>CourseCard(c,i)).join('')}</div>
    <div id="courseEmpty" hidden>${EmptyState({iconName:'search',title:'Aucun cours ici',text:'Essayez un autre filtre ou une autre recherche.'})}</div>
    ${ActionButton({label:'Ajouter un cours',id:'addCourse',variant:'soft',iconName:'plus'})}
  </section>`;
  bindCourseCards();
  bindListFilter({searchId:'courseSearch',chipsId:'courseFilters',scope:'#courseList',onChange:({kind,shown})=>{coursesFilter=kind;byId('courseEmpty').hidden=!!shown}});
  byId('addCourse').onclick=()=>openSheet({title:'Nouveau cours',subtitle:'Les sections CM, TD et TP sont créées automatiquement.',body:Field({label:'Nom du cours',id:'newCourseName',placeholder:'Ex. Traitement du signal'}),onConfirm:()=>{const name=byId('newCourseName').value.trim();if(!name){showToast('Entrez un nom de cours');return false}const colors=['#5B67F1','#8C5CF5','#FF8A4C','#29ADB5'];state.courses.push(sampleCourse(name,colors[state.courses.length%colors.length]));saveState();render();queueSync();return true}});
}
