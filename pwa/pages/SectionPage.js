// Section d'un cours — liste des séances (numérotation propre à chaque section).
function renderSection(){
  const c=getCourse(),s=getSection(c);if(!c||!s){navigate('courses');return}
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:c.name})}
    ${PageIntro({eyebrow:'SÉANCES',title:s.name,subtitle:`${c.name} · la numérotation est propre à cette section.`})}
    ${s.sessions.length?`<div class="list-stack">${s.sessions.map(q=>`<div class="managed-row">${ListCard({iconName:'image',tone:sectionTone(s.name),title:q.title,meta:`${plural(q.photoIds?.length||0,'photo')} · ${fmtShort(q.createdAt)}`,attrs:`data-session="${q.id}"`,tag:q.visibility==='public'?Tag('Public','mint'):''})}<button class="course-delete" data-delete-session="${q.id}" aria-label="Supprimer ${esc(q.title)}">${icon('trash',{size:20})}</button></div>`).join('')}</div>`
      :EmptyState({iconName:'layers',title:'Aucune séance',text:'Créez une séance puis ajoutez-y vos photos.'})}
    ${ActionButton({label:'Nouvelle séance',id:'newSession',iconName:'plus'})}
    <div class="button-stack">
      ${ActionButton({label:'Renommer la section',id:'renameSection',variant:'ghost',iconName:'pencil'})}
      ${ActionButton({label:'Supprimer la section',id:'deleteSection',variant:'ghost-danger',iconName:'trash'})}
    </div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('course');
  document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{currentSessionId=b.dataset.session;navigate('session')});
  document.querySelectorAll('[data-delete-session]').forEach(b=>b.onclick=()=>confirmDeleteSession(c.id,s.id,b.dataset.deleteSession));
  byId('newSession').onclick=()=>{const num=(s.sessions.at(-1)?.number||0)+1;openSheet({title:`Nouvelle séance ${s.name}`,subtitle:`Le titre automatique sera « ${s.name} ${num} ».`,body:Field({label:'Titre personnalisé (facultatif)',id:'sessionTitle',placeholder:`${s.name} ${num} — sujet`}),confirmText:'Créer',onConfirm:()=>{const q={id:uid(),number:num,title:byId('sessionTitle').value.trim()||`${s.name} ${num}`,photoIds:[],createdAt:now(),visibility:'private'};s.sessions.push(q);saveState();currentSessionId=q.id;navigate('session');return true}})};
  byId('renameSection').onclick=()=>openSheet({title:'Renommer la section',body:Field({label:'Nom de la section',id:'renameSectionValue',value:s.name}),onConfirm:()=>{
    const name=byId('renameSectionValue').value.trim();if(name===s.name)return true;
    const problem=sectionNameProblem(c,name,s.id);if(problem){showToast(problem);return false}
    s.name=name;saveState();queueSync();render();showToast('Section renommée');return true;
  }});
  byId('deleteSection').onclick=()=>confirmDeleteSection(c.id,s.id);
}
