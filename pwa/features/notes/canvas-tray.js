// Notes page, remote changes and the photo tray (drag a photo onto the page).
// A remote change that arrived mid-gesture is drawn once the gesture is over.
function canvasAfterGesture(rt){
  if(!rt.stale||canvasBusy())return;
  rt.stale=false;canvasLayout(rt);canvasSyncItems(rt);canvasSyncInk(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
}
// Another device changed this page (features/notes/canvas-sync.js).
function canvasApplyRemote(rt,merged){
  rt.store=canvasStore(merged);rt.docStamp=merged.updatedAt;
  if(rt.selected&&!canvasItem(rt,rt.selected))rt.selected=null;
  if(rt.root?.isConnected&&!canvasBusy()){canvasLayout(rt);canvasSyncItems(rt);canvasSyncInk(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);canvasRenderTools(rt)}
  else rt.stale=true;
  rt.dirty=true;rt.saveState='saving';clearTimeout(rt.saveTimer);rt.saveTimer=setTimeout(()=>canvasSave(rt),600);
  canvasRefreshTopBar();
}

// ── Photo tray ──
function canvasTrayIds(rt){
  const ids=[...rt.session.photoIds];
  for(const id of rt.arrivals)if(!ids.includes(id))ids.push(id);
  return ids;
}
function canvasRenderTray(rt,{flash=null}={}){
  if(!rt.tray||rt.trayDrag?.started)return;
  const ids=canvasTrayIds(rt),placed=new Set([...rt.store.items.values()].filter(i=>!i.deleted&&i.type==='photo').map(i=>i.photoId));
  const fresh=new Set(ids.filter(id=>!rt.store.known.has(id)&&!placed.has(id)));
  const open=canvasPrefs().tray!=='closed';
  rt.trayShown=new Set(ids);   // what the tray showed (the badge on the button counts as shown too): "seen" when the page is left
  rt.tray.className=`cv-tray ${open?'open':'closed'}`;
  if(!open){
    rt.tray.innerHTML=`<button class="cv-tray-fab" type="button" data-cv-tray-toggle aria-expanded="false" title="Afficher les photos de la séance" aria-label="Afficher les photos de la séance : ${plural(ids.length,'photo')}${fresh.size?`, ${fresh.size} nouvelle${fresh.size>1?'s':''}`:''}">${icon('images',{size:20})}<b>${ids.length}</b>${fresh.size?'<i class="cv-dot-new" aria-hidden="true"></i>':''}</button>`;
    return;
  }
  rt.tray.innerHTML=`<div class="cv-tray-panel">
    <header><strong>Photos</strong><span class="cv-tray-n">${ids.length}</span><button class="cv-tray-close" type="button" data-cv-tray-toggle aria-expanded="true" title="Réduire" aria-label="Réduire les photos">${icon('chevronLeft',{size:18})}</button></header>
    ${ids.length?`<ul class="cv-tray-list">${ids.map((id,i)=>`<li><button class="cv-thumb${placed.has(id)?' placed':''}${fresh.has(id)?' is-new':''}" type="button" data-photo-id="${id}" aria-label="Photo ${i+1}${fresh.has(id)?', nouvelle':''}${placed.has(id)?', déjà placée':''} : toucher pour placer sur la page, ou glisser"><img alt="" draggable="false"><span class="cv-skel"></span>${fresh.has(id)?'<span class="cv-badge new">Nouveau</span>':placed.has(id)?`<span class="cv-badge check" aria-hidden="true">${icon('check',{size:13,stroke:3})}</span>`:''}</button></li>`).join('')}</ul>
    <p class="cv-tray-hint">Touchez une photo pour la placer, ou glissez-la sur la page.</p>`
      :`<p class="cv-tray-empty">Aucune photo dans cette séance. Prenez-en avec le téléphone : elles arrivent ici.</p>`}
  </div>`;
  rt.tray.querySelectorAll('.cv-thumb').forEach(b=>{
    const id=b.dataset.photoId,img=b.querySelector('img');
    photoThumbUrl(id).then(url=>{if(url&&img.isConnected){img.src=url;b.classList.add('loaded')}}).catch(()=>{});
    if(id===flash){b.classList.add('flash');b.scrollIntoView({block:'nearest',behavior:'smooth'})}
  });
}
function canvasOnSignal(rt,sig,got){
  if(!rt.root?.isConnected||sig.kind!=='photo'||!sig.refId)return;
  if(sig.sessionId&&sig.sessionId!==rt.session.id){got?.then(ok=>{if(ok)showToast('Nouvelle photo du téléphone dans une autre séance')});return}
  rt.arrivals.add(sig.refId);
  canvasRenderTray(rt,{flash:sig.refId});
  got?.then(ok=>{
    if(!rt.root?.isConnected)return;
    if(!ok){showToast('Photo reçue, téléchargement impossible pour le moment');return}
    canvasRenderTray(rt,{flash:sig.refId});showToast('Nouvelle photo du téléphone');
  });
}
// Dragging a thumbnail onto the page (a tap places it in the middle of what is visible). A vertical swipe on touch
// scrolls the list instead.
function canvasTrayDown(rt,e){
  const b=e.target.closest('.cv-thumb');if(!b||(e.pointerType==='mouse'&&e.button!==0))return;
  rt.trayDrag={id:b.dataset.photoId,pointerId:e.pointerId,x:e.clientX,y:e.clientY,type:e.pointerType,started:false,ghost:null,t:performance.now()};
}
function canvasTrayMove(rt,e){
  const d=rt.trayDrag;if(!d||d.pointerId!==e.pointerId)return;
  if(!d.started){
    const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(Math.hypot(dx,dy)<8)return;
    if(d.type!=='mouse'&&Math.abs(dy)>Math.abs(dx)){rt.trayDrag=null;return}   // scrolling the list
    d.started=true;
    const src=rt.tray.querySelector(`.cv-thumb[data-photo-id="${CSS.escape(d.id)}"] img`),g=document.createElement('div');
    g.className='cv-ghost';g.innerHTML=`<img alt="" src="${src?.src||''}">`;document.body.appendChild(g);d.ghost=g;
    rt.tray.querySelector(`.cv-thumb[data-photo-id="${CSS.escape(d.id)}"]`)?.classList.add('dragging');
  }
  d.ghost.style.transform=`translate(${e.clientX-48}px,${e.clientY-36}px)`;
  const over=canvasOverPage(rt,e);
  d.ghost.classList.toggle('on-page',over);
  e.preventDefault();
}
const canvasOverPage=(rt,e)=>{
  const v=rt.viewport.getBoundingClientRect(),t=rt.tray.getBoundingClientRect();
  const inView=e.clientX>=v.left&&e.clientX<=v.right&&e.clientY>=v.top&&e.clientY<=v.bottom;
  return inView&&!(e.clientX>=t.left&&e.clientX<=t.right&&e.clientY>=t.top&&e.clientY<=t.bottom);
};
function canvasTrayUp(rt,e){
  const d=rt.trayDrag;if(!d||d.pointerId!==e.pointerId)return;
  if(d.started){
    if(canvasOverPage(rt,e))canvasPlacePhotoAt(rt,d.id,canvasPoint(rt,e));
  }else if(performance.now()-d.t<900)canvasPlacePhotoAt(rt,d.id,null);
  canvasTrayEnd(rt);
}
function canvasTrayEnd(rt){
  const d=rt.trayDrag;if(!d)return;
  d.ghost?.remove();rt.trayDrag=null;
  rt.tray?.querySelectorAll('.cv-thumb.dragging').forEach(b=>b.classList.remove('dragging'));
  canvasRenderTray(rt);
}
