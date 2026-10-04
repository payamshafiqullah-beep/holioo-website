'use strict';
// Ink on the PDF viewer: highlighter, black pen and eraser, in the fullscreen reader only (pages/PdfViewerPage.js).
// It reuses the Notes page (features/canvas-doc.js, pages/NotesCanvasPage.js): same strokes, same perfect-freehand
// outline, same two eraser modes (canvasStrokeHit / canvasEraseSplit) and same undo history (canvasHistory).
//
// Strokes are stored per PDF in IndexedDB `kv` as pdfink:<file id>, in page units (CANVAS_W wide, the height following
// the page's shape), each tagged with its page `pg`, so they stay aligned at any zoom. Whatever is stored is drawn
// on the pages in normal mode too, read-only.

// Three colours per tool, the first being the default: pen black / blue / red, highlighter yellow / green / pink (the Notes palette).
const PDF_INK_COLORS={pen:CANVAS_COLORS.pen.slice(0,3),highlighter:CANVAS_COLORS.highlighter.slice(0,3)};
const PDF_INK_LONG_PRESS_MS=450;
const PDF_INK_SIZE={pen:CANVAS_SIZES.pen[1],highlighter:CANVAS_SIZES.highlighter[1]};
const PDF_INK_ERASER=CANVAS_SIZES.eraser[1];   // eraser radius, page units
const PDF_INK_MIN_STEP=.8;
const PDF_INK_PEN_HOLD_MS=800;                 // after the pen, touches are a resting palm
const pdfInkKey=fileId=>`pdfink:${fileId}`;

// Reading a stored document: the Notes rules for a stroke (colour, size, points made safe), plus a valid page number.
function pdfInkStrokes(raw){
  const out=[];
  for(const r of Array.isArray(raw?.strokes)?raw.strokes:[]){
    const s=normalizeCanvasDoc({strokes:[r]}).strokes[0],pg=Math.floor(+r?.pg);
    if(s&&!s.deleted&&pg>=1)out.push({...s,pg});
  }
  return out;
}

// One step of the eraser at (x,y) on page `pg`, radius r. `er` = {partial, before:[], created:Map} collects the gesture
// for the history (same bookkeeping as the Notes page). Returns the ids of strokes taken off the page and the strokes
// put on it, so the screen can follow.
function pdfInkEraseAt(strokes,er,pg,x,y,r,newId){
  const removed=[],added=[];
  for(const s of [...strokes.values()]){
    if(s.deleted||s.pg!==pg)continue;
    if(!er.partial){
      if(!canvasStrokeHit(s,x,y,r))continue;
      er.before.push(s);strokes.set(s.id,{...s,deleted:true});removed.push(s.id);
      continue;
    }
    const pieces=canvasEraseSplit(s,x,y,r);if(!pieces)continue;
    // A piece made earlier in this same gesture simply disappears (it was never in the history); an original is recorded.
    if(er.created.has(s.id)){er.created.delete(s.id);strokes.delete(s.id)}
    else{er.before.push(s);strokes.set(s.id,{...s,deleted:true})}
    removed.push(s.id);
    for(const pts of pieces){const ns={...s,id:newId(),pts,updatedAt:Date.now()};strokes.set(ns.id,ns);er.created.set(ns.id,ns);added.push(ns)}
  }
  return{removed,added};
}
const pdfInkEraseChanges=er=>[...er.before.map(s=>canvasChangeRemove('s',s)),...[...er.created.values()].map(s=>canvasChangeCreate('s',s))];

async function createPdfInk({fileId,host,boxes,aspects,viewer,frame}){
  let row=null;try{row=await DB.get('kv',pdfInkKey(fileId))}catch{}
  const store={strokes:new Map(pdfInkStrokes(row?.doc).map(s=>[s.id,s])),items:new Map()};
  const hist=canvasHistory(),els=new Map(),svgs=[];
  let tool=null,fullscreen=false,gesture=null,pan=null,penUntil=0,saveTimer=0;
  const touches=new Map();
  const colorOf=t=>{const i=state.settings.pdfInkColor?.[t];return PDF_INK_COLORS[t][i>=0&&i<3?i:0]};   // remembered per tool on this device
  const eraseMode=()=>state.settings.pdfInkErase==='partial'?'partial':'stroke';

  // ---- save ----
  const save=()=>{clearTimeout(saveTimer);saveTimer=0;
    const strokes=[...store.strokes.values()].filter(s=>!s.deleted);
    return DB.put('kv',{key:pdfInkKey(fileId),doc:{version:1,fileId,strokes,updatedAt:Date.now()}}).catch(console.warn)};
  const saveSoon=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(save,350)};

  // ---- drawing on the pages ----
  const pathFor=s=>{
    const p=document.createElementNS(CANVAS_SVG,'path');
    p.setAttribute('fill',s.color);
    if(s.tool==='highlighter'){p.setAttribute('fill-opacity',CANVAS_HIGHLIGHT_ALPHA);p.setAttribute('class','hl')}
    return p;
  };
  const syncPage=pg=>{
    const svg=svgs[pg-1];if(!svg)return;
    for(const[id,el]of els){const st=store.strokes.get(id);if(el.parentNode===svg&&(!st||st.deleted)){el.remove();els.delete(id)}}
    for(const s of store.strokes.values()){
      if(s.deleted||s.pg!==pg||els.has(s.id))continue;
      const p=pathFor(s);p.setAttribute('d',canvasStrokePathD(s));svg.appendChild(p);els.set(s.id,p);
    }
  };
  const syncAll=()=>svgs.forEach((_,i)=>syncPage(i+1));
  boxes.forEach((box,i)=>{
    const svg=document.createElementNS(CANVAS_SVG,'svg');
    svg.setAttribute('class','pdf-ink');svg.setAttribute('viewBox',`0 0 ${CANVAS_W} ${CANVAS_W*aspects[i]}`);svg.setAttribute('preserveAspectRatio','none');
    svg.dataset.page=i+1;svg.dataset.h=CANVAS_W*aspects[i];
    box.appendChild(svg);svgs.push(svg);
  });
  syncAll();
  const point=(svg,e)=>{const r=svg.getBoundingClientRect();return{x:canvasRound((e.clientX-r.left)/r.width*CANVAS_W),y:canvasRound((e.clientY-r.top)/r.height*+svg.dataset.h)}};

  // ---- gestures ----
  const endGesture=cancel=>{
    const g=gesture;gesture=null;if(!g)return;
    cancelAnimationFrame(g.raf);
    try{g.svg.releasePointerCapture(g.pointerId)}catch{}
    if(g.erase){
      const changes=pdfInkEraseChanges(g.erase);
      if(changes.length){canvasHistoryPush(hist,changes);saveSoon()}
    }else if(cancel){g.path.remove()}
    else{
      const s={id:uid(),tool:g.tool,color:g.color,size:g.size,pts:g.pts,sp:g.sp,pg:g.pg,at:Date.now(),updatedAt:Date.now()};
      g.path.remove();
      store.strokes.set(s.id,s);canvasHistoryPush(hist,[canvasChangeCreate('s',s)]);saveSoon();syncPage(g.pg);
    }
    refreshUndo();
  };
  const centroid=()=>{let x=0,y=0;for(const t of touches.values()){x+=t.x;y+=t.y}return{x:x/touches.size,y:y/touches.size}};
  const onDown=e=>{
    if(!tool||!fullscreen)return;
    const svg=e.target.closest?.('.pdf-ink');
    if(e.pointerType==='pen')penUntil=performance.now()+PDF_INK_PEN_HOLD_MS;
    if(e.pointerType==='touch'){
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      // Two fingers (anywhere on the pages): no ink, they scroll; pinch-zoom is the viewer's own.
      if(touches.size>=2){endGesture(true);pan=centroid();e.preventDefault();return}
      if(performance.now()<penUntil){e.preventDefault();return}
    }else if(e.pointerType==='mouse'&&e.button!==0)return;
    if(!svg)return;
    const pg=+svg.dataset.page,p=point(svg,e);
    svg.setPointerCapture(e.pointerId);e.preventDefault();
    if(tool==='eraser'){
      gesture={pointerId:e.pointerId,svg,pg,erase:{partial:eraseMode()==='partial',before:[],created:new Map()}};
      eraseStep(p);return;
    }
    const color=colorOf(tool),path=pathFor({color,tool});
    svg.appendChild(path);
    gesture={pointerId:e.pointerId,svg,pg,tool,color,size:PDF_INK_SIZE[tool],sp:e.pointerType==='pen'?0:1,pts:[[p.x,p.y,e.pointerType==='pen'?canvasRound(e.pressure||.5,2):.5]],path,raf:0};
    drawLive(gesture);
  };
  const drawLive=g=>{g.path.setAttribute('d',canvasOutlinePath(HoliooPerfectFreehand.getStroke(g.pts,{...canvasStrokeOptions(g),last:false})))};
  const eraseStep=p=>{
    const g=gesture,{removed,added}=pdfInkEraseAt(store.strokes,g.erase,g.pg,p.x,p.y,PDF_INK_ERASER,uid);
    if(removed.length||added.length)syncPage(g.pg);
  };
  const onMove=e=>{
    if(e.pointerType==='pen')penUntil=performance.now()+PDF_INK_PEN_HOLD_MS;
    if(e.pointerType==='touch'&&touches.has(e.pointerId)){
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pan&&touches.size>=2){pan=centroid();e.preventDefault();return}   // two fingers: the viewer's pinch zooms and pans, the ink never scrolls
    }
    const g=gesture;if(!g||g.pointerId!==e.pointerId)return;
    e.preventDefault();
    if(g.erase){eraseStep(point(g.svg,e));return}
    const list=e.getCoalescedEvents?.(),events=list?.length?list:[e];
    for(const ev of events){
      const q=point(g.svg,ev),last=g.pts.at(-1);
      if(Math.hypot(q.x-last[0],q.y-last[1])>=PDF_INK_MIN_STEP)g.pts.push([q.x,q.y,ev.pointerType==='pen'?canvasRound(ev.pressure||.5,2):.5]);
    }
    if(!g.raf)g.raf=requestAnimationFrame(()=>{g.raf=0;drawLive(g)});
  };
  const onUp=e=>{
    touches.delete(e.pointerId);if(touches.size<2)pan=null;
    if(gesture?.pointerId===e.pointerId){e.preventDefault();endGesture(e.type==='pointercancel'&&!gesture.erase)}
  };
  // While a tool is picked the pages never scroll or bounce under one finger or the pencil: touch-action none on the
  // pages (styles.css) and, for browsers that still scroll, a cancelled touchmove. A lifted finger is always forgotten,
  // wherever it lifted (a stale finger would turn the next stroke into a two-finger scroll).
  const lock=e=>{if(tool&&fullscreen&&e.cancelable&&e.touches.length<2)e.preventDefault()};
  const forget=e=>{if(!e.touches.length){touches.clear();pan=null}};
  host.addEventListener('touchstart',lock,{passive:false});
  host.addEventListener('touchmove',lock,{passive:false});
  document.addEventListener('touchend',forget,true);document.addEventListener('touchcancel',forget,true);
  host.addEventListener('pointerdown',onDown);
  host.addEventListener('pointermove',onMove);
  host.addEventListener('pointerup',onUp);
  host.addEventListener('pointercancel',onUp);

  // ---- the toolbar (fullscreen only: styles.css hides it otherwise) ----
  const bar=document.createElement('div');
  bar.className='pdf-ink-bar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Annotations');
  const tb=(attrs,label,ic,dot='')=>`<button type="button" ${attrs} title="${label}" aria-label="${label}">${icon(ic,{size:20})}${dot}</button>`;
  const dot='<i class="pdf-ink-dot"></i>';
  bar.innerHTML=`${tb('data-ink="highlighter" aria-pressed="false"','Surligneur (maintenir pour la couleur)','highlighter',dot)}${tb('data-ink="pen" aria-pressed="false"','Stylo (maintenir pour la couleur)','penLine',dot)}${tb('data-ink="eraser" aria-pressed="false"','Gomme','eraser')}
    <span class="pdf-ink-sep"></span>${tb('data-ink-undo disabled','Annuler','undo')}
    <div class="pdf-ink-pop" role="group" aria-label="Couleur" hidden></div>
    <div class="pdf-ink-fly" role="group" aria-label="Mode de la gomme" hidden>
      <button type="button" data-ink-mode="stroke" title="Trait entier : efface le trait touché" aria-label="Trait entier">${icon('eraser',{size:18})}<span>Trait entier</span></button>
      <button type="button" data-ink-mode="partial" title="Partielle : n’efface que la partie touchée" aria-label="Partielle">${icon('scissors',{size:18})}<span>Partielle</span></button>
    </div>`;
  frame.appendChild(bar);
  const pop=bar.querySelector('.pdf-ink-pop');
  const undoBtn=bar.querySelector('[data-ink-undo]'),fly=bar.querySelector('.pdf-ink-fly');
  function refreshUndo(){undoBtn.disabled=!hist.undo.length}
  function refreshBar(){
    bar.querySelectorAll('[data-ink]').forEach(b=>{const on=b.dataset.ink===tool;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
    for(const t of['pen','highlighter'])bar.querySelector(`[data-ink="${t}"]`).style.setProperty('--ink-c',colorOf(t));
    fly.hidden=tool!=='eraser';
    if(pop.dataset.for!==tool)closePop();
    fly.querySelectorAll('[data-ink-mode]').forEach(b=>b.classList.toggle('active',b.dataset.inkMode===eraseMode()));
    viewer.classList.toggle('ink-on',!!tool&&fullscreen);
  }
  function closePop(){pop.hidden=true;pop.dataset.for=''}
  const openPop=btn=>{
    const t=btn.dataset.ink,cur=colorOf(t);
    pop.innerHTML=PDF_INK_COLORS[t].map((c,i)=>`<button type="button" data-ink-color="${i}" class="${c===cur?'active':''}" style="--c:${c}" aria-label="Couleur ${i+1}"></button>`).join('');
    pop.dataset.for=t;pop.style.top=`${btn.offsetTop}px`;pop.hidden=false;
  };
  // Long-press on the pen or highlighter that is already picked → its colours (a plain tap on it does the same); a tap on another tool picks it.
  let hold=null,held=false;
  bar.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-ink]');held=false;clearTimeout(hold);
    if(!b||b.dataset.ink!==tool||tool==='eraser')return;
    hold=setTimeout(()=>{held=true;openPop(b)},PDF_INK_LONG_PRESS_MS);
  });
  for(const t of['pointerup','pointercancel','pointerleave'])bar.addEventListener(t,()=>clearTimeout(hold));
  bar.addEventListener('contextmenu',e=>e.preventDefault());
  const setTool=t=>{endGesture(true);tool=t;refreshBar()};
  bar.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.inkColor!==undefined){state.settings.pdfInkColor={...state.settings.pdfInkColor,[pop.dataset.for]:+b.dataset.inkColor};saveState();closePop();return refreshBar()}
    if(held){held=false;return}
    if(b.dataset.ink){
      // Tap on the pen / highlighter already picked → its colours (a second tap closes them); eraser again = back to plain reading.
      if(tool===b.dataset.ink&&tool!=='eraser'){if(pop.dataset.for===tool)closePop();else openPop(b);return}
      return setTool(tool===b.dataset.ink?null:b.dataset.ink);
    }
    if(b.dataset.inkMode){state.settings.pdfInkErase=b.dataset.inkMode;saveState();return refreshBar()}
    if(b.hasAttribute('data-ink-undo')){
      endGesture(true);
      if(canvasUndo(hist,store)){syncAll();saveSoon();refreshUndo()}
    }
  });
  refreshBar();refreshUndo();

  return{
    // Entering or leaving fullscreen; leaving puts the reader back to plain reading.
    fullscreen(on){fullscreen=on;if(!on){endGesture(true);tool=null}refreshBar()},
    // For the viewer's idle hiding: is a tool picked, and is the user in the middle of something (a stroke, the colour picker)?
    hasTool:()=>!!tool&&fullscreen,
    busy:()=>!!gesture||!pop.hidden,
    flush:save,
    destroy(){host.removeEventListener('touchstart',lock);host.removeEventListener('touchmove',lock);document.removeEventListener('touchend',forget,true);document.removeEventListener('touchcancel',forget,true);host.removeEventListener('pointerdown',onDown);host.removeEventListener('pointermove',onMove);host.removeEventListener('pointerup',onUp);host.removeEventListener('pointercancel',onUp);bar.remove();viewer.classList.remove('ink-on')}
  };
}

if(typeof module!=='undefined')Object.assign(module.exports,{pdfInkKey,pdfInkStrokes,pdfInkEraseAt,pdfInkEraseChanges});
