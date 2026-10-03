// Organiser les photos — choisir cours, section et titre de séance.
async function renderOrganize(){
  if(!currentBatch){navigate('home');return}
  let c=getCourse();if(!c){c=state.courses[0];currentCourseId=c.id}
  ensureDefaultSections(c);
  if(!c.sections.length){currentCourseId=c.id;showToast('Ce cours n’a plus de section : ajoutez-en une d’abord');navigate('course');return}
  let s=getSection(c);if(!s){s=c.sections.find(x=>x.name==='TD')||c.sections[0];currentSectionId=s.id}
  const next=(s.sessions.at(-1)?.number||0)+1,n=currentBatch.photoIds.length;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Capture',actions:false})}
    ${PageIntro({eyebrow:'ORGANISER',title:'Organiser les photos',subtitle:'Choisissez où ranger ce lot.'})}
    <div class="thumbs compact" id="organizeThumbs"></div>
    <p class="reorder-hint">${icon('more',{size:14})}Maintenez une photo puis faites-la glisser pour changer l’ordre. Touchez la poignée pour la déplacer ou la supprimer.</p>
    <div class="form-card">
      <div class="field"><label for="orgCourse">Cours</label><select id="orgCourse">${state.courses.map(x=>`<option value="${x.id}" ${x.id===c.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="orgSection">Section</label><select id="orgSection">${c.sections.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
      ${Field({label:'Titre de séance',id:'orgTitle',placeholder:`${s.name} ${next}`})}
    </div>
    ${Notice(`${icon('image',{size:18})}<span>${plural(n,'photo sera enregistrée','photos seront enregistrées')} dans cette séance.</span>`,'lavender')}
    <div class="button-stack">
      ${ActionButton({label:'Enregistrer dans la séance',id:'assignBatch',iconName:'check'})}
      ${ActionButton({label:'Garder ce lot dans Captures',id:'moveInbox',variant:'ghost',iconName:'inbox'})}
    </div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('captureComplete');
  await fillThumbs('organizeThumbs',currentBatch.photoIds,{selectable:false,reorder:true});
  byId('orgCourse').onchange=e=>{currentCourseId=e.target.value;currentSectionId=null;render()};
  byId('orgSection').onchange=e=>{currentSectionId=e.target.value;render()};
  byId('assignBatch').onclick=()=>assignCurrentBatch(byId('orgTitle').value);
  byId('moveInbox').onclick=()=>{const nextBatch=currentBatch.splitQueue?.shift();saveBatchToInbox(currentBatch);if(nextBatch){currentBatch=nextBatch;navigate('organize')}};
}
