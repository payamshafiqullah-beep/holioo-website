// Section d'un cours — liste des séances (numérotation propre à chaque section).
function renderSection(){
  const c=getCourse(),s=getSection(c);if(!c||!s){navigate('courses');return}
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:c.name})}
    ${PageIntro({eyebrow:'SÉANCES',title:s.name,subtitle:`${c.name} · la numérotation est propre à cette section.`})}
    ${s.sessions.length?`<div class="list-stack">${s.sessions.map(q=>ListCard({iconName:'image',tone:sectionTone(s.name),title:q.title,meta:`${plural(q.photoIds?.length||0,'photo')} · ${fmtShort(q.createdAt)}`,attrs:`data-session="${q.id}"`,tag:q.visibility==='public'?Tag('Public','mint'):''})).join('')}</div>`
      :EmptyState({iconName:'layers',title:'Aucune séance',text:'Créez une séance puis ajoutez-y vos photos.'})}
    ${ActionButton({label:'Nouvelle séance',id:'newSession',iconName:'plus'})}
  </section>`;
  byId('backBtn').onclick=()=>navigate('course');
  document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{currentSessionId=b.dataset.session;navigate('session')});
  byId('newSession').onclick=()=>{const num=(s.sessions.at(-1)?.number||0)+1;openSheet({title:`Nouvelle séance ${s.name}`,subtitle:`Le titre automatique sera « ${s.name} ${num} ».`,body:Field({label:'Titre personnalisé (facultatif)',id:'sessionTitle',placeholder:`${s.name} ${num} — sujet`}),confirmText:'Créer',onConfirm:()=>{const q={id:uid(),number:num,title:byId('sessionTitle').value.trim()||`${s.name} ${num}`,photoIds:[],createdAt:now(),visibility:'private'};s.sessions.push(q);saveState();currentSessionId=q.id;navigate('session');return true}})};
}
