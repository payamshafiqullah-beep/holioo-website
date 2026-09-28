function coursePastelVisual(course,index){
  const n=(course?.name||'').toLowerCase();
  if(n.includes('math'))return{tone:'sky',icon:'calc'};
  if(n.includes('vhdl'))return{tone:'peach',icon:'chip'};
  if(n.includes('svt')||n.includes('bio'))return{tone:'mint',icon:'leaf'};
  if(n.includes('électron')||n.includes('electron'))return{tone:'lavender',icon:'chip'};
  if(n.includes('droit'))return{tone:'pink',icon:'law'};
  return[{tone:'sky',icon:'calc'},{tone:'peach',icon:'chip'},{tone:'mint',icon:'leaf'},{tone:'lavender',icon:'chip'},{tone:'pink',icon:'law'}][index%5]
}
function coursePastelIcon(kind){
  const m={
    calc:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/></svg>',
    chip:'<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    leaf:'<svg viewBox="0 0 24 24"><path d="M19 4C11 4 5 8 5 14c0 3 2 5 5 5 6 0 9-7 9-15Z"/><path d="M5 20c2-5 6-8 11-10"/></svg>',
    law:'<svg viewBox="0 0 24 24"><path d="M4 20h16M6 18V9m4 9V9m4 9V9m4 9V9M3 9h18L12 3z"/></svg>'
  };return m[kind]||m.chip
}
function renderCourses(){
  setChrome(false);appShell.classList.add('pastel-main-view');
  app.innerHTML=`
    <section class="pastel-screen courses-pastel">
      ${pastelBrandHeader({kicker:'Mes cours',title:'Organisez votre apprentissage',subtitle:'Accédez à tous vos cours, suivez votre progression et continuez où vous en êtes.'})}
      <label class="pastel-search"><span>⌕</span><input id="courseSearch" type="search" placeholder="Rechercher un cours..."></label>
      <div class="pastel-filter-row" id="courseFilters">
        <button class="active" data-filter="all">Tous</button><button data-filter="active">Actifs</button><button data-filter="review">À revoir</button><button data-filter="done">Terminés</button>
      </div>
      <div class="pastel-course-list" id="pastelCourseList"></div>
      <button class="pastel-primary-cta" id="addCourse">+ Ajouter un cours</button>
    </section>`;
  const list=byId('pastelCourseList');
  const draw=(query='')=>{
    const q=query.trim().toLowerCase(),items=state.courses.filter(c=>!q||c.name.toLowerCase().includes(q));
    list.innerHTML=items.length?items.map((c,i)=>{
      const visual=coursePastelVisual(c,i);
      const sessions=c.sections.reduce((a,s)=>a+(s.sessions?.length||0),0);
      const photos=c.sections.reduce((a,s)=>a+s.sessions.reduce((x,q)=>x+(q.photoIds?.length||0),0),0);
      const pct=Math.max(12,Math.min(88,Math.round((sessions/(sessions+8||1))*100)||35));
      return `<button class="pastel-course-row ${visual.tone}" data-course="${c.id}">
        <span class="pastel-row-icon">${coursePastelIcon(visual.icon)}</span>
        <span class="pastel-row-copy"><strong>${esc(c.name)}</strong><small>${c.sections.length} sections • ${sessions} séances</small><em>${photos} photos • CM / TD / TP</em><span class="pastel-progress"><i style="width:${pct}%"></i></span></span>
        <span class="pastel-row-pct">${pct}%</span><span class="pastel-row-menu">•••</span>
      </button>`
    }).join(''):'<div class="pastel-empty-wide">Aucun cours trouvé.</div>';
    bindCourseCards()
  };
  draw();
  byId('courseSearch').oninput=e=>draw(e.target.value);
  document.querySelectorAll('#courseFilters button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#courseFilters button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  byId('addCourse').onclick=()=>openSheet({title:'Nouveau cours',subtitle:'Vous pourrez ajouter CM, TD, TP et vos sections personnalisées.',body:'<div class="field"><label>Nom du cours</label><input id="newCourseName" placeholder="Ex. Traitement du signal"></div>',onConfirm:()=>{const name=byId('newCourseName').value.trim();if(!name){showToast('Entrez un nom de cours');return false}const colors=['#5B67F1','#8C5CF5','#FF8A4C','#29ADB5'];state.courses.push(sampleCourse(name,colors[state.courses.length%colors.length]));saveState();render();queueSync();return true}})
}
