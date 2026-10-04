// Accueil — tableau de bord de l'étudiant.
async function renderHome(){
  setChrome(false);
  const latest=lastCapturedSession();
  const courses=state.courses.slice(0,3);

  // Capture rapide card: the same panel as Lecture rapide (two turning rings round the trigger, a large title, a round
  // Reprendre button with a caption below: where the last photo went + whether that séance holds handwriting).
  const hero=QuickCaptureCard({id:'heroQuick',latest,hand:latest?await sessionHasHandwriting(latest.session):false});

  app.innerHTML=`<section class="screen">
    ${PageHeader({logo:true})}
    <div class="page-intro"><p class="greeting">Bonjour${firstName()?` ${esc(firstName())}`:''} 👋</p><h1 class="hero-title">Prêt à apprendre aujourd’hui ?</h1></div>
    ${hero}
    ${SectionTitle('Mes cours',{action:'Voir tout',nav:'courses'})}
    ${courses.length?`<div class="category-grid" id="homeCourses">${courses.map((c,i)=>{const v=courseVisual(c,i),s=courseStats(c);return CategoryCard({tone:v.tone,iconName:v.iconName,title:c.name,meta:`${s.filled}/${s.sections} sections · ${plural(s.sessions,'séance')}`,pct:s.pct,attrs:`data-course="${c.id}"`})}).join('')}</div>${courses.length>1?'<p class="reorder-hint">Maintenez un cours puis faites-le glisser pour changer son ordre.</p>':''}`
      :EmptyState({iconName:'book',title:'Aucun cours',text:'Ajoutez votre premier cours pour commencer.',action:ActionButton({label:'Ajouter un cours',attrs:'data-nav="courses"',full:false})})}
    ${SectionTitle('Révisions du jour')}
    <div class="list-stack">
      ${ListCard({iconName:'users',tone:'peach',title:'Holioo Shares',meta:'Documents partagés avec vous',attrs:'data-nav="holiooShares"'})}
      ${QuickReadingTrigger({id:'readQuick'})}
      ${ListCard({iconName:'fileText',tone:'mint',title:'PDF partagés',meta:'Vos PDF publiés ou envoyés',attrs:'data-nav="mySharedPdfs"'})}
    </div>
  </section>`;

  bindCourseCards();
  // The three courses shown here can be reordered; the new order is the order of the whole list (the others keep their place after them).
  const grid=byId('homeCourses');
  if(grid)makeReorderable(grid,{itemSelector:'[data-course]',idAttribute:'course',handle:false,onChange:ids=>{
    const all=new Map(state.courses.map(c=>[c.id,c]));
    state.courses=[...ids.map(id=>all.get(id)).filter(Boolean),...state.courses.filter(c=>!ids.includes(c.id))];
    saveState();queueSync();showToast('Ordre des cours enregistré');
  }});
  const heroQuick=byId('heroQuick');
  attachQuickCapture(heroQuick,heroQuick?.hasAttribute('data-desk-notes')?openQuickNotes:undefined);
  attachQuickReading(byId('readQuick'));
  byId('readQuickResume')?.addEventListener('click',resumeLastReading);
  byId('heroResume')?.addEventListener('click',()=>resumeQuickCapture(latest));
}

function firstName(){const n=(state.profile.displayName||'').trim();return n&&n!=='Étudiant'?n.split(/\s+/)[0]:''}
