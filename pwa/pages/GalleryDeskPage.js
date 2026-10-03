// Galerie on a tablet or computer (window ≥ 768 px, ui/desk-shell.js): the photos of what the course navigator has
// selected — a séance, a type (CM / TD / TP …) or the whole course — in a responsive grid. Header: course, selection,
// photo count. Long-press or right-click on a photo: "Changer la position" / "Supprimer" (features/item-menu.js).
// The round camera button (bottom right) opens the camera in the selection (Capture rapide).
// Phones never get here: they keep Cours → section → séance (pages/CoursesPage.js …). Logic: features/gallery-logic.js.

let galleryCleanup=null;

// The course on screen (kept in currentCourseId so the navigator, the camera and the PDF builder agree with it): the
// selected one (a selected séance knows its course), else the one the camera used last, else the first one running.
function galleryCourse(){
  const c=navResolve(state.courses,{courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId}).course
    ||galleryDefaultCourse(state.courses,currentCourseId,state.cameraLast?.courseId);
  if(c)currentCourseId=c.id;
  return c;
}
// What is selected inside that course: a séance, a type or nothing (the whole course).
function gallerySelection(){
  const course=galleryCourse(),r=navResolve(state.courses,{courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
  return r.course===course?r:{course,section:null,session:null,kind:course?'course':null};
}
const galleryFilter=()=>gallerySelection().section?.id||'all';
const galleryScopeLabel=sel=>sel.session?.title||sel.section?.name||'Toutes les sections';

// Where a photo taken from here goes: the selected séance, else the selected type (or the last one used) with today's séance or a new one.
function galleryCameraDestination(course=galleryCourse()){
  if(!course)return null;
  const sel=gallerySelection();
  if(sel.session)return{courseId:course.id,sectionId:sel.section.id,sessionId:sel.session.id,source:'quick'};
  const last=quickCaptureLastSection(course.id,validRecentDestinations(state.cameraRecent,state.courses),state.cameraLast);
  const section=galleryCaptureSection(course,galleryFilter(),last);
  return section?quickCaptureDestination(course,section):null;
}
// The camera opened from the toolbar (features/capture-actions.js prepareCameraEntry): Galerie or Notes.
function deskCameraDestination(fromView){
  if(fromView==='gallery')return galleryCameraDestination();
  if(fromView==='notes'&&typeof canvasCameraDestination==='function')return canvasCameraDestination();
  return null;
}

// Previews first, made when a tile comes near the screen.
function galleryLoadThumbs(box){
  const io=new IntersectionObserver(entries=>{
    for(const en of entries){
      if(!en.isIntersecting)continue;io.unobserve(en.target);
      const img=en.target.querySelector('img');
      photoThumbUrl(en.target.dataset.photoId).then(url=>{
        if(!img.isConnected)return;
        if(url)img.src=url;else en.target.classList.add('is-missing');
      }).catch(()=>en.target.classList.add('is-missing'));
    }
  },{rootMargin:'600px 0px'});
  box.querySelectorAll('.gallery-tile').forEach(t=>io.observe(t));
  return()=>io.disconnect();
}

// "Changer la position": the photo's place in its séance (its own order), or another séance altogether.
function galleryPhotoMenu(id,session){
  return{name:'Photo',reposition:()=>openPositionSheet(id,session),remove:photoMenu(id).remove};
}
function openPositionSheet(photoId,session){
  const n=session.photoIds.length,at=session.photoIds.indexOf(photoId);
  if(at<0)return;
  let pos=at+1;
  openSheet({title:'Changer la position',subtitle:`${session.title} · photo ${at+1} sur ${n}`,confirmText:'Enregistrer',
    body:`${n>1?`<div class="pos-picker" role="group" aria-label="Nouvelle position dans la séance">
        <button type="button" class="pos-step" id="posPrev" aria-label="Une place plus tôt">−</button>
        <output id="posVal" aria-live="polite"></output>
        <button type="button" class="pos-step" id="posNext" aria-label="Une place plus tard">+</button>
      </div>
      <div class="pos-quick"><button type="button" class="desk-action" id="posFirst">Au début</button><button type="button" class="desk-action" id="posLast">À la fin</button></div>`
      :'<p class="lead">Cette séance n’a qu’une photo.</p>'}
      <button type="button" class="link-btn pos-move" id="posMove">Déplacer vers une autre séance…</button>`,
    onConfirm:()=>{
      if(pos-1===at)return true;
      session.photoIds=galleryMoveInList(session.photoIds,photoId,pos-1);
      saveState();queueSync();render();showToast('Position enregistrée');return true;
    }});
  const show=()=>{
    const out=byId('posVal');if(!out)return;
    out.innerHTML=`<strong>${pos}</strong><span> / ${n}</span>`;
    byId('posPrev').disabled=pos<=1;byId('posNext').disabled=pos>=n;
  };
  if(n>1){
    byId('posPrev').onclick=()=>{pos=Math.max(1,pos-1);show()};
    byId('posNext').onclick=()=>{pos=Math.min(n,pos+1);show()};
    byId('posFirst').onclick=()=>{pos=1;show()};
    byId('posLast').onclick=()=>{pos=n;show()};
    show();
  }
  byId('posMove').onclick=()=>{sheetRoot.innerHTML='';itemMovePhoto(photoId)};
}

async function renderGallery(){
  galleryCleanup?.();galleryCleanup=null;
  if(!isDesk()){navigate('courses');return}
  setChrome(false);
  const course=galleryCourse(),sel=gallerySelection(),filter=galleryFilter(),scope=galleryScopeLabel(sel);
  if(!course){
    app.innerHTML=`<section class="screen screen-wide gallery-screen">${EmptyState({iconName:'book',title:'Aucun cours',text:'Ajoutez votre premier cours : ses photos apparaîtront ici.',action:ActionButton({label:'Ajouter un cours',id:'galleryAddCourse',iconName:'plus',full:false})})}</section>`;
    byId('galleryAddCourse').onclick=navigatorAddCourse;
    return;
  }
  const entries=galleryEntries(course,filter,sel.session?.id),n=entries.length;
  const tiles=entries.map((e,i)=>`<li class="gallery-tile" data-photo-id="${e.id}" data-session-id="${e.session.id}"><button class="gallery-tile-btn" type="button" data-open-photo="${e.id}" aria-label="Ouvrir la photo ${i+1}, ${esc(e.session.title)}"><img alt="Photo ${i+1} · ${esc(e.session.title)}" decoding="async" draggable="false"></button><span class="gallery-tile-tag">${esc(e.session.title)}</span><i class="gallery-tile-missing" aria-hidden="true">${icon('image',{size:26})}</i></li>`).join('');
  const empty=EmptyState({iconName:'camera',title:'Aucune photo',text:sel.session||sel.section?`Prenez une photo avec le bouton caméra : elle ira dans « ${scope} ».`:'Prenez une photo avec le bouton caméra, ou avec votre téléphone : elle arrive ici.'});
  app.innerHTML=`<section class="screen screen-wide gallery-screen">
    <header class="gallery-head">
      <div class="page-intro"><p class="eyebrow">GALERIE</p><h1 class="hero-title">${esc(course.name)}</h1></div>
      <div class="gallery-meta"><span class="gallery-filter-chip">${esc(scope)}</span><span class="gallery-count">${esc(plural(n,'photo'))}</span></div>
    </header>
    ${n?`<ul class="gallery-grid" id="galleryGrid">${tiles}</ul>`:empty}
    <button class="gallery-fab" type="button" id="galleryFab" title="Capture rapide" aria-label="Capture rapide : prendre une photo dans ${esc(course.name)}, ${esc(scope)}">${icon('camera',{size:28,stroke:2})}</button>
  </section>`;
  const box=byId('galleryGrid');
  if(box){
    const ids=entries.map(e=>e.id);
    box.querySelectorAll('.gallery-tile').forEach(tile=>{
      const e=entries.find(x=>x.id===tile.dataset.photoId);if(!e)return;
      tile.querySelector('[data-open-photo]').onclick=()=>openPhotoViewer(ids,Math.max(0,ids.indexOf(e.id)),{title:`${course.name} · ${scope}`,source:'session',sourceId:e.session.id,editable:true,returnView:'gallery',courseId:course.id,sectionId:e.section.id,sessionId:e.session.id});
      attachItemMenu(tile,galleryPhotoMenu(e.id,e.session));
    });
    galleryCleanup=galleryLoadThumbs(box);
  }
  // Inside the click itself: browsers open the camera only during a user action.
  byId('galleryFab').addEventListener('click',()=>{
    const dest=galleryCameraDestination(course);
    if(!dest){showToast('Ce cours n’a pas de section');return}
    openQuickCamera(dest);
  });
}
