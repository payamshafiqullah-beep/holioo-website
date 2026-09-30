// Séance — galerie de photos, PDF, publication.
async function renderSession(){
  const ctx=findSessionContext();if(!ctx){navigate('courses');return}
  const{course,section,session}=ctx,n=session.photoIds.length,pub=session.visibility==='public';
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:`${course.name} · ${section.name}`})}
    ${PageIntro({eyebrow:'SÉANCE',title:session.title,subtitle:`${plural(n,'photo')} · ${fmtDate(session.createdAt)}`})}
    ${ActionButton({label:n?'Ajouter des photos':'Prendre des photos',id:'addSessionPhotos',variant:'capture',iconName:'camera',attrs:'data-nav="capture"'})}
    ${n?`${SectionTitle('Galerie',{action:'Plein écran',id:'openFirstPhoto'})}
      <div class="thumbs" id="sessionThumbs"></div>
      <p class="reorder-hint">${icon('more',{size:14})}Maintenez une photo ou faites glisser sa poignée pour changer l’ordre.</p>
      <div class="button-stack">
        ${ActionButton({label:'Créer un PDF',id:'buildPdf',iconName:'fileText'})}
        ${ActionButton({label:pub?'Publiée dans la bibliothèque':'Publier dans la bibliothèque',id:'publishSession',variant:pub?'soft':'ghost',iconName:pub?'checkCircle':'globe'})}
        ${ActionButton({label:'Reconnaître le texte',id:'ocrSession',variant:'ghost',iconName:'scan'})}
        ${ActionButton({label:'Exporter les images',id:'exportImages',variant:'ghost',iconName:'share'})}
        ${ActionButton({label:'Renommer la séance',id:'renameSession',variant:'ghost',iconName:'pencil'})}
      </div>`
    :`${EmptyState({iconName:'camera',title:'Aucune photo',text:'Cette séance ne contient pas encore de photos.'})}`}
  </section>`;
  byId('backBtn').onclick=()=>navigate('section');
  if(n){
    await fillSessionThumbs(session);
    byId('openFirstPhoto').onclick=()=>openPhotoViewer(session.photoIds,0,{title:session.title,source:'session',sourceId:session.id,editable:true,returnView:'session',courseId:course.id,sectionId:section.id,sessionId:session.id});
  }
  byId('buildPdf')?.addEventListener('click',()=>navigate('pdfBuilder'));
  byId('ocrSession')?.addEventListener('click',()=>recognizeSessionText(session));
  byId('exportImages')?.addEventListener('click',()=>exportSessionImages(course,section,session));
  if(n)updateSessionOcrLabel(session);
  byId('publishSession')?.addEventListener('click',()=>publishSession(course,section,session));
  byId('renameSession')?.addEventListener('click',()=>openSheet({title:'Renommer la séance',body:Field({label:'Titre',id:'renameValue',value:session.title}),onConfirm:()=>{session.title=byId('renameValue').value.trim()||session.title;saveState();render();queueSync();return true}}));
}
