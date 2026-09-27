function homeSvgIcon(kind){
  const icons={
    chip:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    sigma:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 5H7l5 7-5 7h10.5"/></svg>',
    resistor:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h4l1.2-3h2.6l1.2 6h2.6l1.2-6h2.6l1.2 3H22"/></svg>',
    photo:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17 4.5-4.5L13 16l2-2 4 4"/></svg>',
    pdf:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M9.5 13h5M9.5 16h5"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3z"/><path d="M9.5 19a3 3 0 0 0 5 0"/></svg>',
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5z"/></svg>'
  };
  return icons[kind]||'';
}
function homeCourseIcon(course,index){
  const name=(course?.name||'').toLowerCase();
  if(name.includes('math'))return{kind:'sigma',tone:'green'};
  if(name.includes('électron')||name.includes('electron'))return{kind:'resistor',tone:'rose'};
  if(name.includes('vhdl'))return{kind:'chip',tone:'violet'};
  return [{kind:'chip',tone:'violet'},{kind:'sigma',tone:'green'},{kind:'resistor',tone:'rose'}][index%3];
}
function homeCourseProgress(course){
  const sessions=course.sections.reduce((sum,s)=>sum+(s.sessions?.length||0),0);
  const target=Math.max(6,Math.min(18,sessions+8));
  return{sessions,target,pct:Math.max(12,Math.min(92,Math.round((sessions/target)*100)||28))};
}
async function renderHome(){
  setChrome(false);
  appShell.classList.add('home-modern');

  const inboxCount=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  const firstCourse=state.courses[0]||null;
  let continueCourse=firstCourse;
  let continueSection=null;
  let continueSession=null;

  outer:
  for(const course of state.courses){
    for(const section of course.sections||[]){
      if(section.sessions?.length){
        continueCourse=course;
        continueSection=section;
        continueSession=section.sessions[section.sessions.length-1];
        break outer;
      }
    }
  }

  const displayName=state.profile.displayName&&state.profile.displayName!=='Étudiant'?state.profile.displayName:'';
  const heroTitle=continueSession?continueSession.title:(continueCourse?continueCourse.name:'Votre prochain cours');
  const heroMeta=continueSession
    ? `${continueSection?.name||'Session'} • ${continueSession.photoIds?.length||0} photo${(continueSession.photoIds?.length||0)>1?'s':''}`
    : (continueCourse?'Prêt pour votre prochaine séance':'Ajoutez votre premier cours');

  const heroTarget=continueSession
    ? `data-session-home="${continueSession.id}"`
    : (continueCourse?`data-course="${continueCourse.id}"`:'data-nav="courses"');

  app.innerHTML=`
    <section class="home-v5">
      <div class="home-v5-top">
        <div class="home-v5-brand">
          <span class="home-v5-wordmark">Holioo<span></span></span>
          <div class="home-v5-greeting">Bonjour${displayName?` ${esc(displayName)}`:''} 👋</div>
        </div>
        <div class="home-v5-actions">
          <button class="home-v5-icon-btn" id="homeNotify" aria-label="Notifications">
            ${homeSvgIcon('bell')}
            ${inboxCount?'<span class="home-v5-alert-dot"></span>':''}
          </button>
          <button class="home-v5-avatar" data-nav="profile" aria-label="Profil">
            ${esc(iconLetter(state.profile.displayName))}
          </button>
        </div>
      </div>

      <h1 class="home-v5-title">Prêt à étudier<br>aujourd’hui&nbsp;?</h1>

      <button class="home-v5-hero" ${heroTarget}>
        <div class="home-v5-hero-copy">
          <span class="home-v5-kicker">CONTINUER</span>
          <strong>${esc(heroTitle)}</strong>
          <small>${esc(heroMeta)}</small>
          <span class="home-v5-resume">${homeSvgIcon('play')} Reprendre</span>
        </div>
        <div class="home-v5-hero-art">
          <div class="home-v5-note back"></div>
          <div class="home-v5-note front">
            <span class="home-v5-note-icon">${homeSvgIcon('chip')}</span>
            <b>${esc((continueCourse?.name||'Holioo').slice(0,12))}</b>
            <i></i><i></i><i></i>
          </div>
        </div>
      </button>

      <div class="home-v5-section-head">
        <h2>Mes cours</h2>
        <button data-nav="courses">Voir tout <span>›</span></button>
      </div>

      <div class="home-v5-course-grid">
        ${state.courses.slice(0,3).map((course,index)=>{
          const visual=homeCourseIcon(course,index),p=homeCourseProgress(course);
          return `<button class="home-v5-course-card ${visual.tone}" data-course="${course.id}">
            <span class="home-v5-course-icon">${homeSvgIcon(visual.kind)}</span>
            <strong>${esc(course.name)}</strong>
            <small>${p.sessions}/${p.target} séances</small>
            <span class="home-v5-progress"><i style="width:${p.pct}%"></i></span>
          </button>`;
        }).join('')}
      </div>

      <div class="home-v5-section-head review">
        <h2>Révisions du jour</h2>
      </div>

      <div class="home-v5-task-list">
        <button class="home-v5-task" id="homeInboxTask">
          <span class="home-v5-task-icon amber">${homeSvgIcon('photo')}</span>
          <span class="home-v5-task-copy">
            <strong>Photos à classer</strong>
            <small>${inboxCount} photo${inboxCount>1?'s':''} • 5 min</small>
          </span>
          <span class="home-v5-task-arrow">›</span>
        </button>

        <button class="home-v5-task" data-nav="files">
          <span class="home-v5-task-icon purple">${homeSvgIcon('pdf')}</span>
          <span class="home-v5-task-copy">
            <strong>Créer PDF</strong>
            <small>${state.files.length} fichier${state.files.length>1?'s':''} • 2 min</small>
          </span>
          <span class="home-v5-task-arrow">›</span>
        </button>
      </div>
    </section>`;

  bindCourseCards();

  document.getElementById('homeNotify')?.addEventListener('click',()=>navigate(inboxCount?'inbox':'sync'));
  document.getElementById('homeInboxTask')?.addEventListener('click',()=>navigate(inboxCount?'inbox':'capture'));

  document.querySelectorAll('[data-session-home]').forEach(btn=>btn.onclick=()=>{
    const found=findSessionContext(btn.dataset.sessionHome);
    if(!found)return;
    currentCourseId=found.course.id;
    currentSectionId=found.section.id;
    currentSessionId=found.session.id;
    navigate('session');
  });
}
