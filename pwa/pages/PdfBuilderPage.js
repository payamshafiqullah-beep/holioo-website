// Créer un PDF — sélection de séances et options de mise en page.
function renderPdfBuilder(){
  const ctx=findSessionContext();if(!ctx){navigate('files');return}
  const{course,session}=ctx;
  const allSessions=course.sections.flatMap(s=>s.sessions.map(q=>({section:s,session:q}))).filter(x=>x.session.photoIds.length);
  const toggle=(id,title,meta,checked=true)=>`<label class="toggle-card"><span class="list-card-copy"><strong>${title}</strong><small>${meta}</small></span><input type="checkbox" id="${id}" class="switch" ${checked?'checked':''}></label>`;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:course.name,actions:false})}
    ${PageIntro({eyebrow:'PDF',title:'Créer un PDF',subtitle:'Sélectionnez une ou plusieurs séances du même cours.'})}
    <div class="form-card">${Field({label:'Titre du document',id:'pdfTitle',value:`${course.name} — ${session.title}`})}</div>
    ${SectionTitle('Séances')}
    <div class="list-stack">${allSessions.map(({section,session:q})=>`<label class="check-card"><input type="checkbox" class="pdfSession" value="${q.id}" ${q.id===session.id?'checked':''}>${IconBadge('layers',sectionTone(section.name),'sm')}<span class="list-card-copy"><strong>${esc(q.title)}</strong><small>${esc(section.name)} · ${plural(q.photoIds.length,'photo')}</small></span><i class="check-mark">${icon('check',{size:16,stroke:2.6})}</i></label>`).join('')}</div>
    ${SectionTitle('Mise en page')}
    <div class="list-stack">
      ${toggle('pdfCover','Page de couverture','Cours, année universitaire et titre')}
      ${toggle('pdfToc','Table des matières','Sections et séances')}
      ${toggle('pdfNumbers','Numéros de page','Ajoutés en pied de page')}
    </div>
    ${ActionButton({label:'Générer le PDF',id:'generatePdf',iconName:'fileText'})}
  </section>`;
  byId('backBtn').onclick=()=>navigate('session');
  byId('generatePdf').onclick=async()=>{const ids=[...document.querySelectorAll('.pdfSession:checked')].map(x=>x.value);if(!ids.length){showToast('Sélectionnez au moins une séance');return}await generatePdfFile(course,ids,{title:byId('pdfTitle').value.trim()||course.name,cover:byId('pdfCover').checked,toc:byId('pdfToc').checked,numbers:byId('pdfNumbers').checked})};
}
