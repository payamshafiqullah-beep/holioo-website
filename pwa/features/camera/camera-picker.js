'use strict';
// Destination picker for the camera: a bottom sheet drawn inside the camera screen, so the live
// preview keeps running underneath. Recent destinations first for one-tap switching, then
// Course → Section → Session, and the weekly timetable editor.
//
// The sheet shell is built once and only its content is replaced when something is selected, so
// it never re-plays its entrance, keeps its scroll position and keeps the keyboard focus.
// It closes by: the close button, "Annuler", a tap on the dimmed preview, Escape, or a drag down on
// the header (the buttons are the alternative to the gesture).

function cameraDestinationLabel(dest){
  if(!dest)return camT('chooseDest');
  const course=state.courses.find(c=>c.id===dest.courseId);
  const section=course?.sections.find(s=>s.id===dest.sectionId);
  if(!course||!section)return camT('chooseDest');
  const session=dest.sessionId&&section.sessions.find(s=>s.id===dest.sessionId);
  const part=session?(session.title||camT('sessionN',{n:session.number})):camT('newSessionN',{n:nextSessionNumber(section)});
  return`${course.name} · ${section.name} · ${part}`;
}

// The parts of a destination for the chip and the sheet: course name, "section · session" (without
// repeating the section when the session title already starts with it: "CM 1", not "CM · CM 1"),
// the course colour and whether the session is still to be created.
function cameraDestinationParts(dest){
  const course=dest&&state.courses.find(c=>c.id===dest.courseId);
  const section=course?.sections.find(s=>s.id===dest.sectionId);
  if(!course||!section)return null;
  const session=dest.sessionId&&section.sessions.find(s=>s.id===dest.sessionId);
  const title=session?(session.title||camT('sessionN',{n:session.number})):camT('newSessionN',{n:nextSessionNumber(section)});
  const detail=title.toLowerCase().startsWith(String(section.name).toLowerCase())?title:`${section.name} · ${title}`;
  return{course:course.name,section:section.name,title,detail,color:course.color||'#5B67F1',isNew:!session,photos:session?.photoIds?.length||0};
}

const CAM_SHEET_IN=320,CAM_SHEET_OUT=180;
const camReduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const camSheetKey=e=>{if(e.key==='Escape'&&byId('camSheetHost')?.firstElementChild){e.preventDefault();closeCameraPicker()}};

// While the sheet is open, the camera controls behind it can neither be tapped nor focused.
function camSheetBackground(open){
  const cam=document.querySelector('.camera');if(!cam)return;
  for(const el of cam.children){
    if(el.id==='camSheetHost')continue;
    if(open){if(!el.inert){el.inert=true;el.dataset.sheetInert='1'}}
    else if(el.dataset.sheetInert){el.inert=false;delete el.dataset.sheetInert}
  }
}

function closeCameraPicker({restoreFocus=true}={}){
  const host=byId('camSheetHost');if(!host)return;
  const sheet=host.firstElementChild;
  document.removeEventListener('keydown',camSheetKey);
  camSheetBackground(false);
  byId('camDest')?.setAttribute('aria-expanded','false');
  if(!sheet){host.innerHTML='';return}
  if(sheet.dataset.closing)return;
  sheet.dataset.closing='1';
  const card=sheet.firstElementChild,done=()=>{if(host.firstElementChild===sheet)host.innerHTML=''};
  if(camReduced()||!card?.animate)done();
  else{
    // Leaves faster than it came, from wherever it is (it may have been dragged).
    const from=getComputedStyle(card).transform;
    card.animate([{transform:from==='none'?'translateY(0)':from},{transform:'translateY(100%)'}],{duration:CAM_SHEET_OUT,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
    sheet.animate([{opacity:getComputedStyle(sheet).opacity},{opacity:0}],{duration:CAM_SHEET_OUT,fill:'forwards'}).onfinish=done;
    setTimeout(done,CAM_SHEET_OUT+150);
  }
  if(restoreFocus)byId('camDest')?.focus({preventScroll:true});
}

function openCameraPicker({current,onPick,message=''}){
  const host=byId('camSheetHost');if(!host)return;
  const first=state.courses[0];
  let sel={
    courseId:current?.courseId||first?.id||null,
    sectionId:current?.sectionId||null,
    sessionId:current?.sessionId||null
  };
  const course=()=>state.courses.find(c=>c.id===sel.courseId);
  const fixSection=()=>{const c=course();if(!c){sel.sectionId=null;return}ensureDefaultSections(c);if(!c.sections.some(s=>s.id===sel.sectionId)){sel.sectionId=c.sections[0]?.id||null;sel.sessionId=null}};
  fixSection();

  const pick=d=>{closeCameraPicker({restoreFocus:false});onPick({courseId:d.courseId,sectionId:d.sectionId,sessionId:d.sessionId||null});byId('camDest')?.focus({preventScroll:true})};
  const colorOf=c=>esc(c?.color||'#5B67F1');
  const inkOf=c=>esc(radialInk(c?.color||'#5B67F1'));

  // ---- shell, built once ----
  host.innerHTML=`<div class="cam-sheet" role="dialog" aria-modal="true" aria-labelledby="camSheetTitle"><div class="cam-sheet-card" tabindex="-1"></div></div>`;
  const root=host.firstElementChild,card=root.firstElementChild;
  byId('camDest')?.setAttribute('aria-expanded','true');
  camSheetBackground(true);
  document.addEventListener('keydown',camSheetKey);
  root.addEventListener('pointerdown',e=>{if(e.target===root)closeCameraPicker()});
  enableSheetDrag(root,card);
  if(!camReduced()&&card.animate){
    card.animate([{transform:'translateY(100%)'},{transform:'translateY(0)'}],{duration:CAM_SHEET_IN,easing:'cubic-bezier(.2,.8,.2,1)'});
    root.animate([{opacity:0},{opacity:1}],{duration:200});
  }

  // Replaces the content without losing the scroll positions or the focused control.
  function setCard(html,focusFirst=false){
    const keyOf=el=>el?.closest?.('[data-k]')?.dataset.k;
    const focused=card.contains(document.activeElement)?keyOf(document.activeElement):null;
    const top=card.querySelector('.cam-sheet-scroll')?.scrollTop||0,rows=[...card.querySelectorAll('[data-hscroll]')].map(e=>e.scrollLeft);
    card.innerHTML=html;
    const scroll=card.querySelector('.cam-sheet-scroll');if(scroll)scroll.scrollTop=top;
    card.querySelectorAll('[data-hscroll]').forEach((e,i)=>{if(rows[i]!=null)e.scrollLeft=rows[i]});
    if(focused)card.querySelector(`[data-k="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
    else if(focusFirst)card.focus({preventScroll:true});
  }
  const header=(title,{back=false,timetable=false}={})=>`<div class="cam-sheet-drag">
      <div class="cam-sheet-grab" aria-hidden="true"><i></i></div>
      <div class="cam-sheet-head">
        ${back?`<button class="cam-icon-btn" id="camTtBack" data-k="back" aria-label="${esc(camT('ttBack'))}">${icon('chevronLeft',{size:22})}</button>`:''}
        <h2 id="camSheetTitle">${esc(title)}</h2>
        ${timetable?`<button class="cam-icon-btn" id="camTtOpen" data-k="tt" aria-label="${esc(camT('timetable'))}" title="${esc(camT('timetable'))}">${icon('calendar',{size:20})}${state.timetable?.length?'<i class="cam-icon-dot" aria-hidden="true"></i>':''}</button>`:''}
        <button class="cam-icon-btn" id="camSheetClose" data-k="close" aria-label="${esc(camT('closeSheet'))}">${icon('x',{size:20})}</button>
      </div>
    </div>`;

  function renderMain(focusFirst=false){
    fixSection();
    const c=course(),sec=c?.sections.find(s=>s.id===sel.sectionId);
    const today=new Date();
    const sessions=[...(sec?.sessions||[])].reverse().slice(0,20);
    const check=`<span class="cam-check" aria-hidden="true">${icon('check',{size:14,stroke:3.2})}</span>`;
    setCard(`${header(camT('pickerTitle'),{timetable:true})}
      <div class="cam-sheet-scroll">
        ${message?`<p class="cam-sheet-note" role="note">${esc(message)}</p>`:''}
        ${!state.courses.length?`<p class="cam-sheet-msg">${esc(camT('noCourses'))}</p>`:`
        <div class="cam-label" id="camLblCourse">${esc(camT('course'))}</div>
        <div class="cam-chips" role="radiogroup" aria-labelledby="camLblCourse" data-hscroll>${state.courses.map(x=>`<button role="radio" aria-checked="${x.id===sel.courseId}" class="cam-chip${x.id===sel.courseId?' on':''}" data-course="${x.id}" data-k="c${x.id}" style="--c:${colorOf(x)}"><i aria-hidden="true"></i>${esc(x.name)}<svg class="ck" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>`).join('')}</div>
        <div class="cam-label" id="camLblSection">${esc(camT('section'))}</div>
        <div class="cam-seg" role="radiogroup" aria-labelledby="camLblSection">${(c?.sections||[]).map(s=>`<button role="radio" aria-checked="${s.id===sel.sectionId}" class="${s.id===sel.sectionId?'on':''}" data-section="${s.id}" data-k="s${s.id}">${esc(s.name)}</button>`).join('')}</div>
        <div class="cam-label" id="camLblSession">${esc(camT('session'))}</div>
        <div class="cam-sessions" role="radiogroup" aria-labelledby="camLblSession">
          <button role="radio" aria-checked="${!sel.sessionId}" class="cam-session new${!sel.sessionId?' on':''}" data-session="" data-k="n"><span class="cam-session-ico" aria-hidden="true">${icon('plus',{size:18,stroke:2.4})}</span><span class="cam-session-txt"><b>${esc(camT('newSession'))}</b><small>${esc(camT('sessionN',{n:nextSessionNumber(sec)}))}</small></span>${check}</button>
          ${sessions.map(s=>{const isToday=sameLocalDay(s.createdAt,today);return`<button role="radio" aria-checked="${s.id===sel.sessionId}" class="cam-session${s.id===sel.sessionId?' on':''}" data-session="${s.id}" data-k="x${s.id}"><span class="cam-session-ico num" aria-hidden="true">${s.number||''}</span><span class="cam-session-txt"><b>${esc(s.title||camT('sessionN',{n:s.number}))}</b><small>${esc(camT('photosCount',{n:s.photoIds?.length||0}))}${isToday?` · ${esc(camT('today'))}`:''}</small></span>${check}</button>`}).join('')}
        </div>`}
      </div>
      <div class="cam-sheet-actions">
        <button class="cam-btn ghost" id="camSheetCancel" data-k="cancel">${esc(camT('cancel'))}</button>
        <button class="cam-btn primary" id="camSheetUse" data-k="use" ${!sel.sectionId?'disabled':''}>${esc(camT('useDest'))}</button>
      </div>`,focusFirst);
    card.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{if(sel.courseId!==b.dataset.course){sel={courseId:b.dataset.course,sectionId:null,sessionId:null}}renderMain()});
    card.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{if(sel.sectionId!==b.dataset.section){sel.sectionId=b.dataset.section;sel.sessionId=null}renderMain()});
    card.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{sel.sessionId=b.dataset.session||null;renderMain()});
    byId('camSheetCancel').onclick=()=>closeCameraPicker();
    byId('camSheetClose').onclick=()=>closeCameraPicker();
    byId('camSheetUse').onclick=()=>sel.sectionId&&pick(sel);
    byId('camTtOpen').onclick=()=>renderTimetable(true);
    // Keep the selected course in view when there are many.
    card.querySelector('.cam-chip.on')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }

  function renderTimetable(focusFirst=false){
    const tt=Array.isArray(state.timetable)?state.timetable:[];
    const days=camT('days');
    const order=[1,2,3,4,5,6,0];
    const courseName=id=>state.courses.find(c=>c.id===id)?.name||'—';
    const sectionName=(cid,sid)=>state.courses.find(c=>c.id===cid)?.sections.find(s=>s.id===sid)?.name||'—';
    const rows=order.map(d=>{
      const list=tt.filter(e=>Number(e.day)===d).sort((a,b)=>camMinutes(a.start)-camMinutes(b.start));
      if(!list.length)return'';
      return`<div class="cam-label">${esc(days[d])}</div>${list.map(e=>`<div class="cam-tt-row"><span class="cam-tt-time">${esc(e.start)}–${esc(e.end)}</span><span class="cam-tt-name">${esc(courseName(e.courseId))} · ${esc(sectionName(e.courseId,e.sectionId))}</span><button class="cam-icon-btn" data-tt-del="${e.id}" data-k="d${e.id}" aria-label="${esc(camT('ttDelete'))}">${icon('trash',{size:18})}</button></div>`).join('')}`;
    }).join('');
    const c0=course()||state.courses[0];
    const todayIdx=new Date().getDay();
    setCard(`${header(camT('timetable'),{back:true})}
      <div class="cam-sheet-scroll">
        <p class="cam-sheet-msg">${esc(camT('timetableHint'))}</p>
        ${rows||`<p class="cam-sheet-msg">${esc(camT('ttEmpty'))}</p>`}
        ${state.courses.length?`<div class="cam-label">${esc(camT('ttAdd'))}</div>
        <div class="cam-tt-form">
          <label><span>${esc(camT('course'))}</span><select id="ttCourse">${state.courses.map(c=>`<option value="${c.id}" ${c.id===c0?.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label><span>${esc(camT('section'))}</span><select id="ttSection"></select></label>
          <label><span>${esc(camT('ttDay'))}</span><select id="ttDay">${order.map(d=>`<option value="${d}" ${d===todayIdx?'selected':''}>${esc(days[d])}</option>`).join('')}</select></label>
          <div class="cam-tt-times">
            <label><span>${esc(camT('ttStart'))}</span><input type="time" id="ttStart" value="08:00" required></label>
            <label><span>${esc(camT('ttEnd'))}</span><input type="time" id="ttEnd" value="10:00" required></label>
          </div>
          <button class="cam-btn primary" id="ttAdd">${esc(camT('ttSave'))}</button>
        </div>`:`<p class="cam-sheet-msg">${esc(camT('noCourses'))}</p>`}
      </div>`,focusFirst);
    byId('camTtBack').onclick=()=>renderMain(true);
    byId('camSheetClose').onclick=()=>closeCameraPicker();
    card.querySelectorAll('[data-tt-del]').forEach(b=>b.onclick=()=>{state.timetable=tt.filter(e=>e.id!==b.dataset.ttDel);saveState();renderTimetable()});
    const fillSections=()=>{const c=state.courses.find(x=>x.id===byId('ttCourse').value);if(c)ensureDefaultSections(c);byId('ttSection').innerHTML=(c?.sections||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')};
    if(byId('ttCourse')){
      fillSections();
      byId('ttCourse').onchange=fillSections;
      byId('ttAdd').onclick=()=>{
        const start=byId('ttStart').value,end=byId('ttEnd').value;
        if(!(camMinutes(end)>camMinutes(start))){showToast(camT('ttInvalid'));return}
        state.timetable=[...tt,{id:uid(),courseId:byId('ttCourse').value,sectionId:byId('ttSection').value,day:Number(byId('ttDay').value),start,end}];
        saveState();renderTimetable();
      };
    }
  }

  renderMain(true);
}

// Drag the header down to close: the sheet follows the finger, the dimming fades with it; past a
// distance (or a quick flick) it closes, otherwise it springs back.
function enableSheetDrag(root,card){
  let drag=null;
  const zone=()=>card.querySelector('.cam-sheet-drag');
  card.addEventListener('pointerdown',e=>{
    const z=zone();if(!z||!z.contains(e.target)||e.target.closest('button')||(e.pointerType==='mouse'&&e.button!==0))return;
    drag={id:e.pointerId,y0:e.clientY,last:e.clientY,t:e.timeStamp,v:0,dy:0};
    z.setPointerCapture?.(e.pointerId);card.style.transition='none';
  });
  card.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    drag.v=(e.clientY-drag.last)/Math.max(1,e.timeStamp-drag.t);drag.last=e.clientY;drag.t=e.timeStamp;
    drag.dy=Math.max(0,e.clientY-drag.y0);
    card.style.transform=`translateY(${drag.dy}px)`;
    root.style.setProperty('--scrim-a',String(.35*(1-Math.min(1,drag.dy/360))));
  });
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const{dy,v}=drag;drag=null;
    if(dy>96||(dy>28&&v>.7)){closeCameraPicker();return} // far enough, or a quick flick (not a twitch of the finger)
    card.style.transition='transform .24s cubic-bezier(.2,.8,.2,1)';card.style.transform='';root.style.removeProperty('--scrim-a');
    setTimeout(()=>{card.style.transition=''},260);
  };
  card.addEventListener('pointerup',end);card.addEventListener('pointercancel',end);
}
