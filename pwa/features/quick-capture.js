'use strict';
// Quick Capture (Accueil): hold the orange camera button, drag onto a course, then onto one of its
// sections, and release — the camera opens straight into that course/section, in today's session
// (or a new one, created with today's date on the first photo). Releasing on the button or outside
// the items does nothing. A tap opens the same menu to choose by touch; from the keyboard: Enter,
// arrows, Escape. The menu is ui/radial-menu.js; the photos then follow the normal camera path
// (saved on the device first, then Google Drive), see features/capture-actions.js.

let quickCaptureMenu=null;
let quickCaptureFileDest=null;   // where the photo from the phone's own camera app goes

const quickCaptureButton=()=>bottomNav.querySelector('.nav-capture');
const quickCaptureEnabled=()=>currentView==='home'&&!appShell.classList.contains('hidden-chrome')&&!sheetRoot.innerHTML;

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
  const tap=mode==='tap';
  if(center)return{title:camT('qcMenu'),sub:camT('qcCancel')};
  if(item?.more)return{title:item.label,sub:camT('qcMoreHint')};
  if(item&&parent){
    const section=state.courses.find(c=>c.id===parent.id)?.sections.find(s=>s.id===item.id);
    return{title:`${parent.label} · ${item.label}`,sub:`${camT(tap?'qcTapOpen':'qcRelease')} · ${camT(section&&todaySession(section)?'qcToday':'qcNew')}`};
  }
  if(item)return{title:item.label,sub:camT(tap?'qcTapSection':'qcDragSection')};
  return{title:camT('qcMenu'),sub:camT(tap?'qcTapCourse':'qcDragCourse')};
}

function quickCaptureSelect(item,parent){
  if(item.more){openQuickCamera(null,{courseId:parent?.id||null});return}
  const course=state.courses.find(c=>c.id===parent?.id),section=course?.sections.find(s=>s.id===item.id);
  if(section)openQuickCamera(quickCaptureDestination(course,section));
}

// Called inside the gesture's own event (pointerup, click or key): browsers open the camera only
// during a user action, so it is asked for right here, with no await or timer before it.
// No destination ("Plus…"): the camera opens with the destination list on top.
function openQuickCamera(dest,{courseId=null}={}){
  closeQuickCaptureBubble();
  if(dest&&!cameraCanStream()){quickCaptureFileDest=dest;quickCaptureInput().click();return}
  prewarmCamera();
  navigate('capture',dest?{cameraDest:dest}:{});
  if(!dest)openCameraPicker({current:courseId?{courseId}:camDest,onPick:d=>setCameraDestination(d)});
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

// Small bubble above the button: the one-time hint, or "no course yet" with a way to create one.
function showQuickCaptureBubble(kind){
  closeQuickCaptureBubble();
  const orb=quickCaptureButton()?.querySelector('.capture-orb');if(!orb)return;
  const r=orb.getBoundingClientRect(),keyboard=document.activeElement===quickCaptureButton();
  const el=document.createElement('div');
  el.className=`qc-bubble ${kind}`;el.id='qcBubble';el.setAttribute('role','status');
  el.style.left=`${r.left+r.width/2}px`;el.style.bottom=`${window.innerHeight-r.top+14}px`;
  el.innerHTML=kind==='empty'
    ?`<p>${esc(camT('qcNoCourses'))}</p><button type="button" class="qc-bubble-btn" id="qcCreateCourse">${icon('plus',{size:16,stroke:2.4})}${esc(camT('qcCreateCourse'))}</button>`
    :`<p>${esc(camT('qcHint'))}</p>`;
  document.body.appendChild(el);
  byId('qcCreateCourse')?.addEventListener('click',()=>{closeQuickCaptureBubble();navigate('courses');openNewCourseSheet()});
  if(keyboard)byId('qcCreateCourse')?.focus({preventScroll:true});
  el._off=e=>{if(!el.contains(e.target))closeQuickCaptureBubble()};
  el._t=setTimeout(closeQuickCaptureBubble,kind==='empty'?9000:7000);
  setTimeout(()=>{if(el.isConnected)document.addEventListener('pointerdown',el._off,true)},0);
}
function closeQuickCaptureBubble(){
  const el=byId('qcBubble');if(!el)return;
  clearTimeout(el._t);document.removeEventListener('pointerdown',el._off,true);el.remove();
}

// After every render: the button is Quick Capture on Accueil only; elsewhere it opens the camera as before.
function syncQuickCapture(){
  const btn=quickCaptureButton();if(!btn)return;
  const on=quickCaptureEnabled();
  btn.classList.toggle('quick-capture',on);
  if(on){btn.setAttribute('aria-label',camT('qcButton'));btn.setAttribute('aria-haspopup','menu')}
  else{btn.setAttribute('aria-label','Capture');btn.removeAttribute('aria-haspopup');quickCaptureMenu?.close();closeQuickCaptureBubble()}
  // First visit of Accueil: the gesture is explained once.
  if(on&&!state.quickCaptureHintSeen&&state.courses.length){
    state.quickCaptureHintSeen=true;saveState();
    setTimeout(()=>{if(quickCaptureEnabled()&&!quickCaptureMenu?.isOpen())showQuickCaptureBubble('hint')},700);
  }
}

quickCaptureMenu=createRadialMenu({
  anchor:quickCaptureButton(),
  isEnabled:quickCaptureEnabled,
  fanRight:()=>matchMedia('(min-width: 720px)').matches,
  origin:()=>{const r=quickCaptureButton().querySelector('.capture-orb').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}},
  items:quickCaptureItems,
  overflowItem:()=>({id:'more',more:true,label:camT('qcMoreSections'),short:'•••',color:'#8A8FA3',aria:camT('qcMoreSections')}),
  describe:quickCaptureDescribe,
  onSelect:quickCaptureSelect,
  onEmpty:()=>showQuickCaptureBubble('empty'),
  label:camT('qcMenu'),closeLabel:camT('qcClose'),centerHtml:icon('x',{size:26,stroke:2.4})
});
