// Bibliothèque — ressources personnelles et matériel académique partagé.
// Navigation inside the public library: years → courses → sections → items → item.

function isPdfMaterial(i){return String(i?.type||'').toLowerCase()==='pdf'}
function libraryItemCard(i,kind){
  const pdf=isPdfMaterial(i);
  return ListCard({iconName:pdf?'fileText':'users',tone:pdf?'pink':'mint',title:i.title||'Ressource académique',meta:pdf?`${i.course||'Cours'} · PDF`:`${i.course||'Cours'} · ${i.section||'Section'} · ${plural(i.photo_count||0,'photo')}`,attrs:`data-libitem-open="${esc(i.id)}"`,search:`${i.title} ${i.course} ${i.section} ${i.type||''}`,kind,tag:isFavorite(i.id)?`<span class="fav-star">${icon('star',{size:16})}</span>`:''});
}
function isFavorite(id){return state.favorites.some(f=>f.id===id)}
function toggleFavorite(item){
  if(isFavorite(item.id))state.favorites=state.favorites.filter(f=>f.id!==item.id);
  else state.favorites.unshift({id:item.id,owner_id:item.owner_id,session_local_id:item.session_local_id,title:item.title,type:item.type||'Photos',course:item.course,section:item.section,academic_year:item.academic_year,photo_count:item.photo_count,created_at:item.created_at,storage_paths:item.storage_paths||[],contributor_name:item.contributor_name||null});
  saveState();
}

async function renderLibrary(){
  setChrome(false);
  const p=state.profile;
  if(currentLibrary.step!=='years')return renderLibraryDrill();

  const cloud=navigator.onLine&&sb;
  const profileReady=!!(p.university&&p.program);
  let materials=[];
  if(cloud&&profileReady){
    const{data}=await sb.from('public_materials').select('id,owner_id,session_local_id,academic_year,title,type,course,section,created_at,photo_count,storage_paths,contributor_name').eq('university',p.university).eq('program',p.program).eq('level',p.level).eq('semester',p.semester).eq('is_published',true).order('created_at',{ascending:false});
    materials=data||[];
  }
  const publicCourses=[...new Set(materials.map(x=>x.course).filter(Boolean))];
  const years=[...new Set([p.academicYear,...materials.map(x=>x.academic_year).filter(Boolean)])].sort().reverse();
  const notes=state.courses.flatMap(c=>c.sections.flatMap(s=>s.sessions.map(q=>({course:c,section:s,session:q})))).sort((a,b)=>new Date(b.session.createdAt)-new Date(a.session.createdAt)).slice(0,5);
  const pdfs=state.files.slice(0,5);
  const favIds=new Set(state.favorites.map(f=>f.id));

  const cloudNotice=!cloud
    ?Notice(`${icon('wifiOff',{size:18})}<span>Hors connexion : le matériel partagé s’affichera au retour d’Internet. Vos notes et PDF restent disponibles.</span>`,'peach')
    :!profileReady?`<div class="notice tone-lavender">${icon('cap',{size:18})}<span>Complétez votre profil académique pour voir le matériel de votre promotion.</span><button class="link-btn" data-nav="profile">Compléter</button></div>`:'';

  app.innerHTML=`<section class="screen">
    ${PageHeader({title:'Bibliothèque',large:true})}
    ${SearchBar({id:'librarySearch',placeholder:'Rechercher dans la bibliothèque...'})}
    ${FilterChips('libraryFilters',[{value:'all',label:'Tous'},{value:'cours',label:'Cours'},{value:'pdf',label:'PDF'},{value:'notes',label:'Notes'},{value:'sessions',label:'Sessions'},{value:'favoris',label:'Favoris'}],'all')}
    <div class="stat-grid four">
      <button class="stat-tile" data-pick="cours">${StatCard({tone:'lavender',iconName:'book',value:publicCourses.length,label:'Cours enregistrés'})}</button>
      <button class="stat-tile" data-pick="pdf">${StatCard({tone:'pink',iconName:'fileText',value:state.files.length,label:'PDF'})}</button>
      <button class="stat-tile" data-pick="notes">${StatCard({tone:'mint',iconName:'note',value:state.courses.reduce((a,c)=>a+courseStats(c).sessions,0),label:'Notes privées'})}</button>
      <button class="stat-tile" data-pick="sessions">${StatCard({tone:'peach',iconName:'users',value:materials.length,label:'Sessions partagées'})}</button>
    </div>
    ${cloudNotice}
    <div id="libraryContent">
      <div data-filter-group>
        ${SectionTitle('Favoris')}
        <div class="list-stack">${state.favorites.map(f=>libraryItemCard(f,'favoris')).join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('Cours enregistrés')}
        <div class="collection-grid">${publicCourses.map((c,i)=>{const v=courseVisual({name:c},i),n=materials.filter(m=>m.course===c).length;return`<button class="collection-card tone-${v.tone}" data-libcourse-direct="${esc(c)}" data-kind="cours" data-search="${esc(c.toLowerCase())}">${IconBadge(v.iconName,v.tone,'md')}<strong>${esc(c)}</strong><small>${plural(n,'ressource')}</small></button>`}).join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('PDF récents',{action:'Voir tout',nav:'files'})}
        <div class="list-stack">${pdfs.map(f=>FileCard({id:f.id,iconName:'fileText',tone:'pink',title:f.title,meta:`${fmtDate(f.createdAt)} · ${f.pages||'—'} pages`,search:f.title,kind:'pdf'})).join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('Notes privées')}
        <div class="list-stack">${notes.map(n=>ListCard({iconName:'note',tone:'sky',title:n.session.title,meta:`${n.course.name} · ${n.section.name} · ${plural(n.session.photoIds.length,'photo')}`,attrs:`data-note-open="${n.session.id}"`,search:`${n.session.title} ${n.course.name}`,kind:'notes',tag:Tag('Privé','neutral')})).join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('Sessions partagées')}
        <div class="list-stack">${materials.filter(m=>!favIds.has(m.id)).slice(0,8).map(m=>libraryItemCard(m,'sessions')).join('')}</div>
      </div>
      <div data-filter-group>
        ${SectionTitle('Années universitaires')}
        <div class="list-stack">${cloud&&profileReady?years.map(y=>ListCard({iconName:'calendar',tone:'yellow',title:y,meta:'Cours → sections → matériel public',attrs:`data-year="${esc(y)}"`,search:y,kind:'cours'})).join(''):''}</div>
      </div>
    </div>
    <div id="libraryEmpty" hidden>${EmptyState({iconName:'library',title:'Rien à afficher',text:'Aucun élément ne correspond à ce filtre pour le moment.'})}</div>
  </section>`;

  bindListFilter({searchId:'librarySearch',chipsId:'libraryFilters',scope:'#libraryContent',onChange:({shown})=>byId('libraryEmpty').hidden=!!shown});
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>document.querySelector(`#libraryFilters [data-chip="${b.dataset.pick}"]`)?.click());
  document.querySelectorAll('[data-year]').forEach(b=>b.onclick=()=>{currentLibrary={step:'courses',year:b.dataset.year};render()});
  document.querySelectorAll('[data-libcourse-direct]').forEach(b=>b.onclick=()=>{currentLibrary={step:'sections',year:p.academicYear,course:b.dataset.libcourseDirect};render()});
  document.querySelectorAll('[data-file-open]').forEach(b=>b.onclick=()=>openPdfViewer(b.dataset.fileOpen,'library'));
  document.querySelectorAll('[data-file-menu]').forEach(b=>b.onclick=()=>openFileMenu(b.dataset.fileMenu));
  document.querySelectorAll('.file-card').forEach(card=>{const meta=state.files.find(f=>f.id===card.querySelector('[data-file-open]')?.dataset.fileOpen);if(meta)attachItemMenu(card,pdfMenu(meta))});
  document.querySelectorAll('[data-note-open]').forEach(b=>b.onclick=()=>{const ctx=findSessionContext(b.dataset.noteOpen);if(!ctx)return;currentCourseId=ctx.course.id;currentSectionId=ctx.section.id;currentSessionId=ctx.session.id;navigate('session')});
  const all=[...materials,...state.favorites];
  document.querySelectorAll('[data-libitem-open]').forEach(b=>b.onclick=()=>{const item=all.find(x=>x.id===b.dataset.libitemOpen);if(item){currentLibrary={step:'item',year:item.academic_year,course:item.course,section:item.section,item,from:'years'};render()}});
}

async function renderLibraryDrill(){
  if(!navigator.onLine||!sb){if(currentLibrary.step==='item')return renderLibraryItem();currentLibrary={step:'years'};return renderLibrary()}
  const back=to=>{byId('backBtn').onclick=()=>{currentLibrary={...currentLibrary,...to};render()}};

  if(currentLibrary.step==='courses'){
    const{data=[]}=await libraryQuery('course'),courses=[...new Set((data||[]).map(x=>x.course))].sort();
    app.innerHTML=`<section class="screen">${PageHeader({back:true,title:'Bibliothèque'})}${PageIntro({eyebrow:'ANNÉE UNIVERSITAIRE',title:currentLibrary.year,subtitle:'Cours avec du matériel partagé.'})}
      <div class="collection-grid">${courses.map((c,i)=>{const v=courseVisual({name:c},i);return`<button class="collection-card tone-${v.tone}" data-libcourse="${esc(c)}">${IconBadge(v.iconName,v.tone,'md')}<strong>${esc(c)}</strong><small>Ouvrir les sections</small></button>`}).join('')}</div>
      ${courses.length?'':EmptyState({iconName:'library',title:'Aucun matériel',text:'Rien n’a encore été partagé pour cette année.'})}</section>`;
    back({step:'years',year:null});
    document.querySelectorAll('[data-libcourse]').forEach(b=>b.onclick=()=>{currentLibrary={...currentLibrary,step:'sections',course:b.dataset.libcourse};render()});return;
  }
  if(currentLibrary.step==='sections'){
    const{data=[]}=await libraryQuery('section').eq('course',currentLibrary.course),sections=[...new Set((data||[]).map(x=>x.section))];
    app.innerHTML=`<section class="screen">${PageHeader({back:true,title:'Bibliothèque'})}${PageIntro({eyebrow:currentLibrary.year,title:currentLibrary.course,subtitle:'Choisissez une section.'})}
      <div class="list-stack">${sections.map(s=>ListCard({iconName:'layers',tone:sectionTone(s),title:s,meta:'Séances partagées',attrs:`data-libsection="${esc(s)}"`})).join('')}</div>
      ${sections.length?'':EmptyState({iconName:'layers',title:'Aucune section',text:'Aucun matériel public pour ce cours.'})}</section>`;
    back({step:'courses',course:null});
    document.querySelectorAll('[data-libsection]').forEach(b=>b.onclick=()=>{currentLibrary={...currentLibrary,step:'items',section:b.dataset.libsection};render()});return;
  }
  if(currentLibrary.step==='items'){
    const{data=[]}=await libraryQuery('*').eq('course',currentLibrary.course).eq('section',currentLibrary.section).order('created_at',{ascending:false});
    app.innerHTML=`<section class="screen">${PageHeader({back:true,title:'Bibliothèque'})}${PageIntro({eyebrow:currentLibrary.course,title:currentLibrary.section,subtitle:'Matériel partagé volontairement par des étudiants.'})}
      <div class="list-stack">${(data||[]).map(i=>{const pdf=isPdfMaterial(i);return ListCard({iconName:pdf?'fileText':'image',tone:pdf?'pink':'lavender',title:i.title,meta:pdf?`PDF · ${fmtShort(i.created_at)}`:`${plural(i.photo_count||0,'photo')} · ${fmtShort(i.created_at)}`,attrs:`data-libitem="${i.id}"`,tag:pdf?Tag('PDF','pink'):Tag('Public','mint')})}).join('')}</div>
      ${(data||[]).length?'':EmptyState({iconName:'image',title:'Rien ici',text:'Aucun matériel public dans cette section.'})}</section>`;
    back({step:'sections',section:null});
    document.querySelectorAll('[data-libitem]').forEach(b=>b.onclick=()=>{currentLibrary={...currentLibrary,step:'item',item:data.find(x=>x.id===b.dataset.libitem),from:'items'};render()});return;
  }
  if(currentLibrary.step==='item')return renderLibraryItem();
}

async function renderLibraryItem(){
  let i=currentLibrary.item;
  if(i&&sb&&navigator.onLine){
    const{data,error}=await sb.from('public_materials').select('*').eq('id',i.id).maybeSingle();
    if(!error&&!data){state.favorites=state.favorites.filter(f=>f.id!==i.id);saveState();currentLibrary={step:'years'};showToast('Cette publication a été supprimée');return renderLibrary()}
    if(data){i=data;currentLibrary.item=data}
  }
  if(!i){currentLibrary={step:'years'};return renderLibrary()}
  const fav=isFavorite(i.id),pdf=isPdfMaterial(i);
  app.innerHTML=`<section class="screen">${PageHeader({back:true,title:'Bibliothèque'})}${PageIntro({eyebrow:'MATÉRIEL PARTAGÉ',title:i.title,subtitle:`${i.course} · ${i.section} · ${i.academic_year||''}`})}
    <p class="meta-line">${icon('user',{size:16})}${i.contributor_name?`Partagé par ${esc(i.contributor_name)}`:'Partagé par un étudiant'}</p>
    ${pdf?`<div class="notice tone-pink">${icon('fileText',{size:18})}<span>Document PDF partagé dans la bibliothèque publique.</span></div>`:'<div id="publicThumbs" class="thumbs"></div>'}
    <div class="button-stack">
      ${pdf?ActionButton({label:'Ouvrir le PDF',id:'openPublicPdf',variant:'primary',iconName:'fileText'}):''}
      ${ActionButton({label:fav?'Retirer des favoris':'Ajouter aux favoris',id:'favMaterial',variant:fav?'soft':'primary',iconName:'star'})}
      ${currentUser&&currentUser.id===i.owner_id?ActionButton({label:'Supprimer de la bibliothèque',id:'deletePublicMaterial',variant:'ghost',iconName:'trash'}):''}
      ${ActionButton({label:'Signaler ce matériel',id:'reportMaterial',variant:'ghost',iconName:'flag'})}
    </div></section>`;
  byId('backBtn').onclick=()=>{currentLibrary=currentLibrary.from==='items'?{...currentLibrary,step:'items',item:null}:{step:'years'};render()};
  if(sb&&pdf){
    const path=(i.storage_paths||[])[0];
    if(path){
      const{data}=sb.storage.from('public-materials').getPublicUrl(path);
      byId('openPublicPdf').onclick=()=>{const w=window.open(data.publicUrl,'_blank','noopener');if(!w)location.href=data.publicUrl};
    }else byId('openPublicPdf').disabled=true;
  }else if(sb){
    for(let x=0;x<(i.storage_paths||[]).length;x++){const{data}=sb.storage.from('public-materials').getPublicUrl(i.storage_paths[x]),d=document.createElement('div');d.className='thumb';d.innerHTML=`<img src="${data.publicUrl}" alt="Photo publique ${x+1}" loading="lazy"><span class="num">${x+1}</span>`;byId('publicThumbs').appendChild(d)}
  }
  byId('favMaterial').onclick=()=>{toggleFavorite(i);showToast(isFavorite(i.id)?'Ajouté aux favoris':'Retiré des favoris');render()};
  byId('deletePublicMaterial')?.addEventListener('click',()=>confirmDeletePublicMaterial(i));
  byId('reportMaterial').onclick=()=>reportMaterial(i);
}

// A report is sent by e-mail to the Holioo contact address (the same one as in the privacy policy),
// with the reference of the material, so it can be reviewed and removed.
const HOLIOO_CONTACT='payamshafiqullah@gmail.com';
function reportMaterial(item){
  openSheet({title:'Signaler ce matériel',subtitle:'Votre application e-mail va s’ouvrir avec la référence du matériel. Expliquez le problème (données personnelles, contenu inapproprié, erreur…).',confirmText:'Écrire le signalement',onConfirm:()=>{
    const subject=`Signalement Holioo — ${item.title||'matériel'}`;
    const body=`Matériel signalé : ${item.title||''}
Cours : ${item.course||''} · ${item.section||''}
Référence : ${item.id}

Problème :
`;
    location.href=`mailto:${HOLIOO_CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return true;
  }});
}
