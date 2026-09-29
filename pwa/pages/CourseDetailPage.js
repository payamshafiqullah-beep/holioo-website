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
    <div class="list-stack">${c.sections.map(x=>ListCard({iconName:x.type==='CUSTOM'?'sparkles':'layers',tone:sectionTone(x.name),title:x.name,meta:x.sessions.length?`${plural(x.sessions.length,'séance')} · dernière le ${fmtShort(x.sessions.at(-1).createdAt)}`:'Aucune séance',attrs:`data-section="${x.id}"`})).join('')}</div>
    <div class="button-stack">
      ${ActionButton({label:'Ajouter une section',id:'addSection',variant:'soft',iconName:'plus'})}
      ${ActionButton({label:c.done?'Réactiver ce cours':'Marquer comme terminé',id:'toggleDone',variant:'ghost',iconName:c.done?'refresh':'checkCircle'})}
    </div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('courses');
  document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{currentSectionId=b.dataset.section;navigate('section')});
  byId('toggleDone').onclick=()=>{c.done=!c.done;saveState();queueSync();showToast(c.done?'Cours marqué comme terminé':'Cours réactivé');render()};
  byId('addSection').onclick=()=>openSheet({title:'Section personnalisée',subtitle:'Projet, Révision, Examen, Tutorat, Lab…',body:Field({label:'Nom de la section',id:'sectionName',placeholder:'Ex. Projet'}),onConfirm:()=>{const n=byId('sectionName').value.trim();if(!n)return false;c.sections.push({id:uid(),name:n,type:'CUSTOM',sortOrder:c.sections.length,sessions:[]});saveState();render();return true}});
}
