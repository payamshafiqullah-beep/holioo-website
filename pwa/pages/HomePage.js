// Accueil — tableau de bord de l'étudiant.
async function renderHome(){
  setChrome(false);
  const inboxCount=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  const latest=latestSession();
  const courses=state.courses.slice(0,3);

  // Right of the card: Quick Capture (press, drag to a course then a section, release → camera).
  const quick=QuickCaptureTrigger({id:'heroQuick'});
  const hero=latest
    ?HeroCard({label:'CONTINUER',title:latest.session.title,subtitle:`${latest.section.name} · ${latest.course.name}`,cta:'Reprendre',ctaAttrs:'id="heroResume"',aside:quick})
    :HeroCard({label:'COMMENCER',title:'Votre première capture',subtitle:'Photographiez un cours, Holioo l’organise pour vous.',cta:'Capturer',ctaAttrs:'data-nav="capture"',aside:quick});

  app.innerHTML=`<section class="screen">
    ${PageHeader({logo:true})}
    <div class="page-intro"><p class="greeting">Bonjour${firstName()?` ${esc(firstName())}`:''} 👋</p><h1 class="hero-title">Prêt à apprendre aujourd’hui ?</h1></div>
    ${hero}
    ${SectionTitle('Mes cours',{action:'Voir tout',nav:'courses'})}
    ${courses.length?`<div class="category-grid" id="homeCourses">${courses.map((c,i)=>{const v=courseVisual(c,i),s=courseStats(c);return CategoryCard({tone:v.tone,iconName:v.iconName,title:c.name,meta:`${s.filled}/${s.sections} sections · ${plural(s.sessions,'séance')}`,pct:s.pct,attrs:`data-course="${c.id}"`})}).join('')}</div>${courses.length>1?'<p class="reorder-hint">Maintenez un cours puis faites-le glisser pour changer son ordre.</p>':''}`
      :EmptyState({iconName:'book',title:'Aucun cours',text:'Ajoutez votre premier cours pour commencer.',action:ActionButton({label:'Ajouter un cours',attrs:'data-nav="courses"',full:false})})}
    ${SectionTitle('Révisions du jour')}
    <div class="list-stack">
      ${ListCard({iconName:'layers',tone:'peach',title:'Captures à trier',meta:inboxCount?`${plural(inboxCount,'photo')} en attente de classement`:'Tout est classé',attrs:'id="homeInbox"'})}
      ${QuickReadingTrigger({id:'readQuick'})}
      ${ListCard({iconName:'users',tone:'mint',title:'Ressources partagées',meta:'Matériel publié par votre promotion',attrs:'data-nav="library"'})}
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
  byId('heroResume')?.addEventListener('click',()=>{currentCourseId=latest.course.id;currentSectionId=latest.section.id;currentSessionId=latest.session.id;navigate('session')});
  byId('homeInbox').onclick=()=>navigate(inboxCount?'inbox':'capture');
}

function firstName(){const n=(state.profile.displayName||'').trim();return n&&n!=='Étudiant'?n.split(/\s+/)[0]:''}
