'use strict';
// Quick Capture: press the trigger, and without lifting the finger drag onto a course, then onto
// one of its sections, and lift — the camera opens straight into that course/section, in today's
// session (or a new one, created with today's date on the first photo). Lifting anywhere else
// cancels. The menu is ui/radial-menu.js; the photos then follow the normal camera path (saved on
// the device first, then Google Drive), see features/capture-actions.js.
//
// On Accueil the trigger sits in the "Reprendre" card. To put it somewhere else:
//   `${QuickCaptureTrigger({id:'myQuick'})}` in the page's HTML, then  attachQuickCapture(byId('myQuick'));
// (any element works as the trigger; a second argument replaces "open the camera" with your own callback).

let quickCaptureFileDest=null;   // where the photo from the phone's own camera app goes

// Short label inside a ring item: "VHDL", "TD", "TS" (Traitement du signal), "Mat" (Mathématiques).
function quickCaptureShort(name){
  const n=String(name||'').trim();if(!n)return'?';
  if(n.length<=4)return n;
  const words=n.split(/[\s'’\-_.]+/).filter(w=>w&&!/^(de|du|des|la|le|les|et|en|à|au|aux|l|d|of|and|the)$/i.test(w));
  if(words.length>=2)return(words[0][0]+words[1][0]).toUpperCase();
  const w=words[0]||n;return w[0].toUpperCase()+w.slice(1,3).toLowerCase();
}

function quickCaptureItems(){
  const recent=validRecentDestinations(state.cameraRecent,state.courses);
  const{courses,more}=quickCaptureCourses(state.courses,recent,state.cameraLast,RADIAL.maxItems);
  const items=courses.map(c=>({id:c.id,label:c.name,short:quickCaptureShort(c.name),color:c.color||'#5B67F1',aria:camT('qcCourseAria',{name:c.name}),children:()=>quickCaptureSections(c)}));
  if(more)items.push({id:'more',more:true,label:camT('qcMoreCourses'),short:'•••',color:'#8A8FA3',aria:camT('qcMoreCourses')});
  return items;
}

// CM / TD / TP and the custom sections, in their usual order (the gesture stays the same from one
// day to the next); the one used last with the camera is marked with a dot.
function quickCaptureSections(course){
  ensureDefaultSections(course);
  const last=quickCaptureLastSection(course.id,validRecentDestinations(state.cameraRecent,state.courses),state.cameraLast);
  return course.sections.map(s=>({id:s.id,label:s.name,short:quickCaptureShort(s.name),color:sectionColor(s.name),marked:s.id===last,aria:camT('qcSectionAria',{course:course.name,section:s.name})}));
}

function quickCaptureDescribe({mode,item,parent,center}){
  const keys=mode==='keys';
  if(center)return{title:camT('qcMenu'),sub:camT('qcCancel')};
  if(item?.more)return{title:item.label,sub:camT('qcMoreHint')};
  if(item&&parent){
    const section=state.courses.find(c=>c.id===parent.id)?.sections.find(s=>s.id===item.id);
    return{title:`${parent.label} · ${item.label}`,sub:`${camT(keys?'qcKeyOpen':'qcRelease')} · ${camT(section&&todaySession(section)?'qcToday':'qcNew')}`};
  }
  if(item)return{title:item.label,sub:camT(keys?'qcKeySection':'qcDragSection')};
  return{title:camT('qcMenu'),sub:camT(keys?'qcKeyCourse':'qcDragCourse')};
}

// Chosen item → destination, then onPick(dest) (default: open the camera there).
// "Plus…" gives dest null (+ the course when it came from the second ring).
function quickCaptureSelect(item,parent,onPick){
  if(item.more){onPick(null,{courseId:parent?.id||null});return}
  const course=state.courses.find(c=>c.id===parent?.id),section=course?.sections.find(s=>s.id===item.id);
  if(section)onPick(quickCaptureDestination(course,section),{});
}

// Called inside the gesture's own event (pointerup, or Enter): browsers open the camera only
// during a user action, so it is asked for right here, with no await or timer before it.
// No destination ("Plus…"): the camera opens with the destination list on top.
function openQuickCamera(dest,{courseId=null}={}){
  closeQuickCaptureBubble();
  if(dest&&!cameraCanStream()){quickCaptureFileDest=dest;quickCaptureInput().click();return}
  prewarmCamera();
  navigate('capture',dest?{cameraDest:dest}:{});
  if(!dest)openCameraPicker({current:courseId?{courseId}:camDest,onPick:d=>setCameraDestination(d)});
}

// Tablet / computer, Note rapide: same gesture, but the page of the chosen séance opens (today's, or a new one).
// "Plus…" (no destination) opens the notes of the current selection.
function openQuickNotes(dest,{courseId=null}={}){
  closeQuickCaptureBubble();
  if(!dest){navigate('notes',courseId?{courseId}:{});return}
  const course=getCourse(dest.courseId),section=course&&getSection(course,dest.sectionId);
  let sessionId=dest.sessionId;
  if(!sessionId&&section){
    const n=navNewSession(section);
    section.sessions.push({id:uid(),number:n.number,title:n.title,photoIds:[],createdAt:now(),visibility:'private'});
    sessionId=section.sessions[section.sessions.length-1].id;saveState();queueSync();
  }
  navigate('notes',{courseId:dest.courseId,sectionId:dest.sectionId,sessionId});
}

// Makes any element a Quick Capture trigger: courses → sections → camera, in one gesture.
function attachQuickCapture(trigger,onPick=openQuickCamera){
  if(!trigger||trigger.dataset.quickCapture)return null;
  trigger.dataset.quickCapture='1';
  return createRadialMenu({
    trigger,
    items:quickCaptureItems,
    overflowItem:()=>({id:'more',more:true,label:camT('qcMoreSections'),short:'•••',color:'#8A8FA3',aria:camT('qcMoreSections')}),
    describe:quickCaptureDescribe,
    onSelect:(item,parent)=>quickCaptureSelect(item,parent,onPick),
    onEmpty:()=>showQuickCaptureBubble('empty',trigger),
    label:camT('qcMenu'),closeLabel:camT('qcClose'),centerHtml:icon('x',{size:26,stroke:2.4})
  });
}

// The trigger button (Accueil: in the "Reprendre" card, where the illustration was).
function QuickCaptureTrigger({id='quickCapture'}={}){
  // Tablet / computer: same button, same icon size, but a pen that opens the notes page.
  if(typeof isDesk==='function'&&isDesk())return`<button type="button" class="qc-trigger" id="${id}" data-desk-notes aria-label="Note rapide : ouvrir les notes"><span class="qc-trigger-orb">${icon('penLine',{size:26,stroke:2})}</span><small>Note rapide</small></button>`;
  return`<button type="button" class="qc-trigger" id="${id}" aria-label="${esc(camT('qcButton'))}"><span class="qc-trigger-orb">${icon('camera',{size:26,stroke:2})}</span><small>${esc(camT('qcTrigger'))}</small></button>`;
}

// Handwriting in a séance: a free Notes page (tablet / computer) or notebook (Carnet) ink.
async function sessionHasHandwriting(session){
  try{if(typeof canvasSessionHasContent==='function'&&await canvasSessionHasContent(session.id))return true}catch{}
  try{const d=typeof notebookDocFor==='function'?await notebookDocFor(session):null;if(d?.blocks?.some(b=>b.strokes?.length)||d?.strokes?.length)return true}catch{}
  return false;
}

// The séance the last camera photo was filed in (state.cameraShot, set by features/camera-queue.js); when it was deleted
// or nothing was shot yet, the most recent séance left. null when there is none.
function lastCapturedSession(){
  const shot=state.cameraShot?.sessionId&&findSessionContext(state.cameraShot.sessionId);
  return shot?{course:shot.course,section:shot.section,session:shot.session}:latestSession();
}

// Reprendre: the camera opens straight into that séance.
function resumeQuickCapture(latest){
  openQuickCamera({courseId:latest.course.id,sectionId:latest.section.id,sessionId:latest.session.id,source:'quick'});
}

// Accueil's Capture rapide card: rings + trigger (the radial menu), title, Reprendre (the last séance) and its caption.
function QuickCaptureCard({id='heroQuick',latest=null,hand=false}={}){
  const desk=typeof isDesk==='function'&&isDesk();
  const trigger=`<button type="button" class="qr-trigger qcap-trigger" id="${id}"${desk?' data-desk-notes':''} aria-label="${esc(desk?'Note rapide : ouvrir les notes':camT('qcButton'))}"><i class="qr-ring qr-outer" aria-hidden="true"></i><i class="qr-ring qr-inner" aria-hidden="true"></i><span class="qr-core">${icon(desk?'penLine':'camera',{size:22,stroke:2})}</span></button>`;
  const where=latest?[latest.section.name,latest.course.name].filter(Boolean).join(' · '):'';
  const caption=latest?`${esc(latest.session.title)}${hand?' · ✍︎ manuscrit':''}`:'Première capture';
  const resume=latest
    ?`<button type="button" class="qr-resume" id="heroResume" aria-label="Reprendre ${esc(latest.session.title)}, ${esc(where)}"><span class="qr-play">${icon('play',{size:16})}</span><small>Reprendre</small><em class="qr-where">${caption}</em></button>`
    :`<button type="button" class="qr-resume" data-nav="capture" aria-label="Capturer un premier cours"><span class="qr-play">${icon('camera',{size:16})}</span><small>Capturer</small><em class="qr-where">${caption}</em></button>`;
  return`<div class="qr-row qcap-row">${trigger}<span class="qr-copy"><strong>${esc(desk?'Note rapide':camT('qcTrigger'))}</strong></span>${resume}</div>`;
}

// Without a live camera (old browser, page not on https): the phone's own camera app.
function quickCaptureInput(){
  let el=byId('qcCameraInput');
  if(el)return el;
  el=document.createElement('input');
  el.type='file';el.accept='image/*';el.id='qcCameraInput';el.hidden=true;el.setAttribute('capture','environment');
  el.onchange=()=>{
    const files=[...(el.files||[])].filter(f=>f.type.startsWith('image/'));el.value='';
    const dest=quickCaptureFileDest;quickCaptureFileDest=null;
    if(files.length&&dest)importToDestination(files,dest);
  };
  document.body.appendChild(el);
  return el;
}

// Small bubble next to the trigger: the one-time hint, or "no course yet" with a way to create one.
// Below the trigger when there is more room there, else above; the arrow points at the trigger.
function showQuickCaptureBubble(kind,trigger){
  closeQuickCaptureBubble();
  if(!trigger?.isConnected)return;
  const r=(trigger.querySelector('.qc-trigger-orb')||trigger).getBoundingClientRect(),cx=r.left+r.width/2;
  const below=window.innerHeight-r.bottom>r.top,keyboard=document.activeElement===trigger;
  const el=document.createElement('div');
  el.className=`qc-bubble ${kind}${below?' below':''}`;el.id='qcBubble';el.setAttribute('role','status');
  el.innerHTML=kind==='empty'
    ?`<p>${esc(camT('qcNoCourses'))}</p><button type="button" class="qc-bubble-btn" id="qcCreateCourse">${icon('plus',{size:16,stroke:2.4})}${esc(camT('qcCreateCourse'))}</button>`
    :kind==='readEmpty'   // Lecture rapide with no PDF yet (features/quick-reading.js)
    ?`<p>${esc(camT('rdNoPdf'))}</p><button type="button" class="qc-bubble-btn" id="qcGoCourses">${icon('book',{size:16,stroke:2.4})}${esc(camT('rdGoCourses'))}</button>`
    :`<p>${esc(camT('qcHint'))}</p>`;
  document.body.appendChild(el);
  const w=el.offsetWidth,left=Math.min(Math.max(cx,w/2+12),window.innerWidth-w/2-12);
  el.style.left=`${left}px`;el.style.setProperty('--ax',`${cx-left}px`);
  if(below)el.style.top=`${r.bottom+14}px`;else el.style.bottom=`${window.innerHeight-r.top+14}px`;
  byId('qcCreateCourse')?.addEventListener('click',()=>{closeQuickCaptureBubble();navigate('courses');openNewCourseSheet()});
  byId('qcGoCourses')?.addEventListener('click',()=>{closeQuickCaptureBubble();navigate('courses')});
  if(keyboard)(byId('qcCreateCourse')||byId('qcGoCourses'))?.focus({preventScroll:true});
  el._off=e=>{if(!el.contains(e.target))closeQuickCaptureBubble()};
  el._t=setTimeout(closeQuickCaptureBubble,kind==='empty'||kind==='readEmpty'?9000:8000);
  setTimeout(()=>{if(el.isConnected)document.addEventListener('pointerdown',el._off,true)},0);
}
function closeQuickCaptureBubble(){
  const el=byId('qcBubble');if(!el)return;
  clearTimeout(el._t);document.removeEventListener('pointerdown',el._off,true);el.remove();
}

// After every render: menus and bubbles belong to the screen that opened them; on Accueil the
// gesture is explained once, the first time the trigger is seen.
function syncQuickCapture(){
  if(currentView!=='home'){radialCloseAll();closeQuickCaptureBubble();return}
  const trigger=byId('heroQuick');
  if(trigger&&!state.quickCaptureTriggerHintSeen&&state.courses.length){
    state.quickCaptureTriggerHintSeen=true;saveState();
    setTimeout(()=>{if(currentView==='home'&&trigger.isConnected&&!radialOpen.size)showQuickCaptureBubble('hint',trigger)},700);
  }
}
