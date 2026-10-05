// Notes page, pen, highlighter, automatic shapes and the eraser.
// Pen and highlighter.
function canvasInkDown(rt,e,p){
  const tool=rt.tool,size=CANVAS_SIZES[tool][canvasPrefs().size],color=canvasColor(tool);
  rt.selected=null;canvasRenderOverlay(rt);
  const path=canvasInkPath({id:'live',color,tool});
  rt.ink.appendChild(path);
  rt.drawing={pointerId:e.pointerId,tool,color,size,sp:e.pointerType==='pen'?0:1,pts:[[canvasRound(p.x),canvasRound(p.y),canvasPressure(e)]],path,raf:0};
  rt.drawing.hold={x:e.clientX,y:e.clientY,timer:0};canvasHoldArm(rt,rt.drawing);
  canvasDrawLive(rt.drawing);
  rt.sheet.setPointerCapture(e.pointerId);e.preventDefault();
}
function canvasDrawLive(d){d.path.setAttribute('d',canvasOutlinePath(HoliooPerfectFreehand.getStroke(d.pts,{...canvasStrokeOptions(d),last:false})))}
// Forme auto en maintenant: the pen stays within CANVAS_HOLD_SLOP px for CANVAS_HOLD_MS -> the stroke so far goes through the same
// canvasSnapShape as the "Formes auto" button (works with that button off). No confident shape -> the stroke is left alone.
function canvasHoldArm(rt,d){
  clearTimeout(d.hold.timer);
  if(!canvasHoldSnapOn())return;
  d.hold.timer=setTimeout(()=>canvasHoldFire(rt,d),CANVAS_HOLD_MS);
}
function canvasHoldWatch(rt,d,e){
  const h=d.hold;if(!h)return;
  if(Math.hypot(e.clientX-h.x,e.clientY-h.y)<CANVAS_HOLD_SLOP)return;   // still counts as still (no re-arm, the anchor stays)
  h.x=e.clientX;h.y=e.clientY;canvasHoldArm(rt,d);
}
function canvasHoldFire(rt,d){
  if(rt.drawing!==d||d.snap)return;
  const snap=canvasSnapShape(d.pts);if(!snap)return;
  d.snap=snap;cancelAnimationFrame(d.raf);d.raf=0;
  canvasMorph(d,d.pts,snap.pts);
  try{navigator.vibrate?.(8)}catch{}
}
// Both outlines resampled to the same number of points, then eased from the hand-drawn one to the clean one.
function canvasResample(pts,n){
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const total=cum.at(-1)||1,out=[];let j=0;
  for(let k=0;k<n;k++){
    const at=total*k/(n-1);while(j<pts.length-2&&cum[j+1]<at)j++;
    const span=cum[j+1]-cum[j]||1,t=Math.min(1,Math.max(0,(at-cum[j])/span)),a=pts[j],b=pts[j+1]||a;
    out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
  }
  return out;
}
function canvasMorph(d,from,to){
  const N=96,a=canvasResample(from,N);let b=canvasResample(to,N);
  const closed=Math.hypot(to[0][0]-to.at(-1)[0],to[0][1]-to.at(-1)[1])<1;
  if(closed){   // start the clean outline where the stroke started, so it does not swirl
    let best=0,bd=Infinity;for(let i=0;i<N-1;i++){const dd=Math.hypot(b[i][0]-a[0][0],b[i][1]-a[0][1]);if(dd<bd){bd=dd;best=i}}
    b=[...b.slice(best,N-1),...b.slice(0,best+1)];
  }
  const t0=performance.now(),opts={...canvasStrokeOptions({tool:d.tool,size:d.size,sp:0}),last:true};
  const draw=k=>{
    const e=1-Math.pow(1-k,3),mix=a.map((p,i)=>[p[0]+(b[i][0]-p[0])*e,p[1]+(b[i][1]-p[1])*e,.5]);
    d.path.setAttribute('d',canvasOutlinePath(HoliooPerfectFreehand.getStroke(k<1?mix:to,opts)));
  };
  const step=now=>{
    if(!d.path.isConnected)return;
    const k=Math.min(1,(now-t0)/CANVAS_SNAP_MS);draw(k);
    d.morph=k<1?requestAnimationFrame(step):0;
  };
  d.morph=requestAnimationFrame(step);
}
function canvasInkEnd(rt,d){
  rt.drawing=null;cancelAnimationFrame(d.raf);clearTimeout(d.hold?.timer);cancelAnimationFrame(d.morph);
  try{rt.sheet.releasePointerCapture(d.pointerId)}catch{}
  const s={id:uid(),tool:d.tool,color:d.color,size:d.size,pts:d.pts,sp:d.sp,at:Date.now(),updatedAt:Date.now()};
  // Held still: the stroke is first filed as drawn, then corrected by a second history step, so ONE undo gives the original back.
  if(d.snap){
    canvasGrowFor(rt,d.snap.pts.reduce((m,p)=>Math.max(m,p[1]),0));
    d.path.dataset.id=s.id;d.path.setAttribute('d',canvasStrokePathD(s));rt.inkEls.set(s.id,d.path);d.path._pts=s.pts;
    rt.store.strokes.set(s.id,s);
    canvasCommit(rt,[canvasChangeCreate('s',s)]);
    const fixed={...s,pts:d.snap.pts,sp:0};
    canvasCommit(rt,[canvasChangeUpdate('s',{...rt.store.strokes.get(s.id)},fixed)]);
    const now=rt.store.strokes.get(s.id);
    d.path.setAttribute('d',canvasStrokePathD(now));d.path._pts=now.pts;
    canvasAfterGesture(rt);return;
  }
  // Formes auto: a line, circle or regular shape is replaced by its clean version (constant pressure, so no tapered ends).
  if(canvasSnapOn()){const snap=canvasSnapShape(d.pts);if(snap){s.pts=snap.pts;s.sp=0}}
  canvasGrowFor(rt,s.pts.reduce((m,p)=>Math.max(m,p[1]),0));
  d.path.dataset.id=s.id;d.path.setAttribute('d',canvasStrokePathD(s));rt.inkEls.set(s.id,d.path);d.path._pts=s.pts;
  rt.store.strokes.set(s.id,s);
  canvasCommit(rt,[canvasChangeCreate('s',s)]);
  canvasAfterGesture(rt);
}

// Eraser. Stroke mode: a stroke touched is removed whole. Partial mode: only the part under the eraser goes — the
// stroke is cut and its remaining pieces become strokes of their own (same look, same place in the stacking order).
function canvasEraseAt(rt,p,e){
  const er=rt.erasing,r=CANVAS_SIZES.eraser[canvasPrefs().size];
  canvasEraserCursor(rt,e);
  for(const s of [...rt.store.strokes.values()]){
    if(s.deleted)continue;
    if(!er.partial){
      if(!canvasStrokeHit(s,p.x,p.y,r))continue;
      er.before.push(s);rt.store.strokes.set(s.id,{...s,deleted:true});
      const el=rt.inkEls.get(s.id);if(el){el.remove();rt.inkEls.delete(s.id)}
      continue;
    }
    const pieces=canvasEraseSplit(s,p.x,p.y,r);if(!pieces)continue;
    // A piece made earlier in this same gesture simply disappears (it was never in the history); an original is recorded.
    if(er.created.has(s.id)){er.created.delete(s.id);rt.store.strokes.delete(s.id)}
    else{er.before.push(s);rt.store.strokes.set(s.id,{...s,deleted:true})}
    const el=rt.inkEls.get(s.id);if(el){el.remove();rt.inkEls.delete(s.id)}
    for(const pts of pieces){
      const ns={...s,id:uid(),pts,updatedAt:Date.now()};
      rt.store.strokes.set(ns.id,ns);er.created.set(ns.id,ns);
      const path=canvasInkPath(ns);path.dataset.id=ns.id;path.setAttribute('d',canvasStrokePathD(ns));
      rt.ink.appendChild(path);rt.inkEls.set(ns.id,path);
    }
  }
}
function canvasEraseEnd(rt){
  const er=rt.erasing;rt.erasing=null;
  const c=rt.overlay.querySelector('.cv-eraser');if(c)c.style.display='none';
  if(!er)return;
  const made=[...er.created.values()];
  if(!er.before.length&&!made.length)return;
  canvasCommit(rt,[...er.before.map(s=>canvasChangeRemove('s',s)),...made.map(s=>canvasChangeCreate('s',s))]);
  canvasAfterGesture(rt);
}
function canvasEraserCursor(rt,e){
  let c=rt.overlay.querySelector('.cv-eraser');
  if(!c){c=document.createElement('div');c.className='cv-eraser';rt.overlay.appendChild(c)}
  const r=CANVAS_SIZES.eraser[canvasPrefs().size]*rt.scale,s=rt.sheet.getBoundingClientRect();
  Object.assign(c.style,{display:'block',width:`${r*2}px`,height:`${r*2}px`,left:`${e.clientX-s.left}px`,top:`${e.clientY-s.top}px`});
}
