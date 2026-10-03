'use strict';
// Notes page (tablet / computer, pages/NotesCanvasPage.js): one free canvas per séance, OneNote-style.
// This file is the document model — pure functions, no DOM, no globals — so it can be tested with Node
// (tests/canvas-doc.test.mjs) and used by the screen, the PDF export and the Drive sync alike.
//
// Everything is stored in page units: the page is CANVAS_W wide whatever the screen, so a drawing lands in the same
// place, and the PDF has the same layout, on a tablet and on a computer. The page only grows downwards.
//
//   doc = {version, sessionId, height, bg:'lines'|'grid'|'blank', bgAt, items:[], strokes:[], known:[], updatedAt}
//   item   photo  {id, type:'photo', photoId, x, y, w, h, z}
//          text   {id, type:'text',  x, y, w, h, z, text, lines, color, size}   lines = the wrapped text, kept
//                 so that every device and the PDF break the lines exactly where the author's screen did
//          arrow  {id, type:'arrow', x, y, w, h, z, p:[x1,y1,x2,y2], color, size}   (x,y,w,h = bounding box)
//          rect   {id, type:'rect',  x, y, w, h, z, color, size}
//   stroke {id, tool:'pen'|'highlighter', color, size, pts:[[x,y,pressure]…], sp, at}   sp = pressure simulated
//   Every item and stroke has updatedAt (ms) and, once removed, deleted:true (a tombstone, so a deletion
//   travels to the other devices); `known` = photo ids the tray has already shown (the others carry a "New" badge).
//
// History: every edit is a list of changes {k:'i'|'s'|'p', id, before, after} (full objects); undo applies the
// `before`, redo the `after`. A creation is a change whose `before` is the same object deleted, so nothing is ever
// really removed and the merge between devices stays simple.

const CANVAS_W=1000;
const CANVAS_PAGE_H=Math.round(CANVAS_W*297/210);   // one A4 sheet = 1414 units
const CANVAS_MAX_H=40000;
const CANVAS_GROW_MARGIN=360;                       // a stroke or photo nearer than this to the bottom makes the page grow
const CANVAS_GROW_STEP=720;
const CANVAS_ADD_SPACE=700;                         // "Ajouter de l'espace"
const CANVAS_LINE=44;                               // spacing of the ruled / grid background
const CANVAS_TOMBSTONE_MS=60*864e5;
const CANVAS_HISTORY_MAX=300;
const CANVAS_TOOLS=['select','pen','highlighter','eraser','text','arrow','rect'];
const CANVAS_BGS=['lines','grid','blank'];
// Four colours per kind of tool, three sizes (thin / medium / thick) per kind; one choice is remembered per kind.
const CANVAS_COLORS={pen:['#111827','#2563EB','#E5484D','#16A34A'],highlighter:['#FACC15','#4ADE80','#F472B6','#60A5FA']};
const CANVAS_SIZES={pen:[2.5,4.5,8],highlighter:[14,24,38],eraser:[10,22,44],shape:[2.5,4.5,8],text:[24,32,46]};
const CANVAS_HIGHLIGHT_ALPHA=.4;
const CANVAS_TEXT_PAD=10;
const CANVAS_TEXT_W=360;                            // width of a new text box
const CANVAS_PHOTO_MIN_W=80;

const canvasKey=sessionId=>`canvas:${sessionId}`;
const canvasNum=(v,d=0)=>Number.isFinite(+v)&&v!==null&&v!==''?+v:d;
const canvasClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const canvasRound=(v,n=1)=>{const k=10**n;return Math.round(v*k)/k};
const canvasKindOf=tool=>tool==='highlighter'?'highlighter':tool==='eraser'?'eraser':tool==='arrow'||tool==='rect'?'shape':tool==='text'?'text':'pen';

function emptyCanvasDoc(sessionId=''){
  return{version:1,sessionId,height:CANVAS_PAGE_H,bg:'lines',bgAt:0,items:[],strokes:[],known:[],updatedAt:0};
}

// ── Reading a stored or received document: unknown or broken parts are dropped, numbers made safe ──
const _str=v=>typeof v==='string'?v:'';
// A colour from a stored or received document ends up in an attribute: only #rgb / #rrggbb(aa) is accepted.
const _color=v=>typeof v==='string'&&/^#[0-9a-fA-F]{3,8}$/.test(v)?v:CANVAS_COLORS.pen[0];
function _item(raw){
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!raw.id)return null;
  const type=raw.type,base={id:raw.id,type,x:canvasNum(raw.x),y:Math.max(0,canvasNum(raw.y)),w:Math.max(0,canvasNum(raw.w)),h:Math.max(0,canvasNum(raw.h)),z:canvasNum(raw.z),updatedAt:canvasNum(raw.updatedAt)};
  if(raw.deleted)base.deleted=true;
  if(type==='photo'){if(typeof raw.photoId!=='string')return null;return{...base,photoId:raw.photoId}}
  if(type==='text')return{...base,text:_str(raw.text),lines:Array.isArray(raw.lines)?raw.lines.map(_str):_str(raw.text).split('\n'),color:_color(raw.color),size:canvasClamp(canvasNum(raw.size,CANVAS_SIZES.text[1]),8,120)};
  if(type==='arrow'){
    const p=Array.isArray(raw.p)&&raw.p.length===4?raw.p.map(v=>canvasNum(v)):null;if(!p)return null;
    return{...base,...canvasArrowBox(p),p,color:_color(raw.color),size:canvasClamp(canvasNum(raw.size,CANVAS_SIZES.shape[1]),1,40)};
  }
  if(type==='rect')return{...base,color:_color(raw.color),size:canvasClamp(canvasNum(raw.size,CANVAS_SIZES.shape[1]),1,40)};
  return null;
}
function _stroke(raw){
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!raw.id||!Array.isArray(raw.pts)||!raw.pts.length)return null;
  const pts=raw.pts.filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(p=>[+p[0],+p[1],p.length>2&&Number.isFinite(+p[2])?+p[2]:.5]);
  if(!pts.length)return null;
  const s={id:raw.id,tool:raw.tool==='highlighter'?'highlighter':'pen',color:_color(raw.color),size:canvasClamp(canvasNum(raw.size,CANVAS_SIZES.pen[1]),.5,80),pts,sp:raw.sp?1:0,at:canvasNum(raw.at),updatedAt:canvasNum(raw.updatedAt)};
  if(raw.deleted)s.deleted=true;
  return s;
}
// Newest edit of each id wins; the list keeps a stable order (items by z, strokes by creation).
function _byId(list,make){
  const m=new Map();
  for(const raw of Array.isArray(list)?list:[]){const o=make(raw);if(!o)continue;const c=m.get(o.id);if(!c||o.updatedAt>=c.updatedAt)m.set(o.id,o)}
  return[...m.values()];
}
function normalizeCanvasDoc(raw,sessionId=''){
  const d=emptyCanvasDoc(sessionId||_str(raw?.sessionId));
  if(!raw||typeof raw!=='object')return d;
  d.height=canvasClamp(canvasNum(raw.height,CANVAS_PAGE_H),CANVAS_PAGE_H,CANVAS_MAX_H);
  d.bg=CANVAS_BGS.includes(raw.bg)?raw.bg:'lines';
  d.bgAt=canvasNum(raw.bgAt);
  d.items=_byId(raw.items,_item).sort((a,b)=>a.z-b.z||(a.id<b.id?-1:1));
  d.strokes=_byId(raw.strokes,_stroke).sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));
  d.known=[...new Set((Array.isArray(raw.known)?raw.known:[]).filter(x=>typeof x==='string'))];
  d.updatedAt=canvasNum(raw.updatedAt);
  return d;
}
// Removed things older than this are forgotten (every device has had time to hear about them).
function canvasPrune(doc,now=Date.now()){
  const old=o=>o.deleted&&now-o.updatedAt>CANVAS_TOMBSTONE_MS;
  doc.items=doc.items.filter(o=>!old(o));doc.strokes=doc.strokes.filter(o=>!old(o));
  return doc;
}
const canvasLive=list=>list.filter(o=>!o.deleted);
const canvasIsEmpty=doc=>!canvasLive(doc.items).length&&!canvasLive(doc.strokes).length;

// ── Geometry ──
function canvasArrowBox(p){
  const x=Math.min(p[0],p[2]),y=Math.min(p[1],p[3]);
  return{x,y,w:Math.abs(p[2]-p[0]),h:Math.abs(p[3]-p[1])};
}
// Where the page ends for the PDF: the lowest edge of anything on it.
function canvasContentBottom(doc){
  let b=0;
  for(const it of canvasLive(doc.items))b=Math.max(b,it.y+it.h+(it.type==='arrow'||it.type==='rect'?it.size:0));
  for(const s of canvasLive(doc.strokes))for(const p of s.pts)b=Math.max(b,p[1]+s.size/2);
  return b;
}
// The page grows when something reaches near its bottom. Returns the new height, or null.
function canvasGrownHeight(height,reachY){
  if(reachY<=height-CANVAS_GROW_MARGIN||height>=CANVAS_MAX_H)return null;
  return Math.min(CANVAS_MAX_H,Math.ceil((reachY+CANVAS_GROW_STEP)/10)*10);
}
const canvasNextZ=items=>items.reduce((m,it)=>Math.max(m,it.z),0)+1;

function canvasSegDist(px,py,ax,ay,bx,by){
  const vx=bx-ax,vy=by-ay,len=vx*vx+vy*vy;
  const t=len?canvasClamp(((px-ax)*vx+(py-ay)*vy)/len,0,1):0;
  return Math.hypot(px-(ax+vx*t),py-(ay+vy*t));
}
// Is the point on a stroke (within `r` of its centre line, plus half its width)?
function canvasStrokeHit(stroke,x,y,r=0){
  const pts=stroke.pts,reach=r+stroke.size/2;
  if(pts.length===1)return Math.hypot(x-pts[0][0],y-pts[0][1])<=reach;
  for(let i=1;i<pts.length;i++)if(canvasSegDist(x,y,pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1])<=reach)return true;
  return false;
}
// The topmost item at a point. Photos and text: anywhere inside; an arrow: near its line; a rectangle: near its edge
// (so a big frame never hides what is inside it). `tol` in page units.
function canvasHitItem(items,x,y,tol=10){
  const live=canvasLive(items).sort((a,b)=>b.z-a.z);
  for(const it of live){
    if(it.type==='photo'||it.type==='text'){if(x>=it.x-tol/2&&x<=it.x+it.w+tol/2&&y>=it.y-tol/2&&y<=it.y+it.h+tol/2)return it}
    else if(it.type==='arrow'){if(canvasSegDist(x,y,it.p[0],it.p[1],it.p[2],it.p[3])<=tol+it.size/2)return it}
    else if(it.type==='rect'){
      const r=tol+it.size/2,inOuter=x>=it.x-r&&x<=it.x+it.w+r&&y>=it.y-r&&y<=it.y+it.h+r;
      const inInner=x>it.x+r&&x<it.x+it.w-r&&y>it.y+r&&y<it.y+it.h-r;
      if(inOuter&&!inInner)return it;
    }
  }
  return null;
}
// SVG path data (page units), used by the screen and — through Path2D — by the PDF, so both draw the same shape.
function canvasArrowPath(p,size=4.5){
  const[x1,y1,x2,y2]=p,ang=Math.atan2(y2-y1,x2-x1),head=Math.max(18,size*4.5),spread=Math.PI/7;
  const a=[x2-head*Math.cos(ang-spread),y2-head*Math.sin(ang-spread)],b=[x2-head*Math.cos(ang+spread),y2-head*Math.sin(ang+spread)];
  const f=n=>canvasRound(n,1);
  return`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}M${f(a[0])} ${f(a[1])}L${f(x2)} ${f(y2)}L${f(b[0])} ${f(b[1])}`;
}
const canvasRectPath=it=>{const f=n=>canvasRound(n,1);return`M${f(it.x)} ${f(it.y)}H${f(it.x+it.w)}V${f(it.y+it.h)}H${f(it.x)}Z`};
// Perfect-freehand outline → path data (quadratic through the midpoints).
function canvasOutlinePath(outline){
  if(!outline.length)return'';
  const f=n=>canvasRound(n,2),d=['M',f(outline[0][0]),f(outline[0][1]),'Q'];
  for(let i=0;i<outline.length;i++){
    const[x0,y0]=outline[i],[x1,y1]=outline[(i+1)%outline.length];
    d.push(f(x0),f(y0),f((x0+x1)/2),f((y0+y1)/2));
  }
  d.push('Z');return d.join(' ');
}
// Options of perfect-freehand for a stroke. A mouse has no pressure: it is simulated from the speed instead.
const canvasStrokeOptions=s=>s.tool==='highlighter'
  ?{size:s.size,thinning:0,smoothing:.6,streamline:.5,simulatePressure:false,last:true}
  :{size:s.size,thinning:.55,smoothing:.55,streamline:.5,simulatePressure:!!s.sp,last:true};

// ── Text: lines are wrapped once, when the text is written, and kept ──
const canvasLineHeight=size=>canvasRound(size*1.38,1);
function canvasTextHeight(lineCount,size){return Math.max(1,lineCount)*canvasLineHeight(size)+2*CANVAS_TEXT_PAD}
// Greedy wrap at spaces (a word longer than the box is cut). `measure(text)` → width in page units.
// No regex look-behind: older iPads (Safari < 16.4) could not even load this file.
function canvasLayoutText(text,maxWidth,measure){
  const out=[],trimEnd=t=>t.replace(/\s+$/,'');
  const cut=word=>{let chunk='';for(const ch of word){if(chunk&&measure(chunk+ch)>maxWidth){out.push(chunk);chunk=ch}else chunk+=ch}return chunk};
  for(const para of String(text??'').replace(/\r\n?/g,'\n').split('\n')){
    let line='';
    for(const token of para.match(/\S+\s*|\s+/g)||[]){
      if(line&&measure(trimEnd(line+token))>maxWidth){out.push(trimEnd(line));line=''}
      line+=token;
      if(measure(trimEnd(line))>maxWidth)line=cut(line);   // only when the token alone is wider than the box
    }
    out.push(trimEnd(line));
  }
  return out;
}

// ── The working copy: maps by id, history, serialising ──
function canvasStore(doc){
  return{
    items:new Map(doc.items.map(o=>[o.id,o])),strokes:new Map(doc.strokes.map(o=>[o.id,o])),
    page:{height:doc.height,bg:doc.bg,bgAt:doc.bgAt},known:new Set(doc.known),sessionId:doc.sessionId
  };
}
function canvasSerialize(store,updatedAt=Date.now()){
  return{
    version:1,sessionId:store.sessionId,height:store.page.height,bg:store.page.bg,bgAt:store.page.bgAt,
    items:[...store.items.values()].sort((a,b)=>a.z-b.z||(a.id<b.id?-1:1)),
    strokes:[...store.strokes.values()].sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1)),
    known:[...store.known],updatedAt
  };
}
const canvasChangeCreate=(k,obj)=>({k,id:obj.id,before:{...obj,deleted:true},after:{...obj,deleted:undefined}});
const canvasChangeRemove=(k,obj)=>({k,id:obj.id,before:obj,after:{...obj,deleted:true}});
const canvasChangeUpdate=(k,before,after)=>({k,id:before.id,before,after});
const canvasChangePage=(before,after)=>({k:'p',id:'page',before,after});

// Applies a list of changes (`after`, or `before` for an undo). Everything touched is stamped `stamp`, so the
// newest action is the one the other devices keep.
function canvasApplyChanges(store,changes,useAfter,stamp=Date.now()){
  for(const ch of useAfter?changes:[...changes].reverse()){
    const v=useAfter?ch.after:ch.before;
    if(ch.k==='p'){Object.assign(store.page,v);if('bg' in v)store.page.bgAt=stamp;continue}
    const o={...v,updatedAt:stamp};if(!o.deleted)delete o.deleted;
    (ch.k==='s'?store.strokes:store.items).set(ch.id,o);
  }
}
const canvasHistory=()=>({undo:[],redo:[]});
function canvasHistoryPush(h,changes){
  if(!changes.length)return;
  h.undo.push(changes);h.redo.length=0;
  if(h.undo.length>CANVAS_HISTORY_MAX)h.undo.shift();
}
function canvasUndo(h,store,stamp){
  const ch=h.undo.pop();if(!ch)return null;
  canvasApplyChanges(store,ch,false,stamp);h.redo.push(ch);return ch;
}
function canvasRedo(h,store,stamp){
  const ch=h.redo.pop();if(!ch)return null;
  canvasApplyChanges(store,ch,true,stamp);h.undo.push(ch);return ch;
}

// ── Sync between devices: per id, the newest edit wins; the page keeps its greatest height ──
function canvasMerge(a,b){
  const x=normalizeCanvasDoc(a,a?.sessionId),y=normalizeCanvasDoc(b,b?.sessionId);
  const out=emptyCanvasDoc(x.sessionId||y.sessionId);
  out.height=Math.max(x.height,y.height);
  const bgDoc=y.bgAt>x.bgAt?y:x;out.bg=bgDoc.bg;out.bgAt=bgDoc.bgAt;
  out.items=_byId([...x.items,...y.items],_item).sort((p,q)=>p.z-q.z||(p.id<q.id?-1:1));
  out.strokes=_byId([...x.strokes,...y.strokes],_stroke).sort((p,q)=>p.at-q.at||(p.id<q.id?-1:1));
  out.known=[...new Set([...x.known,...y.known])];
  out.updatedAt=Math.max(x.updatedAt,y.updatedAt);
  return out;
}
// What the page shows, whatever the time stamps (to know whether two copies are the same).
function canvasContentJson(doc){
  const d=normalizeCanvasDoc(doc,doc?.sessionId);
  const clean=o=>{const{updatedAt,...rest}=o;return rest};
  return JSON.stringify({height:d.height,bg:d.bg,items:canvasLive(d.items).map(clean),strokes:canvasLive(d.strokes).map(clean)});
}
const canvasSameContent=(a,b)=>canvasContentJson(a)===canvasContentJson(b);

// ── PDF: the page is cut into A4 sheets, down to the last thing on it (never a blank sheet at the end) ──
function canvasPdfPageCount(doc){
  const bottom=canvasContentBottom(doc);
  const max=Math.max(1,Math.ceil(doc.height/CANVAS_PAGE_H));
  return Math.max(1,Math.min(max,Math.ceil((bottom+24)/CANVAS_PAGE_H)));
}
const canvasPdfSlices=doc=>Array.from({length:canvasPdfPageCount(doc)},(_,i)=>({y0:i*CANVAS_PAGE_H,y1:(i+1)*CANVAS_PAGE_H}));

// ── The photos of the séance as the tray shows them ──
const canvasPlacedPhotoIds=doc=>new Set(canvasLive(doc.items).filter(i=>i.type==='photo').map(i=>i.photoId));
// New = in the séance, never shown by the tray before and not placed yet.
const canvasNewPhotoIds=(photoIds,doc)=>{const placed=canvasPlacedPhotoIds(doc),known=new Set(doc.known);return photoIds.filter(id=>!known.has(id)&&!placed.has(id))};
// A photo placed at its natural proportions: 460 wide when landscape, 340 when portrait.
function canvasPhotoSize(ratio){
  const r=ratio>0?ratio:4/3,w=r>=1?460:340;
  return{w,h:canvasRound(w/r,1)};
}

if(typeof module!=='undefined')module.exports={CANVAS_W,CANVAS_PAGE_H,CANVAS_MAX_H,CANVAS_GROW_MARGIN,CANVAS_GROW_STEP,CANVAS_ADD_SPACE,CANVAS_LINE,CANVAS_TOOLS,CANVAS_BGS,CANVAS_COLORS,CANVAS_SIZES,CANVAS_HIGHLIGHT_ALPHA,CANVAS_TEXT_PAD,CANVAS_TEXT_W,CANVAS_PHOTO_MIN_W,
  canvasKey,canvasKindOf,emptyCanvasDoc,normalizeCanvasDoc,canvasPrune,canvasLive,canvasIsEmpty,canvasArrowBox,canvasContentBottom,canvasGrownHeight,canvasNextZ,canvasSegDist,canvasStrokeHit,canvasHitItem,
  canvasArrowPath,canvasRectPath,canvasOutlinePath,canvasStrokeOptions,canvasLineHeight,canvasTextHeight,canvasLayoutText,
  canvasStore,canvasSerialize,canvasChangeCreate,canvasChangeRemove,canvasChangeUpdate,canvasChangePage,canvasApplyChanges,canvasHistory,canvasHistoryPush,canvasUndo,canvasRedo,
  canvasMerge,canvasContentJson,canvasSameContent,canvasPdfPageCount,canvasPdfSlices,canvasPlacedPhotoIds,canvasNewPhotoIds,canvasPhotoSize};
