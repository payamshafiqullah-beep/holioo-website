// Détail d'un cours — sections CM / TD / TP / personnalisées.
function renderCourse(){
  const c=getCourse();if(!c){navigate('courses');return}
  ensureDefaultSections(c);saveState();
  const v=courseVisual(c,state.courses.indexOf(c)),s=courseStats(c);
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Cours'})}
    <div class="detail-hero tone-${v.tone}">${IconBadge(v.iconName,v.tone,'lg')}<div><p class="eyebrow">COURS${c.done?' · TERMINÉ':''}</p><h1 class="hero-title">${esc(c.name)}</h1></div></div>
    <div class="stat-grid three">
      ${StatCard({tone:'lavender',iconName:'layers',value:s.sessions,label:'Séances'})}
      ${StatCard({tone:'peach',iconName:'image',value:s.photos,label:'Photos'})}
      ${StatCard({tone:'mint',iconName:'checkCircle',value:`${s.pct}%`,label:'Sections'})}
    </div>
    ${SectionTitle('Sections',{count:c.sections.length})}
    <div class="list-stack">${c.sections.map(x=>`<div class="managed-row">${ListCard({iconName:x.type==='CUSTOM'?'sparkles':'layers',tone:sectionTone(x.name),title:x.name,meta:x.sessions.length?`${plural(x.sessions.length,'séance')} · dernière le ${fmtShort(x.sessions.at(-1).createdAt)}`:'Aucune séance',attrs:`data-section="${x.id}"`})}<button class="course-delete" data-delete-section="${x.id}" aria-label="Supprimer la section ${esc(x.name)}">${icon('trash',{size:20})}</button></div>`).join('')}</div>
    <div class="button-stack">
      ${ActionButton({label:'Ajouter une section',id:'addSection',variant:'soft',iconName:'plus'})}
      ${ActionButton({label:'Renommer le cours',id:'renameCourse',variant:'ghost',iconName:'pencil'})}
      ${ActionButton({label:c.done?'Réactiver ce cours':'Marquer comme terminé',id:'toggleDone',variant:'ghost',iconName:c.done?'refresh':'checkCircle'})}
    </div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('courses');
  document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{currentSectionId=b.dataset.section;navigate('section')});
  document.querySelectorAll('[data-delete-section]').forEach(b=>b.onclick=()=>confirmDeleteSection(c.id,b.dataset.deleteSection));
  byId('toggleDone').onclick=()=>{c.done=!c.done;saveState();queueSync();showToast(c.done?'Cours marqué comme terminé':'Cours réactivé');render()};
  byId('addSection').onclick=()=>openSheet({title:'Section personnalisée',subtitle:'Projet, Révision, Examen, Tutorat, Lab…',body:Field({label:'Nom de la section',id:'sectionName',placeholder:'Ex. Projet'}),onConfirm:()=>{const n=byId('sectionName').value.trim();const problem=sectionNameProblem(c,n);if(problem){showToast(problem);return false}c.sections.push({id:uid(),name:n,type:'CUSTOM',sortOrder:c.sections.length,sessions:[]});saveState();render();return true}});
  byId('renameCourse').onclick=()=>openSheet({title:'Renommer le cours',body:Field({label:'Nom du cours',id:'renameCourseValue',value:c.name}),onConfirm:()=>{
    const name=byId('renameCourseValue').value.trim();if(name===c.name)return true;
    const problem=courseNameProblem(name,c.id);if(problem){showToast(problem);return false}
    c.name=name;saveState();queueSync();render();showToast('Cours renommé');return true;
  }});
}
