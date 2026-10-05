'use strict';
// Session notebook, history (undo / redo) and canvas drawing.
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
