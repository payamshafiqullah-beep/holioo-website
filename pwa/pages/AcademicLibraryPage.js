function libraryFileIcon(type=''){
  const t=(type||'').toLowerCase();
  if(t.includes('pdf'))return'<span class="pastel-lib-symbol pdf">PDF</span>';
  if(t.includes('photo')||t.includes('image'))return'<span class="pastel-lib-symbol image">▧</span>';
  return'<span class="pastel-lib-symbol doc">▤</span>'
}
async function renderLibrary(){
  setChrome(false);appShell.classList.add('pastel-main-view');
  const p=state.profile;
  if(!navigator.onLine||!sb){
    app.innerHTML=`<section class="pastel-screen">${pastelBrandHeader({title:'Ma bibliothèque',subtitle:'Vos contenus privés restent disponibles sur cet appareil.'})}<div class="pastel-empty-wide">Connexion au cloud indisponible pour le moment.</div></section>`;return
  }
  if(!p.university||!p.program){
    app.innerHTML=`<section class="pastel-screen">${pastelBrandHeader({title:'Ma bibliothèque',subtitle:'Ajoutez votre contexte académique pour afficher les ressources correspondantes.'})}<div class="pastel-notice">Université, filière, niveau et semestre permettent de filtrer votre bibliothèque académique.</div><button class="pastel-primary-cta" data-nav="profile">Compléter mon profil</button></section>`;return
  }
  if(currentLibrary.step==='years'){
    const{data=[]}=await sb.from('public_materials').select('academic_year,title,course,section,created_at,photo_count').eq('university',p.university).eq('program',p.program).eq('level',p.level).eq('semester',p.semester).eq('is_published',true);
    const years=[...new Set([p.academicYear,...data.map(x=>x.academic_year).filter(Boolean)])].sort().reverse();
    const recent=[...data].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
    const courses=[...new Set(data.map(x=>x.course).filter(Boolean))];
    app.innerHTML=`
      <section class="pastel-screen library-pastel">
        ${pastelBrandHeader({title:'Ma bibliothèque',subtitle:'Tous vos documents, fiches et ressources académiques au même endroit.'})}
        <label class="pastel-search"><span>⌕</span><input id="librarySearch" type="search" placeholder="Rechercher un document, une fiche, un sujet..."></label>
        <div class="pastel-filter-row library-filters"><button class="active">Tous</button><button>Documents</button><button>Fiches</button><button>PDF</button><button>Collections</button></div>
        ${sectionHeading('Mes ressources','Voir tout','')}
        <div class="pastel-stat-grid">
          <div class="pastel-stat-card pink"><span>▤</span><strong>${data.length}</strong><b>Documents</b><small>Ressources publiques</small></div>
          <div class="pastel-stat-card peach"><span>▥</span><strong>${data.reduce((a,x)=>a+(x.photo_count||0),0)}</strong><b>Photos</b><small>Supports de cours</small></div>
          <div class="pastel-stat-card lavender"><span>PDF</span><strong>${data.filter(x=>(x.title||'').toLowerCase().includes('pdf')).length}</strong><b>PDF</b><small>Documents partagés</small></div>
          <div class="pastel-stat-card mint"><span>▰</span><strong>${courses.length}</strong><b>Collections</b><small>Cours organisés</small></div>
        </div>
        ${sectionHeading('Imports récents','Voir tout','')}
        <div class="pastel-import-list">
          ${recent.length?recent.map(i=>`<div class="pastel-import-row">${libraryFileIcon(i.title)}<div><strong>${esc(i.title||'Ressource académique')}</strong><small>${esc(i.course||'Cours')} • ${fmtShort(i.created_at)}</small></div><span class="pastel-tag">${esc(i.section||'Public')}</span><b>•••</b></div>`).join(''):'<div class="pastel-empty-wide">Aucune ressource récente.</div>'}
        </div>
        ${sectionHeading('Mes collections','Voir tout','')}
        <div class="pastel-collection-grid">
          ${courses.slice(0,4).map((c,i)=>`<button class="pastel-collection-card ${['pink','lavender','mint','peach'][i%4]}" data-libcourse-direct="${esc(c)}"><span>${['⌂','▣','◒','▥'][i%4]}</span><div><strong>${esc(c)}</strong><small>Matériel académique</small></div><b>›</b></button>`).join('')||'<div class="pastel-empty-wide">Aucune collection disponible.</div>'}
        </div>
        ${sectionHeading('Années universitaires','', '')}
        <div class="pastel-year-grid">${years.map(y=>`<button class="pastel-year-card" data-year="${esc(y)}"><span><strong>${esc(y)}</strong><small>Cours → sections → matériel public</small></span><b>›</b></button>`).join('')}</div>
      </section>`;
    document.querySelectorAll('[data-year]').forEach(b=>b.onclick=()=>{currentLibrary={step:'courses',year:b.dataset.year};render()});
    document.querySelectorAll('[data-libcourse-direct]').forEach(b=>{b.onclick=()=>{currentLibrary={step:'sections',year:p.academicYear,course:b.dataset.libcourseDirect};render()}});
    return
  }
  if(currentLibrary.step==='courses'){
    const{data=[]}=await libraryQuery('course'),courses=[...new Set(data.map(x=>x.course))].sort();
    app.innerHTML=`<section class="pastel-screen">${backButton()}${pastelBrandHeader({kicker:'Bibliothèque',title:currentLibrary.year,subtitle:'Cours avec matériel public.'})}<div class="pastel-course-list">${courses.length?courses.map((c,i)=>`<button class="pastel-course-row ${['sky','peach','mint','lavender'][i%4]}" data-libcourse="${esc(c)}"><span class="pastel-row-icon">▥</span><span class="pastel-row-copy"><strong>${esc(c)}</strong><small>Ouvrir les sections</small><em>Matériel académique public</em></span><span class="pastel-row-menu">›</span></button>`).join(''):'<div class="pastel-empty-wide">Aucun matériel public cette année.</div>'}</div></section>`;
    byId('backBtn').onclick=()=>{currentLibrary={step:'years'};render()};
    document.querySelectorAll('[data-libcourse]').forEach(b=>b.onclick=()=>{currentLibrary={...currentLibrary,step:'sections',course:b.dataset.libcourse};render()});return
  }
  if(currentLibrary.step==='sections'){
    const{data=[]}=await libraryQuery('section').eq('course',currentLibrary.course),sections=[...new Set(data.map(x=>x.section))];
    app.innerHTML=`<section class="pastel-screen">${backButton()}${pastelBrandHeader({kicker:currentLibrary.year,title:currentLibrary.course,subtitle:'Choisissez une section.'})}<div class="pastel-collection-grid">${sections.map((s,i)=>`<button class="pastel-collection-card ${['lavender','sky','peach','mint'][i%4]}" data-libsection="${esc(s)}"><span>${esc(iconLetter(s))}</span><div><strong>${esc(s)}</strong><small>Séances publiques</small></div><b>›</b></button>`).join('')}</div></section>`;
    byId('backBtn').onclick=()=>{currentLibrary={...currentLibrary,step:'courses',course:null};render()};
    document.querySelectorAll('[data-libsection]').forEach(b=>b.onclick=()=>{currentLibrary={...currentLibrary,step:'items',section:b.dataset.libsection};render()});return
  }
  if(currentLibrary.step==='items'){
    const{data=[]}=await libraryQuery('*').eq('course',currentLibrary.course).eq('section',currentLibrary.section).order('created_at',{ascending:false});
    app.innerHTML=`<section class="pastel-screen">${backButton()}${pastelBrandHeader({kicker:currentLibrary.course,title:currentLibrary.section,subtitle:'Matériel partagé volontairement.'})}<div class="pastel-filter-row"><button class="active">Récent</button><button>Photos</button><button>PDF</button></div><div class="pastel-file-list">${data.length?data.map(i=>`<button class="pastel-file-row" data-libitem="${i.id}"><span class="pastel-file-icon lavender">▤</span><span class="pastel-file-copy"><strong>${esc(i.title)}</strong><small>${i.photo_count||0} photos • ${fmtShort(i.created_at)}</small></span><span class="pastel-tag">PUBLIC</span><span class="pastel-row-menu">›</span></button>`).join(''):'<div class="pastel-empty-wide">Aucun matériel public ici.</div>'}</div></section>`;
    byId('backBtn').onclick=()=>{currentLibrary={...currentLibrary,step:'sections',section:null};render()};
    document.querySelectorAll('[data-libitem]').forEach(b=>b.onclick=()=>{currentLibrary={...currentLibrary,step:'item',item:data.find(x=>x.id===b.dataset.libitem)};render()});return
  }
  if(currentLibrary.step==='item'){
    const i=currentLibrary.item;
    app.innerHTML=`<section class="pastel-screen">${backButton()}${pastelBrandHeader({kicker:'Matériel public',title:i.title,subtitle:`${i.course} • ${i.section} • ${i.academic_year}`})}<div id="publicThumbs" class="thumbs pastel-thumbs"></div><p class="small">${i.contributor_name?`Partagé par ${esc(i.contributor_name)}`:'Partagé par un étudiant'}</p><button class="btn ghost full" id="reportMaterial">Signaler ce matériel</button></section>`;
    byId('backBtn').onclick=()=>{currentLibrary={...currentLibrary,step:'items',item:null};render()};
    for(let x=0;x<(i.storage_paths||[]).length;x++){const{data}=sb.storage.from('public-materials').getPublicUrl(i.storage_paths[x]),d=document.createElement('div');d.className='thumb';d.innerHTML=`<img src="${data.publicUrl}" alt="Photo publique ${x+1}"><span class="num">${x+1}</span>`;byId('publicThumbs').appendChild(d)}
    byId('reportMaterial').onclick=()=>showToast('Signalement enregistré pour ce test')
  }
}
