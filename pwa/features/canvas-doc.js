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
//   stroke {id, tool:'pen'|'highlighter', color, size, pts:[[x,y,pressure]…], sp, at}   sp = pressure simulated
//   Every item and stroke has updatedAt (ms) and, once removed, deleted:true (a tombstone, so a deletion
//   travels to the other devices); `known` = photo ids the tray has already shown (the others carry a "New" badge).
//
// History: every edit is a list of changes {k:'i'|'s'|'p', id, before, after} (full objects); undo applies the
// `before`, redo the `after`. A creation is a change whose `before` is the same object deleted, so nothing is ever
// really removed and the merge between devices stays simple.

const CANVAS_W=1000;
const CANVAS_PAGE_H=Math.round(CANVAS_W*297/210);   // one A4 sheet = 1414 units
const CANVAS_MAX_H=Math.floor(40000/CANVAS_PAGE_H)*CANVAS_PAGE_H;   // always whole A4 sheets
const canvasSnapHeight=h=>Math.max(CANVAS_PAGE_H,Math.min(CANVAS_MAX_H,Math.ceil(h/CANVAS_PAGE_H)*CANVAS_PAGE_H));   // a page is a whole number of A4 sheets, on screen as in the PDF
const CANVAS_SHEET_GAP=64;                          // the band drawn between two A4 sheets; a photo keeps clear of it (half a gap + 12 each side)
const CANVAS_SHEET_PAD=CANVAS_SHEET_GAP/2+12;
// A photo never straddles two sheets: it sits on the sheet its middle is on, clear of the band between sheets.
function canvasFitSheet(y,h){
  const k=Math.max(0,Math.min(Math.floor(CANVAS_MAX_H/CANVAS_PAGE_H)-1,Math.floor((y+h/2)/CANVAS_PAGE_H)));
  const lo=k>0?k*CANVAS_PAGE_H+CANVAS_SHEET_PAD:0,hi=(k+1)*CANVAS_PAGE_H-CANVAS_SHEET_PAD-h;
  return Math.max(lo,Math.min(y,hi));
}
// The tallest a photo can be at `y` (its sheet's bottom edge, minus the padding).
const canvasSheetRoom=y=>(Math.floor(Math.max(0,y)/CANVAS_PAGE_H)+1)*CANVAS_PAGE_H-CANVAS_SHEET_PAD-y;
const CANVAS_GROW_MARGIN=360;                       // a stroke or photo nearer than this to the bottom makes the page grow
const CANVAS_GROW_STEP=720;
const CANVAS_ADD_SPACE=CANVAS_PAGE_H;               // "Ajouter de l'espace": one more A4 sheet
const CANVAS_LINE=44;                               // spacing of the ruled / grid background
const CANVAS_TOMBSTONE_MS=60*864e5;
const CANVAS_HISTORY_MAX=300;
const CANVAS_TOOLS=['hand','select','pen','highlighter','eraser','text'];
const CANVAS_BGS=['lines','grid','blank'];
// Four colours per kind of tool, three sizes (thin / medium / thick) per kind; one choice is remembered per kind.
const CANVAS_COLORS={pen:['#111827','#2563EB','#E5484D','#16A34A'],highlighter:['#FACC15','#4ADE80','#F472B6','#60A5FA']};
const CANVAS_SIZES={pen:[2.5,4.5,8],highlighter:[14,24,38],eraser:[10,22,44],text:[24,32,46]};
const CANVAS_HIGHLIGHT_ALPHA=.4;
const CANVAS_TEXT_PAD=10;
const CANVAS_TEXT_W=360;                            // width of a new text box
const CANVAS_PHOTO_MIN_W=80;

const canvasKey=sessionId=>`canvas:${sessionId}`;
const canvasNum=(v,d=0)=>Number.isFinite(+v)&&v!==null&&v!==''?+v:d;
const canvasClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const canvasRound=(v,n=1)=>{const k=10**n;return Math.round(v*k)/k};
const canvasKindOf=tool=>tool==='highlighter'?'highlighter':tool==='eraser'?'eraser':tool==='text'?'text':'pen';

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
  d.height=canvasSnapHeight(canvasNum(raw.height,CANVAS_PAGE_H));
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
// Where the page ends for the PDF: the lowest edge of anything on it.
function canvasContentBottom(doc){
  let b=0;
  for(const it of canvasLive(doc.items))b=Math.max(b,it.y+it.h);
  for(const s of canvasLive(doc.strokes))for(const p of s.pts)b=Math.max(b,p[1]+s.size/2);
  return b;
}
// The page grows when something reaches near its bottom. Returns the new height, or null.
function canvasGrownHeight(height,reachY){
  if(reachY<=height-CANVAS_GROW_MARGIN||height>=CANVAS_MAX_H)return null;
  return canvasSnapHeight(reachY+CANVAS_GROW_MARGIN);
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
// The topmost item at a point (photos and text: anywhere inside). `tol` in page units.
function canvasHitItem(items,x,y,tol=10){
  const live=canvasLive(items).sort((a,b)=>b.z-a.z);
  for(const it of live){
    if(it.type==='photo'||it.type==='text'){if(x>=it.x-tol/2&&x<=it.x+it.w+tol/2&&y>=it.y-tol/2&&y<=it.y+it.h+tol/2)return it}
  }
  return null;
}
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

// ── Eraser, partial mode: the part of a stroke under the eraser (centre x,y, radius r) is cut out ──
// → null when the eraser touches nothing, else the pieces left (each an array of [x,y,pressure], 2 points or more).
// The stroke is resampled every ≤ 2.5 units first, so a fast pass across a sparse stroke still cuts exactly.
function canvasEraseSplit(stroke,x,y,r){
  if(!canvasStrokeHit(stroke,x,y,r))return null;
  const pts=stroke.pts,reach=r+stroke.size/2,dense=[pts[0]];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2.5));
    for(let k=1;k<=n;k++){const t=k/n;dense.push([canvasRound(a[0]+(b[0]-a[0])*t),canvasRound(a[1]+(b[1]-a[1])*t),canvasRound((a[2]??.5)+((b[2]??.5)-(a[2]??.5))*t,2)])}
  }
  const pieces=[];let cur=[],cut=false;
  for(const p of dense){
    if(Math.hypot(p[0]-x,p[1]-y)<=reach){cut=true;if(cur.length>1)pieces.push(cur);cur=[]}
    else cur.push(p);
  }
  if(cur.length>1)pieces.push(cur);
  return cut?pieces:null;
}

// ── Shape snap: a drawn line, circle / ellipse or polygon becomes the clean shape ──
// → null (keep the stroke as drawn) or {kind:'line'|'circle'|'ellipse'|'rect'|'polygon', pts:[[x,y,.5]…]}.
// Small strokes (handwriting) are never touched: the shape must be at least `minSize` units across.
function canvasRdp(pts,tol){
  if(pts.length<3)return pts;
  const a=pts[0],b=pts.at(-1);let worst=-1,at=0;
  for(let i=1;i<pts.length-1;i++){const d=canvasSegDist(pts[i][0],pts[i][1],a[0],a[1],b[0],b[1]);if(d>worst){worst=d;at=i}}
  if(worst<=tol)return[a,b];
  return[...canvasRdp(pts.slice(0,at+1),tol).slice(0,-1),...canvasRdp(pts.slice(at),tol)];
}
function canvasSnapShape(pts,{minSize=60}={}){
  if(!Array.isArray(pts)||pts.length<6)return null;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,len=0;
  pts.forEach((p,i)=>{x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);if(i)len+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1])});
  const w=x1-x0,h=y1-y0,diag=Math.hypot(w,h),first=pts[0],last=pts.at(-1),gap=Math.hypot(last[0]-first[0],last[1]-first[1]);
  if(Math.max(w,h)<minSize)return null;
  const out=(kind,list)=>{
    const dense=[];
    for(let i=0;i<list.length-1||(i===0&&list.length===1);i++){
      const a=list[i],b=list[i+1]||a,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/6));
      for(let k=0;k<n;k++){const t=k/n;dense.push([canvasRound(a[0]+(b[0]-a[0])*t),canvasRound(a[1]+(b[1]-a[1])*t),.5])}
    }
    const e=list.at(-1);dense.push([canvasRound(e[0]),canvasRound(e[1]),.5]);
    return{kind,pts:dense};
  };
  // Line: the stroke stays close to the straight line between its ends.
  if(gap>=minSize&&gap>=len*.8){
    let dev=0;for(const p of pts)dev=Math.max(dev,canvasSegDist(p[0],p[1],first[0],first[1],last[0],last[1]));
    if(dev<=Math.max(4,gap*.07)){
      let a=[first[0],first[1]],b=[last[0],last[1]];
      const ang=Math.abs(Math.atan2(b[1]-a[1],b[0]-a[0]))*180/Math.PI;
      if(ang<6||ang>174){const y=(a[1]+b[1])/2;a[1]=y;b[1]=y}
      else if(Math.abs(ang-90)<6){const x=(a[0]+b[0])/2;a[0]=x;b[0]=x}
      return out('line',[a,b]);
    }
    return null;
  }
  // Closed shapes only: the end comes back near the start.
  if(gap>Math.max(w,h)*.25||len<minSize*2)return null;
  // Circle / ellipse: every point near the ellipse that fits the box (a square or a triangle is far from it).
  const ellipse=maxDev=>{
    const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=w/2,ry=h/2;
    if(rx<minSize/3||ry<minSize/3)return null;
    let worst=0;for(const p of pts)worst=Math.max(worst,Math.abs(Math.hypot((p[0]-cx)/rx,(p[1]-cy)/ry)-1));
    if(worst>maxDev)return null;
    const circle=Math.min(rx,ry)/Math.max(rx,ry)>=.85,r=(rx+ry)/2,pr=circle?[r,r]:[rx,ry],ring=[];
    for(let i=0;i<=48;i++){const a=i*2*Math.PI/48-Math.PI/2;ring.push([cx+pr[0]*Math.cos(a),cy+pr[1]*Math.sin(a)])}
    return out(circle?'circle':'ellipse',ring);
  };
  const round=ellipse(.12);if(round)return round;
  // Polygon: few corners, each a real turn, and every point of the stroke close to an edge.
  const loop=[...pts,first],tol=Math.max(3,diag*.035);
  let v=canvasRdp(loop,tol);v=v.slice(0,-1);
  const turn=(i)=>{const a=v[(i+v.length-1)%v.length],b=v[i],c=v[(i+1)%v.length],u=Math.atan2(b[1]-a[1],b[0]-a[0]),t=Math.atan2(c[1]-b[1],c[0]-b[0]);let d=Math.abs(t-u)*180/Math.PI;if(d>180)d=360-d;return d};
  for(let guard=0;guard<8&&v.length>3;guard++){const i=v.findIndex((_,k)=>turn(k)<30);if(i<0)break;v.splice(i,1)}
  if(v.length>=3&&v.length<=6&&v.every((_,i)=>turn(i)>=30)){
    let fit=0;for(const p of pts){let d=Infinity;for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];d=Math.min(d,canvasSegDist(p[0],p[1],a[0],a[1],b[0],b[1]))}fit=Math.max(fit,d)}
    if(fit<=diag*.07){
      if(v.length===4&&v.every((_,i)=>Math.abs(turn(i)-90)<=22)){
        const e=v.map((a,i)=>{const b=v[(i+1)%4];return Math.abs(Math.atan2(b[1]-a[1],b[0]-a[0]))*180/Math.PI});
        if(e.every(a=>a<22||a>158||Math.abs(a-90)<22)){
          const rx0=(Math.min(...v.map(p=>p[0]))),rx1=Math.max(...v.map(p=>p[0])),ry0=Math.min(...v.map(p=>p[1])),ry1=Math.max(...v.map(p=>p[1]));
          return out('rect',[[rx0,ry0],[rx1,ry0],[rx1,ry1],[rx0,ry1],[rx0,ry0]]);
        }
      }
      const sides=v.map((a,i)=>{const b=v[(i+1)%v.length];return Math.hypot(b[0]-a[0],b[1]-a[1])});
      if(v.length>=5||(v.length===3&&Math.max(...sides)/Math.min(...sides)<1.15)){
        if(Math.max(...sides)/Math.min(...sides)<1.3){
          const cx=v.reduce((s,p)=>s+p[0],0)/v.length,cy=v.reduce((s,p)=>s+p[1],0)/v.length,rad=v.reduce((s,p)=>s+Math.hypot(p[0]-cx,p[1]-cy),0)/v.length,a0=Math.atan2(v[0][1]-cy,v[0][0]-cx);
          const reg=v.map((_,i)=>[cx+rad*Math.cos(a0+i*2*Math.PI/v.length),cy+rad*Math.sin(a0+i*2*Math.PI/v.length)]);
          return out('polygon',[...reg,reg[0]]);
        }
      }
      return out('polygon',[...v,v[0]]);
    }
  }
  return ellipse(.2);
}

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

if(typeof module!=='undefined')module.exports={canvasFitSheet,canvasSheetRoom,CANVAS_SHEET_GAP,CANVAS_SHEET_PAD,canvasSnapHeight,CANVAS_W,CANVAS_PAGE_H,CANVAS_MAX_H,CANVAS_GROW_MARGIN,CANVAS_GROW_STEP,CANVAS_ADD_SPACE,CANVAS_LINE,CANVAS_TOOLS,CANVAS_BGS,CANVAS_COLORS,CANVAS_SIZES,CANVAS_HIGHLIGHT_ALPHA,CANVAS_TEXT_PAD,CANVAS_TEXT_W,CANVAS_PHOTO_MIN_W,
  canvasKey,canvasKindOf,emptyCanvasDoc,normalizeCanvasDoc,canvasPrune,canvasLive,canvasIsEmpty,canvasContentBottom,canvasGrownHeight,canvasNextZ,canvasSegDist,canvasStrokeHit,canvasHitItem,
  canvasOutlinePath,canvasStrokeOptions,canvasEraseSplit,canvasSnapShape,canvasRdp,canvasLineHeight,canvasTextHeight,canvasLayoutText,
  canvasStore,canvasSerialize,canvasChangeCreate,canvasChangeRemove,canvasChangeUpdate,canvasChangePage,canvasApplyChanges,canvasHistory,canvasHistoryPush,canvasUndo,canvasRedo,
  canvasMerge,canvasContentJson,canvasSameContent,canvasPdfPageCount,canvasPdfSlices,canvasPlacedPhotoIds,canvasNewPhotoIds,canvasPhotoSize};
