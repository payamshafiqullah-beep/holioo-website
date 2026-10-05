// Notes page, select tool: moving and resizing items.
// Select: move an item by dragging it, resize from the corner (a photo keeps its proportions).
function canvasHandleHit(rt,it,e){
  if(!canvasResizable(it))return false;
  const r=rt.sheet.getBoundingClientRect();
  return Math.hypot(e.clientX-(r.left+(it.x+it.w)*rt.scale),e.clientY-(r.top+(it.y+it.h)*rt.scale))<=24;
}
function canvasSelectDown(rt,e,p){
  const sel=canvasItem(rt,rt.selected);
  let it=null,mode='move';
  if(sel&&canvasHandleHit(rt,sel,e)){it=sel;mode='resize'}
  else it=canvasHitItem([...rt.store.items.values()],p.x,p.y,canvasTol(rt));
  if(!it){rt.pendingDeselect={id:e.pointerId,x:e.clientX,y:e.clientY};return}
  rt.selected=it.id;
  rt.drag={mode,id:it.id,pointerId:e.pointerId,sx:p.x,sy:p.y,cx:e.clientX,cy:e.clientY,orig:{...it},moved:false,tap:rt.lastTap};
  canvasRenderOverlay(rt);
  rt.sheet.setPointerCapture(e.pointerId);e.preventDefault();
}
function canvasDragMove(rt,e,p){
  const g=rt.drag;
  if(!g.moved&&Math.hypot(e.clientX-g.cx,e.clientY-g.cy)<4)return;
  g.moved=true;
  const o=g.orig,dx=p.x-g.sx,dy=p.y-g.sy,it={...o};
  if(g.mode==='move'){
    it.x=canvasRound(canvasClamp(o.x+dx,0,Math.max(0,CANVAS_W-o.w)));it.y=canvasRound(o.type==='photo'?canvasFitSheet(Math.max(0,o.y+dy),o.h):Math.max(0,o.y+dy));
  }else if(o.type==='photo'){
    const ratio=o.w/o.h,w=canvasClamp(o.w+dx,CANVAS_PHOTO_MIN_W,Math.max(CANVAS_PHOTO_MIN_W,Math.min(CANVAS_W-o.x,canvasSheetRoom(o.y)*ratio)));it.w=canvasRound(w);it.h=canvasRound(w/ratio);
  }else if(o.type==='text'){
    it.w=canvasRound(canvasClamp(o.w+dx,120,CANVAS_W-o.x));
    it.lines=canvasLayoutText(it.text,it.w-2*CANVAS_TEXT_PAD,canvasMeasure(it.size));it.h=canvasTextHeight(it.lines.length,it.size);
  }
  rt.store.items.set(it.id,it);
  canvasGrowFor(rt,it.y+it.h);
  canvasUpdateItemEl(rt,it);canvasRenderOverlay(rt);
}
function canvasDragEnd(rt,e,p){
  const g=rt.drag;rt.drag=null;
  try{rt.sheet.releasePointerCapture(e.pointerId)}catch{}
  if(g.moved){
    const after={...rt.store.items.get(g.id)};
    canvasCommit(rt,[canvasChangeUpdate('i',g.orig,after)]);
    canvasSyncItems(rt);canvasRenderOverlay(rt);
    rt.lastTap=null;
  }else{
    // A tap, not a drag: two taps on a text box edit it (the mouse's double-click does the same).
    const now=performance.now(),it=canvasItem(rt,g.id);
    if(it?.type==='text'&&g.tap&&g.tap.id===it.id&&now-g.tap.t<400){rt.lastTap=null;canvasEditText(rt,it,false);return}
    rt.lastTap={id:g.id,t:now};
    canvasRenderOverlay(rt);
  }
}
