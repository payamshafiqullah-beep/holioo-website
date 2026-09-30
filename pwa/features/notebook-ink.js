'use strict';
// Session notebook: vector ink anchored to photo/blank blocks.
// Phase 1 is local-only. Data lives in IndexedDB `kv` as ink:<session id>.

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

// Keep in sync with the 720px notebook/shell media queries in styles.css.
const NOTEBOOK_BREAKPOINT=720;
const notebookHistory=new Map();
const notebookHistoryFor=id=>{let h=notebookHistory.get(id);if(!h)notebookHistory.set(id,h={undo:[],redo:[]});return h};
const phoneQuery=()=>matchMedia(`(max-width: ${NOTEBOOK_BREAKPOINT-1}px)`);
function isPhoneNotebook(){return phoneQuery().matches}
function notebookCanEdit(){return !isPhoneNotebook()}
function normalizePoint(x,y,rect){return[Math.max(0,Math.min(1,x/rect.width)),Math.max(0,Math.min(1,y/rect.height))]}
function strokeColor(tool){return INK_TOOLS[tool]?.color||INK_TOOLS['pen-black'].color}
function strokeSize(tool){return INK_TOOLS[tool]?.size||INK_TOOLS['pen-black'].size}
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

async function saveNotebookDoc(doc){
  doc.updatedAt=Date.now();
  await DB.put('kv',{key:inkKey(doc.sessionId),doc});
}

function scheduleNotebookSave(doc){
  clearTimeout(scheduleNotebookSave.t);
  scheduleNotebookSave.t=setTimeout(()=>saveNotebookDoc(doc).catch(console.warn),350);
}

// Removes the ink of deleted sessions; the undo history is dropped only once the records are gone.
async function purgeSessionInk(sessionIds){
  await Promise.all(sessionIds.map(id=>DB.del('kv',inkKey(id))));
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
    html.push(`<article class="notebook-block${block.id===notebookSelectedBlockId?' selected':''} ${block.type==='blank'?'blank':''}" data-block-id="${esc(block.id)}">
      <div class="notebook-photo">${media}</div>
      <div class="notebook-margin" aria-hidden="true"></div>
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
  notebookRuntime=null;
}

function setupNotebookRuntime(doc,{course,section,session,editable}){
  const root=byId('sessionNotebook');
  if(!root)return;
  const rt=notebookRuntime={doc,course,section,session,editable,tool:'pen-black',ruler:false,hist:notebookHistoryFor(session.id),drawing:null,resize:null,root,mql:phoneQuery()};
  rt.resize=()=>requestAnimationFrame(()=>redrawNotebook(rt));
  rt.onMedia=()=>{if(rt.root.isConnected&&notebookCanEdit()!==rt.editable)renderSessionNotebook({course,section,session})};
  window.addEventListener('resize',rt.resize);
  rt.mql?.addEventListener?.('change',rt.onMedia);
  root.classList.toggle('finger-draw',!!(editable&&state.settings.drawWithFinger));
  root.querySelectorAll('.notebook-block').forEach(block=>{
    block.onclick=()=>selectNotebookBlock(block.dataset.blockId);
    block.querySelector('img')?.addEventListener('load',rt.resize,{once:true});
    const live=block.querySelector('.notebook-canvas.live');
    if(editable){
      live.addEventListener('touchstart',e=>{if([...e.touches].some(t=>t.touchType==='stylus'))e.preventDefault()},{passive:false});
      live.addEventListener('pointerdown',e=>notebookPointerDown(e,rt,block));
      live.addEventListener('pointermove',e=>notebookPointerMove(e,rt,block));
      live.addEventListener('pointerup',e=>notebookPointerUp(e,rt,block));
      live.addEventListener('pointercancel',e=>notebookPointerCancel(e,rt,block));
    }
  });
  bindNotebookToolbar(rt);
  rt.resize();
}

function selectNotebookBlock(id){
  notebookSelectedBlockId=id;
  document.querySelectorAll('.notebook-block').forEach(b=>b.classList.toggle('selected',b.dataset.blockId===id));
}

function bindNotebookToolbar(rt){
  const bar=byId('notebookToolbar');if(!bar)return;
  bar.querySelectorAll('[data-ink-tool]').forEach(btn=>btn.onclick=()=>{
    rt.tool=btn.dataset.inkTool;
    bar.querySelectorAll('[data-ink-tool]').forEach(b=>b.classList.toggle('active',b===btn));
    bar.querySelector('[data-ink-eraser]')?.classList.remove('active');
  });
  bar.querySelector('[data-ink-eraser]')?.addEventListener('click',e=>{
    rt.tool='eraser';
    bar.querySelectorAll('[data-ink-tool]').forEach(b=>b.classList.remove('active'));
    e.currentTarget.classList.add('active');
  });
  bar.querySelector('[data-ink-ruler]')?.addEventListener('click',e=>{
    rt.ruler=!rt.ruler;
    e.currentTarget.classList.toggle('active',rt.ruler);
  });
  bar.querySelector('[data-ink-undo]')?.addEventListener('click',()=>undoNotebook(rt));
  bar.querySelector('[data-ink-redo]')?.addEventListener('click',()=>redoNotebook(rt));
  updateUndoRedoButtons(rt);
}

function isDrawablePointer(e){
  if(e.pointerType==='pen')return true;
  if(state.settings.drawWithFinger&&e.pointerType==='touch')return true;
  return false;
}

function notebookPointerDown(e,rt,block){
  if(!rt.editable||!isDrawablePointer(e))return;
  const rect=block.getBoundingClientRect();
  const pt=normalizePoint(e.clientX-rect.left,e.clientY-rect.top,rect);
  rt.drawing={block,blockId:block.dataset.blockId,points:[[pt[0],pt[1],e.pressure||.5]],pointerId:e.pointerId,tool:rt.tool};
  block.classList.add('inking');
  e.currentTarget.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function notebookPointerMove(e,rt,block){
  const d=rt.drawing;
  if(!d||d.pointerId!==e.pointerId||d.block!==block)return;
  const events=e.getCoalescedEvents?.()||[e];
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
  const d=rt.drawing;
  if(!d||d.pointerId!==e.pointerId||d.block!==block)return;
  finishNotebookStroke(rt,d);
  e.currentTarget.releasePointerCapture?.(e.pointerId);
  block.classList.remove('inking');
  rt.drawing=null;
  e.preventDefault();
}

function notebookPointerCancel(e,rt,block){
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
    const deleted=eraseNotebookStrokes(rt.doc,d.blockId,d.points);
    if(deleted.length){rt.hist.undo.push({type:'delete',ids:deleted});rt.hist.redo=[]}
  }else{
    const points=rt.ruler?snapRulerPoints(d.points):d.points;
    const stroke={id:uid(),sessionId:rt.doc.sessionId,blockId:d.blockId,tool:d.tool,points,createdAt:Date.now(),updatedAt:Date.now(),deleted:false};
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

function eraseNotebookStrokes(doc,blockId,points){
  const deleted=[];
  const active=visibleInkStrokes(doc).filter(s=>s.blockId===blockId);
  for(const stroke of active){
    if(strokeTouchesPath(stroke.points,points,.025)){
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
    ctx.lineWidth=18;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();
    d.points.forEach((p,i)=>{const x=p[0]*w,y=p[1]*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
    ctx.stroke();
    return;
  }
  drawStroke(ctx,{tool:d.tool,points:notebookRuntime?.ruler?snapRulerPoints(d.points):d.points},w,h);
}

function clearLiveCanvas(block){
  const canvas=block.querySelector('.notebook-canvas.live');if(!canvas)return;
  setupCanvas(canvas,block);
}

function drawStroke(ctx,stroke,w,h){
  if(!stroke.points?.length)return;
  const pts=stroke.points.map(p=>[p[0]*w,p[1]*h,p[2]??.5]);
  const outline=HoliooPerfectFreehand.getStroke(pts,{size:strokeSize(stroke.tool),thinning:.45,smoothing:.5,streamline:.45,simulatePressure:false,last:true});
  ctx.save();
  ctx.globalAlpha=strokeOpacity(stroke.tool);
  ctx.fillStyle=strokeColor(stroke.tool);
  ctx.beginPath();
  outline.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
