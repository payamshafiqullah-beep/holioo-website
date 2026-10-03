// Capture en direct (tablet / computer, window ≥ 768 px): photos taken with Holioo on the phone, same Google
// account, appear here within seconds, each with a note field beside it. This screen tells the phone it is
// listening (presence, features/remote-sync.js `updatePresence`); the phone then sends each photo to Drive at
// once and signals it. The screen follows the séance the phone is shooting into.

// One photo with its typed note beside it (Live capture screen).
function DeskPhotoRow(id,i,text){
  return`<li class="desk-row" data-photo-id="${id}">
    <figure class="desk-photo">
      <button class="desk-photo-btn" type="button" data-open-photo="${id}" aria-label="Ouvrir la photo ${i+1}"><img alt="Photo ${i+1}" decoding="async"></button>
      <span class="num">${i+1}</span>
    </figure>
    <label class="desk-note" data-note-state>
      <span class="desk-note-label">Photo ${i+1}<i class="desk-note-saved" aria-hidden="true">${icon('check',{size:13})}</i></span>
      <textarea data-note-photo="${id}" rows="4" placeholder="Vos notes sur cette photo…">${esc(text)}</textarea>
    </label>
  </li>`;
}

let liveSessionId=null;
const liveArrivals=new Map();   // photo id → séance id: received, maybe not yet in the merged course structure
let liveCleanup=null;

function livePhoneStatus(){
  if(!navigator.onLine)return{cls:'offline',text:'Hors ligne'};
  if(!driveStatus?.connected)return{cls:'error',text:'Google Drive non connecté'};
  const phones=(window.HoliooSignals?.peers()||[]).filter(p=>!p.desk);
  return phones.length?{cls:'online',text:'Téléphone connecté'}:{cls:'pending',text:'En attente du téléphone'};
}
function liveIds(sessionId){
  const ids=[...(findSessionContext(sessionId)?.session.photoIds||[])];
  for(const[id,sid]of liveArrivals)if(sid===sessionId&&!ids.includes(id))ids.push(id);
  return ids;
}
const liveReducedMotion=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches;

async function renderLiveCapture(){
  liveCleanup?.();liveCleanup=null;
  if(typeof isDesk==='function'&&!isDesk()){navigate('home');return}
  if(!liveSessionId&&currentSessionId&&findSessionContext(currentSessionId))liveSessionId=currentSessionId;
  const ctx=liveSessionId?findSessionContext(liveSessionId):null;
  const ids=liveSessionId?liveIds(liveSessionId):[];
  const notes=liveSessionId?await notesFor(liveSessionId):null;
  const status=livePhoneStatus();
  const title=ctx?ctx.session.title:liveSessionId?'Nouvelle séance':'Capture en direct';
  const sub=ctx?`${ctx.course.name} · ${ctx.section.name} · ${plural(ids.length,'photo')}`:'Les photos prises sur votre téléphone s’affichent ici aussitôt.';
  app.innerHTML=`<section class="screen screen-wide live-screen">
    <div class="live-head">
      <div class="page-intro"><p class="eyebrow">CAPTURE EN DIRECT</p><h1 class="hero-title">${esc(title)}</h1><p class="lead" id="liveSub">${esc(sub)}</p></div>
      <span class="live-status ${status.cls}" id="liveStatus" role="status" aria-live="polite"><i class="live-pulse" aria-hidden="true"></i><span>${esc(status.text)}</span></span>
    </div>
    ${ids.length?`<ol class="desk-rows" id="liveRows">${ids.map((id,i)=>DeskPhotoRow(id,i,notes?.photos[id]?.text||'')).join('')}</ol>`
      :`<div class="live-empty">
        <span class="live-empty-icon">${icon('phone',{size:34})}</span>
        <h2>Prenez une photo avec votre téléphone</h2>
        <ol>
          <li>Ouvrez Holioo sur votre téléphone, avec le même compte Google.</li>
          <li>Photographiez le tableau ou vos documents, dans la séance de votre choix.</li>
          <li>Chaque photo apparaît ici en quelques secondes : écrivez vos notes à côté.</li>
        </ol>
        ${driveStatus?.connected?'':`<button class="desk-action" type="button" data-nav="sync">${icon('cloud',{size:17})}<span>Connecter Google Drive</span></button>`}
      </div>`}
  </section>`;
  const cleanups=[],fields=new Map();
  const box=byId('liveRows');
  const wireRow=row=>{
    const id=row.dataset.photoId,t=row.querySelector('textarea');
    if(t)fields.set(id,bindNoteField(t,liveSessionId,id));
    const b=row.querySelector('[data-open-photo]');
    b.onclick=()=>{const all=liveIds(liveSessionId);openPhotoViewer(all,Math.max(0,all.indexOf(id)),{title,source:'session',sourceId:liveSessionId,editable:true,returnView:'live',courseId:ctx?.course.id,sectionId:ctx?.section.id,sessionId:liveSessionId})};
  };
  const fillRow=async row=>{
    const r=await photoRow(row.dataset.photoId),img=row.querySelector('img'),b=photoBlob(r);
    if(b&&img.isConnected){img.src=thumbUrl(b);row.querySelector('.desk-photo')?.classList.remove('is-loading')}
  };
  if(box)box.querySelectorAll('.desk-row').forEach(row=>{wireRow(row);row.querySelector('.desk-photo').classList.add('is-loading');fillRow(row)});

  cleanups.push(onRemoteSignal((sig,got)=>{
    if(sig.kind!=='photo'||!sig.refId)return;
    const sid=sig.sessionId||liveSessionId;
    liveArrivals.set(sig.refId,sid);
    if(sid!==liveSessionId||!byId('liveRows')){liveSessionId=sid;got?.finally(()=>renderWhenIdle());return}
    const rows=byId('liveRows');
    let row=rows.querySelector(`[data-photo-id="${CSS.escape(sig.refId)}"]`);
    if(!row){
      rows.insertAdjacentHTML('beforeend',DeskPhotoRow(sig.refId,rows.children.length,''));
      row=rows.lastElementChild;wireRow(row);row.classList.add('live-new');
      row.scrollIntoView({behavior:liveReducedMotion()?'auto':'smooth',block:'center'});
      byId('liveSub').textContent=ctx?`${ctx.course.name} · ${ctx.section.name} · ${plural(rows.children.length,'photo')}`:plural(rows.children.length,'photo');
    }
    row.querySelector('.desk-photo').classList.add('is-loading');
    got?.then(ok=>{
      if(!ok){showToast('Photo reçue, téléchargement impossible pour le moment');return}
      fillRow(row);showToast('Nouvelle photo du téléphone');
      const a=document.activeElement;
      if(!a||!/^(INPUT|TEXTAREA)$/.test(a.tagName))row.querySelector('textarea')?.focus({preventScroll:true});
    });
  }));
  // Notes typed elsewhere appear in place (a field being typed in is left alone).
  cleanups.push(onNotesChanged((sid,doc,{remote})=>{
    if(!remote||sid!==liveSessionId)return;
    for(const[id,f]of fields)f.setText(doc.photos[id]?.text||'');
  }));
  if(window.HoliooSignals)cleanups.push(HoliooSignals.onPeers(()=>{
    const s=livePhoneStatus(),el=byId('liveStatus');
    if(el){el.className=`live-status ${s.cls}`;el.lastElementChild.textContent=s.text}
  }));
  if(liveSessionId&&typeof pullSessionNotes==='function')pullSessionNotes(liveSessionId).catch(()=>{});
  liveCleanup=()=>cleanups.forEach(fn=>fn());
}
