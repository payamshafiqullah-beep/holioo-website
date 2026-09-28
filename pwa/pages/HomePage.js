function homeSvgIcon(kind){
  const icons={
    law:'<svg viewBox="0 0 24 24"><path d="M4 20h16M6 18V9m4 9V9m4 9V9m4 9V9M3 9h18L12 3z"/></svg>',
    calc:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/></svg>',
    leaf:'<svg viewBox="0 0 24 24"><path d="M19 4C11 4 5 8 5 14c0 3 2 5 5 5 6 0 9-7 9-15Z"/><path d="M5 20c2-5 6-8 11-10"/></svg>',
    note:'<svg viewBox="0 0 24 24"><path d="M7 3h8l3 3v15H7z"/><path d="M15 3v4h4M10 12h5M10 16h5"/></svg>',
    brain:'<svg viewBox="0 0 24 24"><path d="M9 5a3 3 0 0 0-5 2.2A3 3 0 0 0 4 13a3 3 0 0 0 4 4 3 3 0 0 0 4 2V6a3 3 0 0 0-3-3ZM15 5a3 3 0 0 1 5 2.2A3 3 0 0 1 20 13a3 3 0 0 1-4 4 3 3 0 0 1-4 2V6a3 3 0 0 1 3-3Z"/></svg>',
    stats:'<svg viewBox="0 0 24 24"><rect x="4" y="13" width="3" height="7" rx="1"/><rect x="10.5" y="8" width="3" height="12" rx="1"/><rect x="17" y="4" width="3" height="16" rx="1"/></svg>',
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>'
  };return icons[kind]||icons.note
}
function homeCourseVisual(course,index){
  const n=(course?.name||'').toLowerCase();
  if(n.includes('droit'))return{tone:'pink',icon:'law'};
  if(n.includes('math'))return{tone:'sky',icon:'calc'};
  if(n.includes('svt')||n.includes('bio'))return{tone:'mint',icon:'leaf'};
  return [{tone:'pink',icon:'law'},{tone:'sky',icon:'calc'},{tone:'mint',icon:'leaf'}][index%3]
}
function homeCourseProgress(course){
  const sessions=course.sections.reduce((a,s)=>a+(s.sessions?.length||0),0);
  const target=Math.max(6,sessions+8),pct=Math.min(92,Math.max(18,Math.round(sessions/target*100)||35));
  return{sessions,target,pct}
}
async function renderHome(){
  setChrome(false);
  appShell.classList.add('home-modern','pastel-main-view');
  const inboxCount=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  const courses=state.courses.slice(0,3);
  app.innerHTML=`
    <section class="pastel-screen home-pastel">
      ${pastelBrandHeader({kicker:'Bonjour 👋',title:'Prêt(e) à continuer votre apprentissage ?',subtitle:'Capturez, organisez et révisez vos cours simplement avec Holioo.'})}
      <button class="pastel-feature-card" data-nav="capture">
        <div class="pastel-feature-copy">
          <span>À LA UNE</span>
          <h2>Transformez vos cours en fiches claires</h2>
          <p>Prenez une photo, Holioo organise vos notes et les prépare pour vos révisions.</p>
          <b>Essayer maintenant <i>→</i></b>
        </div>
        <div class="pastel-feature-art" aria-hidden="true">
          <div class="sheet back"></div>
          <div class="sheet front"><i></i><i></i><i></i><i></i></div>
          <span>✦</span>
        </div>
      </button>
      ${sectionHeading('Mes cours','Voir tout','courses')}
      <div class="pastel-course-grid">
        ${courses.length?courses.map((c,i)=>{const v=homeCourseVisual(c,i),p=homeCourseProgress(c);return `
          <button class="pastel-mini-course ${v.tone}" data-course="${c.id}">
            <span class="pastel-icon-badge">${homeSvgIcon(v.icon)}</span>
            <strong>${esc(c.name)}</strong>
            <small>${p.sessions} séances • ${c.sections.length} sections</small>
            <span class="pastel-progress"><i style="width:${p.pct}%"></i></span>
            <em>${p.pct}%</em>
          </button>`}).join(''):'<div class="pastel-empty-wide">Ajoutez votre premier cours pour commencer.</div>'}
      </div>
      ${sectionHeading('Réviser rapidement','Voir tout','library')}
      <div class="pastel-quick-grid">
        <button class="pastel-quick-card peach" data-nav="library"><span>${homeSvgIcon('note')}</span><div><strong>Mes fiches</strong><small>Relisez vos documents par matière</small></div><b>›</b></button>
        <button class="pastel-quick-card lavender" data-nav="library"><span>${homeSvgIcon('brain')}</span><div><strong>Quiz</strong><small>Testez vos connaissances</small></div><b>›</b></button>
        <button class="pastel-quick-card mint" data-nav="courses"><span>${homeSvgIcon('stats')}</span><div><strong>Statistiques</strong><small>Suivez vos progrès</small></div><b>›</b></button>
        <button class="pastel-quick-card sky" id="homeInboxTask"><span>${homeSvgIcon('clock')}</span><div><strong>Révisions express</strong><small>${inboxCount} photo${inboxCount>1?'s':''} à organiser</small></div><b>›</b></button>
      </div>
    </section>`;
  bindCourseCards();
  byId('homeInboxTask')?.addEventListener('click',()=>navigate(inboxCount?'inbox':'capture'));
}
