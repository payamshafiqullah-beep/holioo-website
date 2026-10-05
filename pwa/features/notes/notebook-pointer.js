'use strict';
// Session notebook, pointer: pressing, dragging and resizing photos, drawing and ending strokes.
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
