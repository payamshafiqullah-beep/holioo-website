'use strict';
// Session notebook: vector ink anchored to photo/blank blocks.
// Data lives in IndexedDB `kv` as ink:<session id>; a copy goes to Google Drive (notebookDriveDocuments).

let notebookSelectedBlockId=null;
let notebookRuntime=null;

const INK_TOOLS={
  'pen-black':{label:'Noir',color:'#111827',size:4,opacity:1,kind:'pen'},
  'pen-blue':{label:'Bleu',color:'#2563EB',size:4,opacity:1,kind:'pen'},
  'pen-red':{label:'Rouge',color:'#E5484D',size:4,opacity:1,kind:'pen'},
  highlighter:{label:'Surligneur',color:'#FACC15',size:15,opacity:.35,kind:'highlighter'}
};

const DEFAULT_INK_DOC=()=>({version:1,sessionId:'',blocks:[],strokes:[],updatedAt:Date.now()});
const inkKey=sessionId=>`ink:${sessionId}`;
const visibleInkBlocks=doc=>(doc.blocks||[]).filter(b=>!b.deleted);
const visibleInkStrokes=doc=>(doc.strokes||[]).filter(s=>!s.deleted);

// Layout only (narrow / wide page): keep in sync with the 720px notebook/shell media queries in styles.css.
const NOTEBOOK_BREAKPOINT=720;
// Writing depends on the device, not on the window: a tablet or a computer (shortest side of its screen at least
// 600 px) writes even in a narrow window (iPad Split View); a phone never does, even turned sideways.
const NOTEBOOK_WRITE_MIN_SIDE=600;
const notebookHistory=new Map();
const notebookHistoryFor=id=>{let h=notebookHistory.get(id);if(!h)notebookHistory.set(id,h={undo:[],redo:[]});return h};
// A page is an A4 sheet whatever the screen, so strokes (stored 0..1) land in the same place on every device.
const NOTEBOOK_PAGE_RATIO=297/210;   // page height / width
const INK_REF_WIDTH=900;             // page width (px) at which a stroke size is expressed
const FRAME_MIN_W=.12;
const PEN_HOLD_MS=800;               // after the last pen event, touches are still treated as a resting palm
const defaultFrame=()=>({x:.04,y:.03,w:.5});
const frameOf=b=>({...(b.frame||defaultFrame()),r:b.ratio||null});   // photo frame on its page, fractions of the page; r = photo width / height
const frameRatio=f=>f.r||.75;
function clampFrame(f){
  const r=frameRatio(f),w=Math.max(FRAME_MIN_W,Math.min(f.w,1,r*NOTEBOOK_PAGE_RATIO)),h=w/(r*NOTEBOOK_PAGE_RATIO);
  return{x:Math.max(0,Math.min(f.x,1-w)),y:Math.max(0,Math.min(f.y,1-h)),w,r:f.r};
}
function applyFrameVars(el,f){
  el.style.setProperty('--fx',f.x);el.style.setProperty('--fy',f.y);el.style.setProperty('--fw',f.w);el.style.setProperty('--fr',frameRatio(f));
}
const phoneQuery=()=>matchMedia(`(max-width: ${NOTEBOOK_BREAKPOINT-1}px)`);
function notebookCanEdit(){return Math.min(screen.width,screen.height)>=NOTEBOOK_WRITE_MIN_SIDE}
function normalizePoint(x,y,rect){return[Math.max(0,Math.min(1,x/rect.width)),Math.max(0,Math.min(1,y/rect.height))]}
function strokeColor(tool){return INK_TOOLS[tool]?.color||INK_TOOLS['pen-black'].color}
function strokeSize(tool){return INK_TOOLS[tool]?.size||INK_TOOLS['pen-black'].size}

// Three widths (thin / medium / thick) per kind of tool, in px on a 900px-wide page. The choice is remembered on the
// device (state.settings.inkSizes) and stored in each stroke, so changing it never alters what is already written.
const INK_SIZES={pen:[2.5,4,7],highlighter:[10,15,24],eraser:[10,18,32]};
const ERASER_TOLERANCE_PER_PX=1/720;   // eraser reach (0..1 of the page) per px of eraser size: 18px = .025
const inkKind=tool=>tool==='eraser'?'eraser':INK_TOOLS[tool]?.kind||'pen';
const inkSizeIndex=kind=>{const i=state.settings.inkSizes?.[kind];return i>=0&&i<INK_SIZES[kind].length?i:1};
const inkSize=tool=>INK_SIZES[inkKind(tool)][inkSizeIndex(inkKind(tool))];
function setInkSizeIndex(kind,i){state.settings.inkSizes={...state.settings.inkSizes,[kind]:i};saveState()}
function strokeOpacity(tool){return INK_TOOLS[tool]?.opacity??1}

async function loadNotebookDoc(session){
  let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
  const doc={...DEFAULT_INK_DOC(),...(row?.doc||{}),sessionId:session.id};
  doc.blocks=Array.isArray(doc.blocks)?doc.blocks:[];
  doc.strokes=Array.isArray(doc.strokes)?doc.strokes:[];
  syncNotebookBlocks(doc,session);
  return doc;
}

function syncNotebookBlocks(doc,session){
  const byId=new Map(doc.blocks.map(b=>[b.id,b]));
  const photoIds=Array.isArray(session.photoIds)?session.photoIds:[];
  for(const block of doc.blocks){
    if(block.type==='photo'&&!block.deleted&&!photoIds.includes(block.photoId||block.id)&&(doc.strokes||[]).some(st=>!st.deleted&&st.blockId===block.id)){
      Object.assign(block,{type:'blank',photoId:null,frame:undefined,ratio:undefined,updatedAt:Date.now()});   // keep the writing
    }
  }
  const next=[];
  for(const photoId of photoIds){
    const found=byId.get(photoId);
    next.push(found?{...found,type:'photo',photoId,deleted:false}:{id:photoId,type:'photo',photoId,createdAt:Date.now(),updatedAt:Date.now(),deleted:false});
  }
  for(const block of doc.blocks){
    if(block.type==='blank'&&!block.deleted)next.push(block);
  }
  for(const block of doc.blocks){
    if(block.deleted||block.type==='photo'&&!photoIds.includes(block.photoId||block.id)){
      if(!next.some(b=>b.id===block.id))next.push({...block,deleted:true,updatedAt:block.updatedAt||Date.now()});
    }
  }
  doc.blocks=next;
}

let notebookDriveDirty=false;   // handwriting saved since the last Drive sync was asked for
async function saveNotebookDoc(doc){
  doc.updatedAt=Date.now();
  await DB.put('kv',{key:inkKey(doc.sessionId),doc});
  notebookDriveDirty=true;
}

function scheduleNotebookSave(doc){
  clearTimeout(scheduleNotebookSave.t);
  scheduleNotebookSave.doc=doc;
  scheduleNotebookSave.t=setTimeout(()=>{scheduleNotebookSave.doc=null;saveNotebookDoc(doc).catch(console.warn)},350);
}

// Leaving the session screen or the app: the last strokes are saved now, then copied to Drive.
async function flushNotebook(){
  const doc=scheduleNotebookSave.doc;
  if(doc){clearTimeout(scheduleNotebookSave.t);scheduleNotebookSave.doc=null;await saveNotebookDoc(doc).catch(console.warn)}
  if(notebookDriveDirty){notebookDriveDirty=false;queueSync('notebook')}
}

// Removes the ink of deleted sessions; the undo history is dropped only once the records are gone.
// Their copy in Google Drive stays there, like their photos.
async function purgeSessionInk(sessionIds){
  if(sessionIds.includes(scheduleNotebookSave.doc?.sessionId)){clearTimeout(scheduleNotebookSave.t);scheduleNotebookSave.doc=null}
  if(sessionIds.includes(notebookRuntime?.doc.sessionId))cleanupNotebookRuntime();
  await Promise.all(sessionIds.flatMap(id=>[DB.del('kv',inkKey(id)),DB.del('kv',`drive:${inkKey(id)}`)]));
  sessionIds.forEach(id=>notebookHistory.delete(id));
}

function addBlankNotebookBlock(doc,afterId=notebookSelectedBlockId){
  const block={id:`blank:${uid()}`,type:'blank',photoId:null,createdAt:Date.now(),updatedAt:Date.now(),deleted:false};
  const blocks=visibleInkBlocks(doc);
  const idx=afterId?blocks.findIndex(b=>b.id===afterId):-1;
  const fullIdx=idx>=0?doc.blocks.findIndex(b=>b.id===blocks[idx].id):-1;
  doc.blocks.splice(fullIdx>=0?fullIdx+1:doc.blocks.length,0,block);
  notebookSelectedBlockId=block.id;
  scheduleNotebookSave(doc);
  return block;
}

function ensureNotebookSelection(doc){
  const blocks=visibleInkBlocks(doc);
  if(!blocks.some(b=>b.id===notebookSelectedBlockId))notebookSelectedBlockId=blocks[0]?.id||null;
}

async function renderSessionNotebook({course,section,session}){
  const prev=notebookRuntime;
  cleanupNotebookRuntime();
  const doc=prev&&prev.doc.sessionId===session.id?(syncNotebookBlocks(prev.doc,session),prev.doc):await loadNotebookDoc(session);
  if(!visibleInkBlocks(doc).length){
    addBlankNotebookBlock(doc,null);
    await saveNotebookDoc(doc);
  }
  ensureNotebookSelection(doc);
  const editable=notebookCanEdit();
  const blocks=visibleInkBlocks(doc);
  const html=[];
  for(const block of blocks){
    let media='';
    if(block.type==='photo'){
      const row=await DB.get('photos',block.photoId||block.id);
      const blob=photoBlob(row);
      const url=blob?thumbUrl(blob):'';
      media=url?`<img src="${url}" alt="Photo de cours" draggable="false" decoding="async">`:`<div class="notebook-missing">${icon('image',{size:28})}<span>Photo indisponible sur cet appareil</span></div>`;
    }else{
      media=`<div class="notebook-blank-label">${icon('pencil',{size:22})}<span>Page blanche</span></div>`;
    }
    const f=clampFrame(frameOf(block));
    html.push(`<article class="notebook-block${block.id===notebookSelectedBlockId?' selected':''} ${block.type==='blank'?'blank':''}" data-block-id="${esc(block.id)}" style="--fx:${f.x};--fy:${f.y};--fw:${f.w};--fr:${frameRatio(f)}">
      <div class="notebook-margin" aria-hidden="true"></div>
      <div class="notebook-photo">${media}<span class="notebook-handle" aria-hidden="true"></span><span class="notebook-delete" aria-hidden="true">${icon('x',{size:16,stroke:2.6})}</span></div>
      <canvas class="notebook-canvas committed" aria-hidden="true"></canvas>
      <canvas class="notebook-canvas live" aria-label="Couche d’écriture manuscrite"></canvas>
    </article>`);
  }
  const host=byId('sessionNotebook');
  if(!host)return;
  host.innerHTML=`${editable?'':Notice('L’écriture manuscrite est disponible sur tablette ou ordinateur.','sky')}${html.join('')}`;
  setupNotebookRuntime(doc,{course,section,session,editable});
}

function cleanupNotebookRuntime(){
  if(!notebookRuntime)return;
  window.removeEventListener('resize',notebookRuntime.resize);
  notebookRuntime.mql?.removeEventListener?.('change',notebookRuntime.onMedia);
  notebookRuntime.guards.forEach(([type,fn,opts])=>document.removeEventListener(type,fn,opts));
  clearTimeout(notebookRuntime.penTimer);
  clearTimeout(notebookRuntime.press?.timer);
  notebookRuntime=null;
}

function setupNotebookRuntime(doc,{course,section,session,editable}){
  const root=byId('sessionNotebook');
  if(!root)return;
  const rt=notebookRuntime={doc,course,section,session,editable,tool:'pen-black',ruler:false,hist:notebookHistoryFor(session.id),drawing:null,drag:null,press:null,editId:null,resize:null,root,mql:phoneQuery(),penUntil:0,penTimer:0,guards:[]};
  rt.resize=()=>requestAnimationFrame(()=>{if(rt.root.isConnected&&notebookCanEdit()!==rt.editable)rt.onMedia();else redrawNotebook(rt)});
  rt.onMedia=()=>{if(rt.root.isConnected&&notebookCanEdit()!==rt.editable)renderSessionNotebook({course,section,session})};
  window.addEventListener('resize',rt.resize);
  rt.mql?.addEventListener?.('change',rt.onMedia);
  root.classList.toggle('finger-draw',!!(editable&&state.settings.drawWithFinger));
  if(editable)setupPalmRejection(rt);
  root.querySelectorAll('.notebook-block').forEach(block=>{
    block.onclick=()=>selectNotebookBlock(block.dataset.blockId);
    const img=block.querySelector('img'),obj=doc.blocks.find(b=>b.id===block.dataset.blockId);
    const learnRatio=()=>{
      if(obj&&img.naturalHeight&&!obj.ratio){obj.ratio=img.naturalWidth/img.naturalHeight;applyFrameVars(block,clampFrame(frameOf(obj)));scheduleNotebookSave(doc)}
      rt.resize();
    };
    if(img)img.complete&&img.naturalWidth?learnRatio():img.addEventListener('load',learnRatio,{once:true});
    const live=block.querySelector('.notebook-canvas.live');
    if(editable){
      live.addEventListener('pointerdown',e=>notebookPointerDown(e,rt,block));
      live.addEventListener('pointermove',e=>notebookPointerMove(e,rt,block));
      live.addEventListener('pointerup',e=>notebookPointerUp(e,rt,block));
      live.addEventListener('pointercancel',e=>notebookPointerCancel(e,rt,block));
    }
  });
  bindNotebookToolbar(rt);
  rt.resize();
}

// Palm rejection: while a pen is at work (hovering or writing) and shortly after, touches must not scroll the page
// or draw. The pen itself never scrolls either. Fingers scroll again once the pen has been away for a moment.
function setupPalmRejection(rt){
  const penBusy=()=>!!rt.drawing||!!rt.drag||performance.now()<rt.penUntil;
  const onPen=e=>{
    if(e.pointerType!=='pen'||!rt.root.isConnected)return;
    rt.penUntil=performance.now()+PEN_HOLD_MS;
    rt.root.classList.add('pen-active');
    clearTimeout(rt.penTimer);
    rt.penTimer=setTimeout(()=>rt.root.classList.remove('pen-active'),PEN_HOLD_MS);
  };
  const onTouch=e=>{
    if(!rt.root.isConnected||!e.cancelable)return;
    if(penBusy()||[...e.changedTouches].some(t=>t.touchType==='stylus'))e.preventDefault();
  };
  const add=(type,fn,opts)=>{document.addEventListener(type,fn,opts);rt.guards.push([type,fn,opts])};
  for(const type of['pointerdown','pointermove','pointerup'])add(type,onPen,true);
  for(const type of['touchstart','touchmove'])add(type,onTouch,{capture:true,passive:false});
}

function selectNotebookBlock(id){
  notebookSelectedBlockId=id;
  document.querySelectorAll('.notebook-block').forEach(b=>b.classList.toggle('selected',b.dataset.blockId===id));
}

function bindNotebookToolbar(rt){
  const bar=byId('notebookToolbar');if(!bar)return;
  const toolButtons=[...bar.querySelectorAll('[data-ink-tool],[data-ink-eraser]')];
  const sizeButtons=[...bar.querySelectorAll('[data-ink-size]')];
  const showSize=()=>sizeButtons.forEach(b=>b.classList.toggle('active',+b.dataset.inkSize===inkSizeIndex(inkKind(rt.tool))));
  const pick=(tool,btn)=>{
    rt.tool=tool;
    toolButtons.forEach(b=>b.classList.toggle('active',b===btn));
    showSize();
    setEditing(rt,null);
  };
  sizeButtons.forEach(btn=>btn.onclick=()=>{setInkSizeIndex(inkKind(rt.tool),+btn.dataset.inkSize);showSize()});
  showSize();
  bar.querySelectorAll('[data-ink-tool]').forEach(btn=>btn.onclick=()=>pick(btn.dataset.inkTool,btn));
  bar.querySelector('[data-ink-eraser]')?.addEventListener('click',e=>pick('eraser',e.currentTarget));
  bar.querySelector('[data-ink-ruler]')?.addEventListener('click',e=>{
    rt.ruler=!rt.ruler;
    e.currentTarget.classList.toggle('active',rt.ruler);
  });
  bar.querySelector('[data-ink-undo]')?.addEventListener('click',()=>undoNotebook(rt));
  bar.querySelector('[data-ink-redo]')?.addEventListener('click',()=>redoNotebook(rt));
  updateUndoRedoButtons(rt);
}

function isDrawablePointer(e,rt){
  if(e.pointerType==='pen')return true;
  if(state.settings.drawWithFinger&&e.pointerType==='touch')return performance.now()>=rt.penUntil;   // a palm next to the pen is not a finger
  return false;
}

const LONG_PRESS_MS=500;
const LONG_PRESS_SLOP=10;   // px the pointer may drift during the hold

const blockObj=(rt,block)=>rt.doc.blocks.find(b=>b.id===block.dataset.blockId);
function setEditing(rt,id){
  rt.editId=id;
  document.querySelectorAll('.notebook-block').forEach(b=>b.classList.toggle('editing',b.dataset.blockId===id));
}
const nearEl=(e,el,r)=>{
  const b=el?.getBoundingClientRect();
  return!!b&&Math.hypot(e.clientX-(b.left+b.width/2),e.clientY-(b.top+b.height/2))<=r;
};
// What is under the pointer on a photo: 'delete' (the cross), 'corner' (resize handle), 'inside', or null.
function photoHit(e,block,obj){
  const photo=obj?.type==='photo'?block.querySelector('.notebook-photo'):null;
  if(!photo)return null;
  if(block.classList.contains('editing')&&nearEl(e,photo.querySelector('.notebook-delete'),26))return'delete';
  if(nearEl(e,photo.querySelector('.notebook-handle'),34))return'corner';
  const pr=photo.getBoundingClientRect();
  return e.clientX>=pr.left&&e.clientX<=pr.right&&e.clientY>=pr.top&&e.clientY<=pr.bottom?'inside':null;
}

function notebookPointerDown(e,rt,block){
  if(!rt.editable)return;
  const obj=blockObj(rt,block),hit=photoHit(e,block,obj);
  if(rt.editId){
    if(rt.editId===obj?.id&&hit){
      e.preventDefault();
      if(hit==='delete')confirmDeletePhoto(obj.photoId||obj.id);
      else beginFrameDrag(rt,block,obj,hit==='corner'?'resize':'move',e.clientX,e.clientY,e.pointerId,e.currentTarget);
      return;
    }
    setEditing(rt,null);   // a tap anywhere else ends the photo editing
  }
  if(hit){
    // Holding the pen or a finger on a photo for half a second lets you move and resize it.
    const press={id:e.pointerId,x:e.clientX,y:e.clientY,hit,timer:0};
    press.timer=setTimeout(()=>{
      if(rt.press!==press)return;
      rt.press=null;
      if(rt.drawing){clearLiveCanvas(rt.drawing.block);rt.drawing.block.classList.remove('inking');rt.drawing=null}
      setEditing(rt,obj.id);selectNotebookBlock(obj.id);
      beginFrameDrag(rt,block,obj,hit==='corner'?'resize':'move',press.x,press.y,press.id,live);
    },LONG_PRESS_MS);
    rt.press=press;
    const live=e.currentTarget;
    live.setPointerCapture(e.pointerId);
  }
  if(!isDrawablePointer(e,rt))return;
  const rect=block.getBoundingClientRect();
  const pt=normalizePoint(e.clientX-rect.left,e.clientY-rect.top,rect);
  rt.drawing={block,blockId:block.dataset.blockId,points:[[pt[0],pt[1],e.pressure||.5]],pointerId:e.pointerId,tool:rt.tool,size:inkSize(rt.tool)};
  block.classList.add('inking');
  e.currentTarget.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function cancelPress(rt,e){
  const pr=rt.press;
  if(pr&&(!e||pr.id===e.pointerId)){clearTimeout(pr.timer);rt.press=null}
}

// Drag the photo, or its bottom-right corner to resize it (the ratio is kept).
function beginFrameDrag(rt,block,obj,mode,x,y,pointerId,canvas){
  rt.drag={block,obj,mode,sx:x,sy:y,rect:block.getBoundingClientRect(),before:frameOf(obj),had:obj.frame,pointerId,moved:false};
  canvas.setPointerCapture?.(pointerId);
}

function moveFrameDrag(e,g){
  const dx=(e.clientX-g.sx)/g.rect.width,dy=(e.clientY-g.sy)/g.rect.height,b=g.before;
  const {x,y,w}=clampFrame(g.mode==='move'?{...b,x:b.x+dx,y:b.y+dy}:{...b,w:b.w+dx});
  g.obj.frame={x,y,w};g.moved=true;
  applyFrameVars(g.block,clampFrame(frameOf(g.obj)));
}

function notebookPointerMove(e,rt,block){
  const pr=rt.press;
  if(pr&&pr.id===e.pointerId&&Math.hypot(e.clientX-pr.x,e.clientY-pr.y)>LONG_PRESS_SLOP)cancelPress(rt,e);
  const g=rt.drag;
  if(g){
    if(g.pointerId===e.pointerId&&g.block===block){moveFrameDrag(e,g);e.preventDefault()}
    return;
  }
  const d=rt.drawing;
  if(!d||d.pointerId!==e.pointerId||d.block!==block)return;
  const coalesced=e.getCoalescedEvents?.(),events=coalesced?.length?coalesced:[e];
  const rect=block.getBoundingClientRect();
  for(const ev of events){
    const pt=normalizePoint(ev.clientX-rect.left,ev.clientY-rect.top,rect);
    const last=d.points.at(-1);
    if(!last||Math.hypot(pt[0]-last[0],pt[1]-last[1])>.001)d.points.push([pt[0],pt[1],ev.pressure||e.pressure||.5]);
  }
  drawLiveNotebookStroke(d);
  e.preventDefault();
}

function notebookPointerUp(e,rt,block){
  cancelPress(rt,e);
  const g=rt.drag;
  if(g){
    if(g.pointerId!==e.pointerId)return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    rt.drag=null;
    if(g.moved){
      rt.hist.undo.push({type:'frame',blockId:g.obj.id,before:g.had?{...g.had}:null,after:{...g.obj.frame}});rt.hist.redo=[];
      updateUndoRedoButtons(rt);scheduleNotebookSave(rt.doc);
    }
    e.preventDefault();
    return;
  }
  const d=rt.drawing;
  if(!d||d.pointerId!==e.pointerId||d.block!==block)return;
  finishNotebookStroke(rt,d);
  e.currentTarget.releasePointerCapture?.(e.pointerId);
  block.classList.remove('inking');
  rt.drawing=null;
  e.preventDefault();
}

function notebookPointerCancel(e,rt,block){
  cancelPress(rt,e);
  const g=rt.drag;
  if(g){
    if(g.pointerId!==e.pointerId)return;
    g.obj.frame=g.had;applyFrameVars(g.block,clampFrame(frameOf(g.obj)));rt.drag=null;
    return;
  }
  const d=rt.drawing;
  if(!d||d.pointerId!==e.pointerId)return;
  clearLiveCanvas(block);
  block.classList.remove('inking');
  rt.drawing=null;
}

function finishNotebookStroke(rt,d){
  clearLiveCanvas(d.block);
  if(d.points.length<2)return;
  if(d.tool==='eraser'){
    const deleted=eraseNotebookStrokes(rt.doc,d.blockId,d.points,d.size*ERASER_TOLERANCE_PER_PX);
    if(deleted.length){rt.hist.undo.push({type:'delete',ids:deleted});rt.hist.redo=[]}
  }else{
    const points=rt.ruler?snapRulerPoints(d.points):d.points;
    const stroke={id:uid(),sessionId:rt.doc.sessionId,blockId:d.blockId,tool:d.tool,size:d.size,points,createdAt:Date.now(),updatedAt:Date.now(),deleted:false};
    rt.doc.strokes.push(stroke);
    rt.hist.undo.push({type:'add',ids:[stroke.id]});rt.hist.redo=[];
  }
  updateUndoRedoButtons(rt);
  scheduleNotebookSave(rt.doc);
  redrawNotebookBlock(rt,d.blockId);
}

function snapRulerPoints(points){
  const start=points[0],end=points.at(-1);
  const dx=end[0]-start[0],dy=end[1]-start[1];
  const len=Math.hypot(dx,dy);
  if(!len)return points;
  let angle=Math.atan2(dy,dx),deg=angle*180/Math.PI;
  const snaps=[-180,-135,-90,-45,0,45,90,135,180];
  let best=deg,delta=Infinity;
  for(const s of snaps){
    const d=Math.abs((((deg-s)+180)%360)-180);
    if(d<delta){delta=d;best=s}
  }
  if(delta<=7)angle=best*Math.PI/180;
  const next=[Math.max(0,Math.min(1,start[0]+Math.cos(angle)*len)),Math.max(0,Math.min(1,start[1]+Math.sin(angle)*len)),end[2]||.5];
  return[start,next];
}

function eraseNotebookStrokes(doc,blockId,points,tolerance=.025){
  const deleted=[];
  const active=visibleInkStrokes(doc).filter(s=>s.blockId===blockId);
  for(const stroke of active){
    if(strokeTouchesPath(stroke.points,points,tolerance)){
      stroke.deleted=true;
      stroke.updatedAt=Date.now();
      deleted.push(stroke.id);
    }
  }
  return deleted;
}

function strokeTouchesPath(a,b,tolerance){
  for(let i=1;i<a.length;i++){
    for(let j=1;j<b.length;j++){
      if(segmentDistance(a[i-1],a[i],b[j-1],b[j])<=tolerance)return true;
    }
  }
  for(const p of a)for(const q of b)if(Math.hypot(p[0]-q[0],p[1]-q[1])<=tolerance)return true;
  return false;
}

function pointSegmentDistance(p,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1];
  const len=vx*vx+vy*vy;
  const t=len?Math.max(0,Math.min(1,(wx*vx+wy*vy)/len)):0;
  return Math.hypot(p[0]-(a[0]+vx*t),p[1]-(a[1]+vy*t));
}

function ccw(a,b,c){return(c[1]-a[1])*(b[0]-a[0])>(b[1]-a[1])*(c[0]-a[0])}
function segmentsIntersect(a,b,c,d){return ccw(a,c,d)!==ccw(b,c,d)&&ccw(a,b,c)!==ccw(a,b,d)}
function segmentDistance(a,b,c,d){
  if(segmentsIntersect(a,b,c,d))return 0;
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}

function undoNotebook(rt){
  const op=rt.hist.undo.pop();if(!op)return;
  applyNotebookOp(rt.doc,op,true);
  rt.hist.redo.push(op);
  updateUndoRedoButtons(rt);scheduleNotebookSave(rt.doc);redrawNotebook(rt);
}

function redoNotebook(rt){
  const op=rt.hist.redo.pop();if(!op)return;
  applyNotebookOp(rt.doc,op,false);
  rt.hist.undo.push(op);
  updateUndoRedoButtons(rt);scheduleNotebookSave(rt.doc);redrawNotebook(rt);
}

function applyNotebookOp(doc,op,undo){
  if(op.type==='frame'){
    const b=doc.blocks.find(x=>x.id===op.blockId),f=undo?op.before:op.after;
    if(b)b.frame=f?{...f}:undefined;
    return;
  }
  const ids=new Set(op.ids);
  for(const stroke of doc.strokes){
    if(!ids.has(stroke.id))continue;
    stroke.deleted=op.type==='add'?undo:!undo;
    stroke.updatedAt=Date.now();
  }
}

function updateUndoRedoButtons(rt){
  byId('inkUndo')?.toggleAttribute('disabled',!rt.hist.undo.length);
  byId('inkRedo')?.toggleAttribute('disabled',!rt.hist.redo.length);
}

function setupCanvas(canvas,block){
  const rect=block.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`;
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);
  return{ctx,w:rect.width,h:rect.height};
}

function redrawNotebook(rt){
  document.querySelectorAll('.notebook-block').forEach(block=>{
    const obj=rt.doc.blocks.find(b=>b.id===block.dataset.blockId);
    if(obj)applyFrameVars(block,clampFrame(frameOf(obj)));
    const committed=block.querySelector('.notebook-canvas.committed');
    const live=block.querySelector('.notebook-canvas.live');
    setupCanvas(committed,block);setupCanvas(live,block);
    drawCommittedBlock(rt.doc,block);
  });
}

function redrawNotebookBlock(rt,blockId){
  const block=[...document.querySelectorAll('.notebook-block')].find(b=>b.dataset.blockId===blockId);
  if(!block)return;
  setupCanvas(block.querySelector('.notebook-canvas.committed'),block);
  drawCommittedBlock(rt.doc,block);
}

function drawCommittedBlock(doc,block){
  const canvas=block.querySelector('.notebook-canvas.committed');
  const {ctx,w,h}=setupCanvas(canvas,block);
  const strokes=visibleInkStrokes(doc).filter(s=>s.blockId===block.dataset.blockId);
  for(const stroke of strokes.filter(s=>s.tool==='highlighter'))drawStroke(ctx,stroke,w,h);
  for(const stroke of strokes.filter(s=>s.tool!=='highlighter'))drawStroke(ctx,stroke,w,h);
}

function drawLiveNotebookStroke(d){
  const canvas=d.block.querySelector('.notebook-canvas.live');
  const {ctx,w,h}=setupCanvas(canvas,d.block);
  if(d.tool==='eraser'){
    ctx.strokeStyle='rgba(229,72,107,.8)';
    ctx.lineWidth=d.size*w/INK_REF_WIDTH;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();
    d.points.forEach((p,i)=>{const x=p[0]*w,y=p[1]*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
    ctx.stroke();
    return;
  }
  drawStroke(ctx,{tool:d.tool,size:d.size,points:notebookRuntime?.ruler?snapRulerPoints(d.points):d.points},w,h);
}

function clearLiveCanvas(block){
  const canvas=block.querySelector('.notebook-canvas.live');if(!canvas)return;
  setupCanvas(canvas,block);
}

function drawStroke(ctx,stroke,w,h){
  if(!stroke.points?.length)return;
  const pts=stroke.points.map(p=>[p[0]*w,p[1]*h,p[2]??.5]);
  const outline=HoliooPerfectFreehand.getStroke(pts,{size:(stroke.size||strokeSize(stroke.tool))*w/INK_REF_WIDTH,thinning:.45,smoothing:.5,streamline:.45,simulatePressure:false,last:true});
  ctx.save();
  ctx.globalAlpha=strokeOpacity(stroke.tool);
  ctx.fillStyle=strokeColor(stroke.tool);
  ctx.beginPath();
  outline.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------- PDF export ----------

// One page of the notebook as a JPEG: ruled A4 sheet, photo at its frame, then the ink.
async function renderNotebookPageBlob(doc,block,photo){
  const W=1240,H=Math.round(W*NOTEBOOK_PAGE_RATIO);
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#E3E6F1';ctx.lineWidth=1;
  const step=W*.0355;   // the ruling of the on-screen page
  for(let y=step;y<H;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  if(block.type==='photo'&&photo){
    const bmp=await createImageBitmap(photo),f=clampFrame({...frameOf(block),r:block.ratio||bmp.width/bmp.height});
    ctx.drawImage(bmp,f.x*W,f.y*H,f.w*W,f.w*W/frameRatio(f));
    bmp.close?.();
  }
  const strokes=visibleInkStrokes(doc).filter(s=>s.blockId===block.id);
  for(const stroke of strokes.filter(s=>s.tool==='highlighter'))drawStroke(ctx,stroke,W,H);
  for(const stroke of strokes.filter(s=>s.tool!=='highlighter'))drawStroke(ctx,stroke,W,H);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
}

// Pages of a session that differ from the plain photo (handwriting, a moved photo, written blank pages), in notebook
// order: [{blockId, photoId|null, blob}]. Empty when the session has no notebook content.
// The notebook of a session as it is now: the open one, else the saved one (null when it was never opened).
async function notebookDocFor(session){
  if(notebookRuntime?.doc.sessionId===session.id)return notebookRuntime.doc;
  let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
  if(!row?.doc)return null;
  const doc={...DEFAULT_INK_DOC(),...row.doc,sessionId:session.id};
  doc.blocks=Array.isArray(doc.blocks)?doc.blocks:[];doc.strokes=Array.isArray(doc.strokes)?doc.strokes:[];
  syncNotebookBlocks(doc,session);
  return doc;
}

// Pages worth exporting: written pages, and photos whose frame was moved or resized (photo still on this device).
async function notebookExportablePages(doc){
  const out=[];
  for(const block of visibleInkBlocks(doc)){
    const strokes=visibleInkStrokes(doc).filter(s=>s.blockId===block.id);
    if(block.type==='blank'?!strokes.length:!strokes.length&&!block.frame)continue;
    let photo=null,row=null;
    if(block.type==='photo'){
      row=await DB.get('photos',block.photoId||block.id);
      photo=row?photoBlob(row):null;
      if(!photo)continue;
    }
    out.push({block,strokes,row,photo});
  }
  return out;
}

async function notebookExportPages(session){
  const doc=await notebookDocFor(session);if(!doc)return[];
  const out=[];
  for(const{block,photo}of await notebookExportablePages(doc))out.push({blockId:block.id,photoId:block.type==='photo'?(block.photoId||block.id):null,blob:await renderNotebookPageBlob(doc,block,photo)});
  return out;
}

// Google Drive copy (drive.js syncAll / pendingCount): in the session's folder, one image per page
// (Carnet-01.jpg…) and Carnet.json, the strokes themselves. A page is sent again only when what it shows changed.
const notebookHash=str=>{let h=0x811c9dc5;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),0x01000193);return(h>>>0).toString(36)};
async function notebookDriveDocuments(appState){
  const out=[];
  for(const course of appState.courses||[])for(const section of course.sections||[])for(const session of section.sessions||[]){
    let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
    if(!row?.doc)continue;
    const live=notebookRuntime?.doc.sessionId===session.id?notebookRuntime.doc:row.doc;
    out.push({id:inkKey(session.id),version:row.doc.updatedAt||0,empty:!(live.strokes||[]).some(s=>!s.deleted),folder:[course.name,section.name,session.title],parts:()=>notebookDriveParts({course,section,session})});
  }
  return out;
}
async function notebookDriveParts({course,section,session}){
  const doc=await notebookDocFor(session);
  if(!doc||!visibleInkStrokes(doc).length)return[];
  const pages=await notebookExportablePages(doc);
  const parts=pages.map(({block,strokes,row,photo},i)=>({
    name:`Carnet-${String(i+1).padStart(2,'0')}.jpg`,
    sig:notebookHash([block.type,row?.id||'',row?.editedAt||'',JSON.stringify(block.frame||null),block.ratio||'',strokes.map(st=>st.id).join(',')].join('|')),
    blob:()=>renderNotebookPageBlob(doc,block,photo)
  }));
  // Only what is drawn (no timestamps), so the same notebook always gives the same file.
  const data={app:'Holioo',kind:'notebook',version:1,course:course.name,section:section.name,session:session.title,
    pages:visibleInkBlocks(doc).map(({id,type,photoId,frame,ratio})=>({id,type,photoId,frame,ratio})),
    strokes:visibleInkStrokes(doc).map(({id,blockId,tool,size,points})=>({id,blockId,tool,size,points}))};
  const json=JSON.stringify(data);
  parts.push({name:'Carnet.json',sig:notebookHash(json),blob:()=>new Blob([json],{type:'application/json'})});
  return parts;
}

// Does the session hold handwriting? (the PDF builder lists such sessions even without photos)
async function sessionHasNotebookInk(session){
  let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
  return!!row?.doc?.strokes?.some(s=>!s.deleted);
}
