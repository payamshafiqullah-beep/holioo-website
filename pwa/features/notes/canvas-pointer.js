// Notes page, pointer: binding the events, keys, pen / finger / mouse down-move-up.
// ── Pointer tools ──
const canvasPoint=(rt,e)=>{const r=rt.sheet.getBoundingClientRect();return{x:(e.clientX-r.left)/rt.scale,y:(e.clientY-r.top)/rt.scale}};
const canvasTol=rt=>16/rt.scale;   // 16 screen px, in page units
const canvasPressure=e=>e.pointerType==='pen'?canvasRound(e.pressure||.5,2):.5;
// The pen and the mouse draw; a finger only when "stylus only" is off (and not while a pen is at work: that is a palm).
function canvasIsInk(rt,e){
  if(e.pointerType==='touch')return!canvasStylusOnly()&&performance.now()>=rt.penUntil;
  return true;
}
function canvasBind(rt){
  const sheet=rt.sheet,add=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);rt.guards.push([target,type,fn,opts])};
  add(sheet,'pointerdown',e=>canvasDown(rt,e));
  add(sheet,'pointermove',e=>canvasMove(rt,e));
  add(sheet,'pointerup',e=>canvasUp(rt,e));
  add(sheet,'pointercancel',e=>canvasCancel(rt,e));
  add(sheet,'pointerleave',()=>{const c=rt.overlay.querySelector('.cv-eraser');if(c)c.style.display='none'});
  add(sheet,'dblclick',e=>{
    if(rt.editing||e.target.closest('.cv-bar'))return;
    const hit=canvasHitItem([...rt.store.items.values()],...Object.values(canvasPoint(rt,e)),canvasTol(rt));
    if(hit?.type==='text')canvasEditText(rt,hit,false);
  });
  add(rt.viewport,'scroll',()=>canvasPlaceBar(rt),{passive:true});
  add(rt.overlay,'click',e=>{
    const act=e.target.closest('[data-cv-act]')?.dataset.cvAct;if(!act)return;
    if(act==='delete')canvasDeleteSelected(rt);else if(act==='duplicate')canvasDuplicateSelected(rt);else canvasFrontSelected(rt);
  });
  // Palm rejection: while the pen is at work (and just after), touches neither scroll nor draw. The pen itself never scrolls.
  const penBusy=()=>!!rt.drawing||!!rt.drag||performance.now()<rt.penUntil;
  add(document,'pointerdown',e=>{if(e.pointerType==='pen')rt.penUntil=performance.now()+CANVAS_PEN_HOLD},true);
  add(document,'pointermove',e=>{if(e.pointerType==='pen')rt.penUntil=performance.now()+CANVAS_PEN_HOLD},true);
  for(const type of['touchstart','touchmove'])add(document,type,e=>{
    if(!rt.root.isConnected||!e.cancelable||!rt.sheet.contains(e.target))return;
    if(penBusy()||[...e.changedTouches].some(t=>t.touchType==='stylus'))e.preventDefault();
  },{capture:true,passive:false});
  add(document,'keydown',e=>canvasOnKey(rt,e));
  // Toolbar
  add(rt.tools,'click',e=>canvasToolsClick(rt,e));
  // Tray
  add(rt.tray,'click',e=>{
    if(e.target.closest('[data-cv-tray-toggle]')){canvasPrefs().tray=canvasPrefs().tray==='closed'?'open':'closed';saveState();canvasRenderTray(rt);return}
  });
  add(rt.tray,'pointerdown',e=>canvasTrayDown(rt,e));
  add(document,'pointermove',e=>canvasTrayMove(rt,e));
  add(document,'pointerup',e=>canvasTrayUp(rt,e));
  add(document,'pointercancel',()=>canvasTrayEnd(rt));
  const ro=new ResizeObserver(()=>{if(rt.root.isConnected&&Math.abs(rt.viewport.clientWidth-rt.lastW)>1){rt.lastW=rt.viewport.clientWidth;canvasLayout(rt);canvasRenderOverlay(rt)}});
  rt.lastW=rt.viewport.clientWidth;ro.observe(rt.viewport);rt.guards.push({disconnect:()=>ro.disconnect()});
  // Photos the phone sends arrive in the tray at once.
  if(typeof onRemoteSignal==='function')rt.unsub.push(onRemoteSignal((sig,got)=>canvasOnSignal(rt,sig,got)));
  // What another device wrote since: read when the page opens (not at every redraw, it is a few Drive requests).
  if(typeof pullSessionCanvas==='function'&&Date.now()-(rt.pulledAt||0)>30000){rt.pulledAt=Date.now();pullSessionCanvas(rt.session.id).catch(e=>console.warn('Canvas pull',e))}
}
function canvasLeave(rt){
  canvasCommitText(rt);canvasCancelGesture(rt);
  rt.scrollTop=rt.viewport?.scrollTop||0;
  for(const g of rt.guards){if(Array.isArray(g))g[0].removeEventListener(g[1],g[2],g[3]);else g.disconnect?.()}
  rt.guards=[];for(const u of rt.unsub)u();rt.unsub=[];
  if(currentView!=='notes'&&rt.trayShown){for(const id of rt.trayShown)rt.store.known.add(id);rt.dirty=true}   // seen: no longer "new"
  rt.root=null;
  canvasSave(rt);
}

function canvasToolsClick(rt,e){
  const t=e.target.closest('[data-cv-tool],[data-cv-color],[data-cv-size],[data-cv-bg],[data-cv-stylus],[data-cv-space],[data-cv-snap],[data-cv-hold],[data-cv-erasemode]');if(!t)return;
  const d=t.dataset,prefs=canvasPrefs();
  if(d.cvTool){
    canvasCommitText(rt);rt.tool=d.cvTool;prefs.tool=d.cvTool;
    if(rt.tool!=='select')rt.selected=null;
    saveState();canvasRenderOverlay(rt);canvasLayout(rt);canvasRenderTools(rt);return;
  }
  if(d.cvColor!==undefined){
    const k=canvasPaletteKind(rt.tool),i=+d.cvColor;prefs.ci[k]=i;saveState();
    const color=CANVAS_COLORS[k][i];
    if(rt.editing&&rt.editing.item.type==='text'){rt.editing.item.color=color;const el=rt.itemEls.get(rt.editing.item.id);if(el)el.style.color=color}
    else if(rt.selected)canvasSelectedChange(rt,o=>o.type==='photo'?null:{...o,color});
    canvasRenderTools(rt);return;
  }
  if(d.cvSize!==undefined){
    const i=+d.cvSize;prefs.size=i;saveState();
    const sel=rt.editing?.item||canvasItem(rt,rt.selected);
    if(sel?.type==='text'){
      const size=CANVAS_SIZES.text[i];
      if(rt.editing){rt.editing.item.size=size;rt.editing.item.h=canvasTextHeight(1,size);canvasUpdateItemEl(rt,rt.editing.item)}
      else canvasSelectedChange(rt,o=>{const lines=canvasLayoutText(o.text,o.w-2*CANVAS_TEXT_PAD,canvasMeasure(size));return{...o,size,lines,h:canvasTextHeight(lines.length,size)}});
    }
    canvasRenderTools(rt);return;
  }
  if(d.cvSnap!==undefined){prefs.snap=!prefs.snap;saveState();canvasRenderTools(rt);showToast(prefs.snap?'Formes automatiques activées':'Formes automatiques désactivées');return}
  if(d.cvHold!==undefined){prefs.holdSnap=!canvasHoldSnapOn();saveState();canvasRenderTools(rt);showToast(prefs.holdSnap?'Forme auto en maintenant activée':'Forme auto en maintenant désactivée');return}
  if(d.cvErasemode){prefs.eraseMode=d.cvErasemode;saveState();canvasRenderTools(rt);return}
  if(d.cvBg){
    if(rt.store.page.bg===d.cvBg)return;
    const before={bg:rt.store.page.bg},after={bg:d.cvBg};
    rt.store.page.bg=d.cvBg;rt.store.page.bgAt=Date.now();
    canvasCommit(rt,[canvasChangePage(before,after)]);
    canvasLayout(rt);canvasRenderTools(rt);return;
  }
  if(d.cvStylus!==undefined){prefs.stylusOnly=!canvasStylusOnly();saveState();canvasLayout(rt);canvasRenderTools(rt);showToast(canvasStylusOnly()?'Stylet seul : le doigt fait défiler':'Le doigt dessine aussi (deux doigts pour défiler)');return}
  if(d.cvSpace!==undefined){
    const before={height:rt.store.page.height},h=Math.min(CANVAS_MAX_H,rt.store.page.height+CANVAS_ADD_SPACE);
    if(h===before.height){showToast('La page a atteint sa longueur maximale');return}
    rt.store.page.height=h;canvasCommit(rt,[canvasChangePage(before,{height:h})]);
    canvasLayout(rt);canvasRenderOverlay(rt);
    rt.viewport.scrollBy({top:Math.min(CANVAS_ADD_SPACE*rt.scale,rt.viewport.clientHeight*.6),behavior:'smooth'});
  }
}

function canvasOnKey(rt,e){
  if(!rt.root?.isConnected||currentView!=='notes')return;
  const typing=e.target.matches?.('input,textarea,select,[contenteditable="true"]');
  const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&k==='z'&&!typing){e.preventDefault();e.shiftKey?canvasRedoAction(rt):canvasUndoAction(rt);return}
  if(mod&&k==='y'&&!typing){e.preventDefault();canvasRedoAction(rt);return}
  if(typing||rt.editing)return;
  if((e.key==='Delete'||e.key==='Backspace')&&rt.selected){e.preventDefault();canvasDeleteSelected(rt)}
  else if(e.key==='Escape'&&rt.selected){rt.selected=null;canvasRenderOverlay(rt)}
}

function canvasDown(rt,e){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(e.target.closest('.cv-text-edit,.cv-bar'))return;
  if(rt.editing)canvasCommitText(rt);
  if(rt.tool==='hand')return;   // the Main tool: the page only scrolls (finger, wheel), nothing is drawn or moved
  if(e.pointerType==='touch'){
    rt.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    // Two fingers scroll the page (when a finger may draw): the stroke in progress is dropped.
    if(rt.touches.size>=2&&!canvasStylusOnly()){
      if(rt.drawing){rt.drawing.path.remove();rt.drawing=null}
      rt.pan={x:avg(rt.touches,'x'),y:avg(rt.touches,'y')};e.preventDefault();return;
    }
    if(performance.now()<rt.penUntil)return;
  }
  const p=canvasPoint(rt,e);
  if(rt.tool==='select')return canvasSelectDown(rt,e,p);
  if(!canvasIsInk(rt,e))return;
  if(rt.tool==='pen'||rt.tool==='highlighter')return canvasInkDown(rt,e,p);
  if(rt.tool==='eraser'){rt.erasing={pointerId:e.pointerId,before:[],created:new Map(),partial:canvasEraseMode()==='partial'};rt.sheet.setPointerCapture(e.pointerId);canvasEraseAt(rt,p,e);e.preventDefault();return}
  if(rt.tool==='text'){rt.pendingText={id:e.pointerId,x:e.clientX,y:e.clientY,p,hit:canvasHitItem([...rt.store.items.values()],p.x,p.y,canvasTol(rt))};return}
}
function avg(map,k){let s=0;for(const v of map.values())s+=v[k];return s/map.size}

function canvasMove(rt,e){
  if(e.pointerType==='touch'&&rt.touches.has(e.pointerId)){
    rt.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(rt.pan&&rt.touches.size>=2){
      const x=avg(rt.touches,'x'),y=avg(rt.touches,'y');
      rt.viewport.scrollBy(rt.pan.x-x,rt.pan.y-y);rt.pan={x,y};e.preventDefault();return;
    }
  }
  if(rt.tool==='eraser'&&e.pointerType!=='touch')canvasEraserCursor(rt,e);
  const p=canvasPoint(rt,e);
  if(rt.pendingText&&rt.pendingText.id===e.pointerId&&Math.hypot(e.clientX-rt.pendingText.x,e.clientY-rt.pendingText.y)>8)rt.pendingText=null;
  if(rt.pendingDeselect&&rt.pendingDeselect.id===e.pointerId&&Math.hypot(e.clientX-rt.pendingDeselect.x,e.clientY-rt.pendingDeselect.y)>8)rt.pendingDeselect=null;
  if(rt.drag&&rt.drag.pointerId===e.pointerId){canvasDragMove(rt,e,p);e.preventDefault();return}
  const d=rt.drawing;
  if(d&&d.pointerId===e.pointerId){
    if(d.snap){e.preventDefault();return}   // the shape is showing: it stays until the pen lifts
    canvasHoldWatch(rt,d,e);
    const events=e.getCoalescedEvents?.(),list=events?.length?events:[e];
    for(const ev of list){
      const q=canvasPoint(rt,ev),last=d.pts.at(-1);
      if(Math.hypot(q.x-last[0],q.y-last[1])>=CANVAS_MIN_STEP)d.pts.push([canvasRound(q.x),canvasRound(q.y),canvasPressure(ev)]);
    }
    canvasGrowFor(rt,d.pts.at(-1)[1]);
    if(!d.raf)d.raf=requestAnimationFrame(()=>{d.raf=0;canvasDrawLive(d)});
    e.preventDefault();return;
  }
  if(rt.erasing&&rt.erasing.pointerId===e.pointerId){canvasEraseAt(rt,p,e);e.preventDefault();return}
}
function canvasUp(rt,e){
  rt.touches.delete(e.pointerId);
  if(rt.pan&&rt.touches.size<2)rt.pan=null;
  const p=canvasPoint(rt,e);
  if(rt.drag&&rt.drag.pointerId===e.pointerId){canvasDragEnd(rt,e,p);return}
  const d=rt.drawing;
  if(d&&d.pointerId===e.pointerId){canvasInkEnd(rt,d);e.preventDefault();return}
  if(rt.erasing&&rt.erasing.pointerId===e.pointerId){canvasEraseEnd(rt);return}
  if(rt.pendingText&&rt.pendingText.id===e.pointerId){
    const pt=rt.pendingText;rt.pendingText=null;
    if(pt.hit?.type==='text')canvasEditText(rt,pt.hit,false);else canvasNewText(rt,pt.p);
    return;
  }
  if(rt.pendingDeselect&&rt.pendingDeselect.id===e.pointerId){rt.pendingDeselect=null;if(rt.selected){rt.selected=null;canvasRenderOverlay(rt)}}
}
function canvasCancel(rt,e){
  rt.touches.delete(e.pointerId);if(rt.touches.size<2)rt.pan=null;
  rt.pendingText=null;rt.pendingDeselect=null;
  if(rt.drawing&&rt.drawing.pointerId===e.pointerId){rt.drawing.path.remove();rt.drawing=null}
  if(rt.drag&&rt.drag.pointerId===e.pointerId){const g=rt.drag;rt.store.items.set(g.id,g.orig);rt.drag=null;canvasSyncItems(rt);canvasRenderOverlay(rt)}
  if(rt.erasing&&rt.erasing.pointerId===e.pointerId)canvasEraseEnd(rt);
}
