'use strict';
// Destination picker for the camera: a bottom sheet drawn inside the camera screen, so the
// live preview keeps running underneath. Recent destinations first for one-tap switching,
// then Course → Section → Session, and the weekly timetable editor.

function cameraDestinationLabel(dest){
  if(!dest)return camT('chooseDest');
  const course=state.courses.find(c=>c.id===dest.courseId);
  const section=course?.sections.find(s=>s.id===dest.sectionId);
  if(!course||!section)return camT('chooseDest');
  const session=dest.sessionId&&section.sessions.find(s=>s.id===dest.sessionId);
  const part=session?(session.title||camT('sessionN',{n:session.number})):camT('newSessionN',{n:nextSessionNumber(section)});
  return`${course.name} · ${section.name} · ${part}`;
}

function closeCameraPicker(){
  const host=byId('camSheetHost');if(!host)return;
  const sheet=host.firstElementChild;
  if(!sheet){host.innerHTML='';return}
  sheet.classList.add('closing');
  setTimeout(()=>{if(host.firstElementChild===sheet)host.innerHTML=''},180);
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

  const pick=d=>{closeCameraPicker();onPick({courseId:d.courseId,sectionId:d.sectionId,sessionId:d.sessionId||null})};

  function renderMain(){
    fixSection();
    const c=course(),sec=c?.sections.find(s=>s.id===sel.sectionId);
    const recent=validRecentDestinations(state.cameraRecent,state.courses);
    const today=new Date();
    const sessions=[...(sec?.sessions||[])].reverse().slice(0,20);
    host.innerHTML=`<div class="cam-sheet" role="dialog" aria-modal="true" aria-labelledby="camSheetTitle">
      <div class="cam-sheet-card">
        <div class="cam-sheet-handle"></div>
        <div class="cam-sheet-top"><h2 id="camSheetTitle">${esc(camT('pickerTitle'))}</h2><button class="cam-tt-btn" id="camTtOpen">${icon('calendar',{size:16})}${esc(camT('timetable'))}</button></div>
        ${message?`<p class="cam-sheet-msg">${esc(message)}</p>`:''}
        ${!state.courses.length?`<p class="cam-sheet-msg">${esc(camT('noCourses'))}</p>`:`
        ${recent.length?`<div class="cam-label">${esc(camT('recent'))}</div>
        <div class="cam-recent">${recent.map((d,i)=>`<button class="cam-recent-row" data-recent="${i}">${icon('clock',{size:16})}<span>${esc(cameraDestinationLabel(d))}</span></button>`).join('')}</div>`:''}
        <div class="cam-label">${esc(camT('course'))}</div>
        <div class="cam-chips" role="radiogroup" aria-label="${esc(camT('course'))}">${state.courses.map(x=>`<button role="radio" aria-checked="${x.id===sel.courseId}" class="cam-chip${x.id===sel.courseId?' on':''}" data-course="${x.id}"><i style="background:${esc(x.color||'#5B67F1')}"></i>${esc(x.name)}</button>`).join('')}</div>
        <div class="cam-label">${esc(camT('section'))}</div>
        <div class="cam-seg" role="radiogroup" aria-label="${esc(camT('section'))}">${(c?.sections||[]).map(s=>`<button role="radio" aria-checked="${s.id===sel.sectionId}" class="${s.id===sel.sectionId?'on':''}" data-section="${s.id}">${esc(s.name)}</button>`).join('')}</div>
        <div class="cam-label">${esc(camT('session'))}</div>
        <div class="cam-sessions" role="radiogroup" aria-label="${esc(camT('session'))}">
          <button role="radio" aria-checked="${!sel.sessionId}" class="cam-session new${!sel.sessionId?' on':''}" data-session="">${icon('plus',{size:18})}<span><b>${esc(camT('newSession'))}</b><small>${esc(camT('sessionN',{n:nextSessionNumber(sec)}))}</small></span></button>
          ${sessions.map(s=>{const isToday=sameLocalDay(s.createdAt,today);return`<button role="radio" aria-checked="${s.id===sel.sessionId}" class="cam-session${s.id===sel.sessionId?' on':''}" data-session="${s.id}"><span class="cam-session-num">${s.number||''}</span><span><b>${esc(s.title||camT('sessionN',{n:s.number}))}</b><small>${esc(camT('photosCount',{n:s.photoIds?.length||0}))}${isToday?` · ${esc(camT('today'))}`:''}</small></span></button>`}).join('')}
        </div>`}
        <div class="cam-sheet-actions">
          <button class="cam-btn ghost" id="camSheetCancel">${esc(camT('cancel'))}</button>
          <button class="cam-btn primary" id="camSheetUse" ${!sel.sectionId?'disabled':''}>${esc(camT('useDest'))}</button>
        </div>
      </div>
    </div>`;
    const root=host.firstElementChild;
    root.onclick=e=>{if(e.target===root)closeCameraPicker()};
    root.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>pick(recent[Number(b.dataset.recent)]));
    root.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{if(sel.courseId!==b.dataset.course){sel={courseId:b.dataset.course,sectionId:null,sessionId:null}}renderMain()});
    root.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{if(sel.sectionId!==b.dataset.section){sel.sectionId=b.dataset.section;sel.sessionId=null}renderMain()});
    root.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{sel.sessionId=b.dataset.session||null;renderMain()});
    byId('camSheetCancel').onclick=closeCameraPicker;
    byId('camSheetUse').onclick=()=>sel.sectionId&&pick(sel);
    byId('camTtOpen').onclick=renderTimetable;
    // Keep the selected chip in view when the list of courses is long.
    root.querySelector('.cam-chip.on')?.scrollIntoView?.({block:'nearest',inline:'center'});
  }

  function renderTimetable(){
    const tt=Array.isArray(state.timetable)?state.timetable:[];
    const days=camT('days');
    const order=[1,2,3,4,5,6,0];
    const courseName=id=>state.courses.find(c=>c.id===id)?.name||'—';
    const sectionName=(cid,sid)=>state.courses.find(c=>c.id===cid)?.sections.find(s=>s.id===sid)?.name||'—';
    const rows=order.map(d=>{
      const list=tt.filter(e=>Number(e.day)===d).sort((a,b)=>camMinutes(a.start)-camMinutes(b.start));
      if(!list.length)return'';
      return`<div class="cam-label">${esc(days[d])}</div>${list.map(e=>`<div class="cam-tt-row"><span class="cam-tt-time">${esc(e.start)}–${esc(e.end)}</span><span class="cam-tt-name">${esc(courseName(e.courseId))} · ${esc(sectionName(e.courseId,e.sectionId))}</span><button class="cam-icon-btn" data-tt-del="${e.id}" aria-label="${esc(camT('ttDelete'))}">${icon('trash',{size:18})}</button></div>`).join('')}`;
    }).join('');
    const c0=course()||state.courses[0];
    const todayIdx=new Date().getDay();
    host.innerHTML=`<div class="cam-sheet" role="dialog" aria-modal="true" aria-labelledby="camSheetTitle">
      <div class="cam-sheet-card">
        <div class="cam-sheet-handle"></div>
        <div class="cam-sheet-head"><button class="cam-icon-btn" id="camTtBack" aria-label="${esc(camT('ttBack'))}">${icon('chevronLeft',{size:22})}</button><h2 id="camSheetTitle">${esc(camT('timetable'))}</h2></div>
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
      </div>
    </div>`;
    const root=host.firstElementChild;
    root.onclick=e=>{if(e.target===root)closeCameraPicker()};
    byId('camTtBack').onclick=renderMain;
    root.querySelectorAll('[data-tt-del]').forEach(b=>b.onclick=()=>{state.timetable=tt.filter(e=>e.id!==b.dataset.ttDel);saveState();renderTimetable()});
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

  renderMain();
}
