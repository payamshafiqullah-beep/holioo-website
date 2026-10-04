'use strict';
// Radial menu — one continuous gesture, the finger never leaves the screen:
//   press the trigger → a ring of items opens around it;
//   drag onto an item → it lights up; if it has children, a second ring opens further out in
//   that direction (dragging back onto another item of the first ring switches the second ring);
//   lift on a child → it is chosen. Lifting while still over the menu (the finger never left the
//   middle — a tap, a shaking hand —, between items, on an item with children) leaves it open for
//   taps; lifting past the rings, or back on the middle after going out to them, cancels.
//   Choosing happens only when the finger lifts, never on hover. A touch the system cancels
//   (pointercancel / touchcancel) also leaves the menu open for taps.
// The keyboard works too (accessibility): Enter opens, arrows move, Enter chooses, Escape closes.
//
// Reusable on any element:  createRadialMenu({trigger, items, onSelect})
// A gesture can also start elsewhere (features/item-menu.js: a long-press on an item): begin(x, y, id),
// then the same finger's move(x, y), lift(x, y) or interrupt().
// Deeper menus: `maxDepth` (default 2) allows courses → sections → sessions → documents … (ring k opens from an item of
// ring k-1, further out); `stack:true` blurs the ring before the open one and hides the older ones (features/quick-reading.js).
// Nothing here knows about courses or the camera (see features/quick-capture.js).
// Geometry and hit testing are pure functions, tested in tests/radial-menu.test.mjs.
// Angles are in degrees, 0 = right, 90 = straight up, counter-clockwise.

const RADIAL={
  size:56,minSize:44,gap:8,ringGap:15,
  margin:10,       // min distance between an item and the screen edge
  stepMax:40,      // widest spacing between two neighbours of the first ring
  anchorR:32,      // radius of the trigger itself: the first ring starts past it
  minR1:96,
  maxR1:260,       // beyond this the ring is out of thumb reach: items shrink instead
  maxItems:7,
  dwell:180,       // ms the finger rests on another course before its sections replace the open ones
  anim:150
};
// Selection lens (liquid glass under the finger): see lensPoint in createRadialMenu.
const LENS={grow:9,snap:1.4,free:.7,speed:1600,stiffness:520,damping:34};
const radDeg=r=>r*180/Math.PI;
const radNorm=a=>((a%360)+360)%360;
const radDiff=(a,b)=>Math.abs(((a-b)%360+540)%360-180);

// Smallest angle between two neighbours so that items of `size` px don't touch on a ring of radius r.
const radialMinStep=(r,size,gap=RADIAL.gap)=>radDeg(2*Math.asin(Math.min(1,(size+gap)/(2*r))));

const radialPoint=(o,r,a)=>({x:o.x+r*Math.cos(a*Math.PI/180),y:o.y-r*Math.sin(a*Math.PI/180)});
// Radius of ring k (1 = first ring): every ring is one item plus a gap further out.
const radialRadius=(fit,k,opt=RADIAL)=>fit.r1+(Math.max(1,k)-1)*(fit.size+opt.ringGap);

// Arcs of angles where an item of `size` at radius r around o stays fully on screen, computed
// exactly (each screen edge hides one arc of the circle): [{start, len, full}], degrees
// counter-clockwise from start; full: the whole circle. vp = {w, h, top, bottom} (safe areas, px).
function radialFree(o,r,size,vp,opt=RADIAL){
  const half=size/2+opt.margin,x0=half,x1=vp.w-half,y0=(vp.top||0)+half,y1=vp.h-(vp.bottom||0)-half;
  const acos=c=>radDeg(Math.acos(Math.max(-1,Math.min(1,c)))),asin=c=>radDeg(Math.asin(Math.max(-1,Math.min(1,c))));
  const blocked=[];   // [from, to] with from < to, possibly past 360
  const cR=(x1-o.x)/r,cL=(x0-o.x)/r,sT=(o.y-y0)/r,sB=(o.y-y1)/r;
  if(cR<=-1||cL>=1||sT<=-1||sB>=1)return[];
  if(cR<1){const a=acos(cR);blocked.push([-a,a])}                     // past the right edge
  if(cL>-1){const a=acos(cL);blocked.push([a,360-a])}                 // past the left edge
  if(sT<1){const a=asin(sT);blocked.push([a,180-a])}                  // above the top
  if(sB>-1){const a=asin(sB);blocked.push([180-a,360+a])}             // below the bottom
  if(!blocked.length)return[{start:0,len:360,full:true}];
  // Unroll on [0, 720) so arcs crossing 0° stay whole, merge, and take the gaps.
  const segs=[];
  for(const[f0,t0]of blocked){const f=radNorm(f0),len=t0-f0;segs.push([f,f+len],[f+360,f+360+len])}
  segs.sort((p,q)=>p[0]-q[0]);
  const merged=[];for(const sg of segs){const last=merged.at(-1);if(last&&sg[0]<=last[1])last[1]=Math.max(last[1],sg[1]);else merged.push([...sg])}
  const free=[];
  for(let i=0;i+1<merged.length;i++){
    const start=merged[i][1],end=merged[i+1][0];
    if(end>start&&start<360+merged[0][0])free.push({start:radNorm(start),len:end-start,full:false});
  }
  // The same gap appears twice after unrolling: keep one of each.
  const out=[];for(const f of free)if(!out.some(g=>Math.abs(g.start-f.start)<1e-6))out.push(f);
  return out;
}

// One arc: the one containing angle `at` if given, else the longest. null: nothing fits.
function radialRun(arcs,at=null){
  if(!arcs.length)return null;
  if(arcs[0].full)return arcs[0];
  if(at!==null){const hit=arcs.find(r=>radNorm(at-r.start)<=r.len+1e-9);if(hit)return hit}
  return arcs.reduce((a,b)=>b.len>a.len?b:a);
}

// n angles `step` apart around `center`, counter-clockwise first (left to right when centered up).
const radialAngles=(n,center,step)=>Array.from({length:n},(_,i)=>center+(n-1)*step/2-i*step);

// Center for `total` degrees inside the arc, as close to `want` as the arc allows (when `want` is
// outside the arc: from the arc's end nearest to it).
function radialCenter(run,want,total){
  if(run.full)return want;
  const end=run.start+run.len,w=run.start+radNorm(want-run.start);
  const target=w<=end?w:radDiff(want,run.start)<=radDiff(want,end)?run.start:end;
  return Math.min(Math.max(target,run.start+total/2),end-total/2);
}

// First ring for n items around o. It opens where the screen has room — upwards when it can
// (above the finger, not under the hand), else towards the free side — and only where the second
// ring also fits further out. Items shrink (down to minSize) and the ring grows until everything
// fits; the smallest ring that fits wins (thumb reach). Returns {size, r1, r2, step1, angles1}.
function radialFit(n,o,vp,opt=RADIAL){
  const place=(s,r,run)=>{
    const min=radialMinStep(r,s,opt.gap),avail=run.full?360*(n-1)/Math.max(1,n):run.len;
    if(n>1&&(n-1)*min>avail+1e-9)return null;
    const step=n>1?Math.max(min,Math.min(opt.stepMax,avail/(n-1))):0,total=(n-1)*step,center=radialCenter(run,90,total);
    // The first item (the most used) goes at the end of the arc nearest to straight up — above the
    // finger, not under the hand; when both ends are as high, left to right.
    const up=radDiff(center-total/2,90)<radDiff(center+total/2,90)-1;
    const angles1=up?radialAngles(n,center,step).reverse():radialAngles(n,center,step);
    return{size:s,r1:r,r2:r+s+opt.ringGap,step1:step,angles1,rings:opt.rings||2};
  };
  // roomy: every item also keeps room on both sides for 4 children centered on it, so they fan
  // straight out from it instead of being pushed sideways over a neighbour.
  const tryFit=(roomy,dr)=>{
    for(let s=opt.size;s>=opt.minSize;s-=2){
      for(let r=Math.max(opt.minR1,opt.anchorR+s/2+opt.gap);r<=opt.maxR1;r+=dr){
        const r2=r+s+opt.ringGap;
        // Farther out, fewer angles stay on screen: once the second ring has none, stop growing.
        let run=radialRun(radialFree(o,r2,s,vp,opt));if(!run)break;
        // Deeper menus: the outermost ring must have room too (a few angles are enough: the rest goes to "more").
        const rOut=r+((opt.rings||2)-1)*(s+opt.ringGap);
        if(rOut!==r2&&!radialRun(radialFree(o,rOut,s,vp,opt)))break;
        if(roomy&&!run.full){const m=1.5*radialMinStep(r2,s,opt.gap)*1.08;if(run.len<2*m)continue;run={start:run.start+m,len:run.len-2*m,full:false}}
        const fit=place(s,r,run);if(fit)return fit;
      }
    }
    return null;
  };
  // Coarse search first (fast); a tight corner may only fit within a narrow band of radii.
  const fit=tryFit(true,3)||tryFit(false,3)||tryFit(false,1);if(fit)return fit;
  // A deep menu that does not fit on this screen: the same menu with one ring less.
  if((opt.rings||2)>2)return radialFit(n,o,vp,{...opt,rings:opt.rings-1});
  // A tiny window: the first ring alone, smallest items.
  const s=opt.minSize,r=Math.max(opt.minR1,opt.anchorR+s/2+opt.gap);
  const run=radialRun(radialFree(o,r,s,vp,opt))||{start:0,len:360,full:true};
  return place(s,r,run)||{size:s,r1:r,r2:r+s+opt.ringGap,step1:n>1?300/(n-1):0,angles1:radialAngles(n,90,n>1?300/(n-1):0),rings:opt.rings||2};
}

// Ring `ring` (default the second): k children around their parent's angle, as close to it as the screen allows.
// `shown` < k when they don't all fit: the caller then turns the last one into a "more" item.
function radialChildren(k,parentAngle,o,vp,fit,opt=RADIAL,ring=2){
  const s=fit.size,r=radialRadius(fit,ring,opt);
  const run=radialRun(radialFree(o,r,s,vp,opt),radNorm(parentAngle))||{start:radNorm(parentAngle),len:0,full:false};
  const step=radialMinStep(r,s,opt.gap)*1.08;
  const capacity=run.full?Math.max(1,Math.floor(360/step)):Math.max(1,Math.floor(run.len/step+1e-9)+1);
  const shown=Math.min(k,capacity),total=(shown-1)*step;
  return{angles:radialAngles(shown,radialCenter(run,parentAngle,total),step),step,shown,capacity};
}

// ─── Hub rings (stack menus with `hub`) ────────────────────────
// From the second ring on, a ring is not fanned out from its parent (which pushes the menu to one side of the screen) but laid
// out as a full circle around the middle zone of the screen, in reach of the thumb whichever side the trigger is on. The ring
// before it stays where it was, blurred: moving back onto it is the way back.
const radialHubZone=vp=>({x:vp.w/2,y:(vp.top||0)+(vp.h-(vp.top||0)-(vp.bottom||0))/2});

// n items of `s` px around c: the smallest circle that holds them all and stays on screen, at least one track (item + ringGap)
// away from the circle of the ring before it (prevR) so the two never overlap. Fewer than n when no circle on screen holds them
// (`shown` < n: the caller turns the last one into a "more" item). {r, angles, step, shown, capacity, full}
function radialHubFit(n,c,vp,s,prevR=null,opt=RADIAL){
  const track=s+opt.ringGap,minR=s+opt.gap+6;
  const rMax=Math.max(minR,Math.min(vp.w/2,(vp.h-(vp.top||0)-(vp.bottom||0))/2)),best={cap:0};
  for(let r=minR;r<=rMax+1e-9;r+=2){
    if(prevR!==null&&Math.abs(r-prevR)<track)continue;
    const run=radialRun(radialFree(c,r,s,vp,opt));if(!run)continue;
    const min=radialMinStep(r,s,opt.gap),cap=run.full?Math.floor(360/min+1e-9):Math.floor(run.len/min+1e-9)+1;
    if(cap>best.cap){best.cap=cap;best.r=r;best.run=run;best.min=min}
    if(cap>=n)break;
  }
  if(!best.cap)return{r:minR,angles:radialAngles(1,90,0),step:0,shown:1,capacity:1,full:false};
  const{r,run,min}=best,shown=Math.min(n,best.cap);
  if(run.full){const step=360/shown;return{r,angles:Array.from({length:shown},(_,i)=>90-i*step),step,shown,capacity:best.cap,full:true}}
  const step=shown>1?Math.max(min,Math.min(run.len/(shown-1),45)):0;
  return{r,angles:radialAngles(shown,radialCenter(run,90,(shown-1)*step),step),step,shown,capacity:best.cap,full:false};
}

// What is under p when the rings have their own centers: levels[k-1] = {c, r, angles}. The outermost open ring answers within
// 0.9 item, the rings before it (blurred) within 0.75; an item of an earlier ring other than the open one is only `tentative`.
function radialHitLevels(p,levels,act,size,from=1){
  const n=levels.length;
  for(let k=n;k>=Math.max(1,from);k--){
    const L=levels[k-1];let best=-1,dist=Infinity;
    L.angles.forEach((a,i)=>{const q=radialPoint(L.c,L.r,a),e=Math.hypot(p.x-q.x,p.y-q.y);if(e<dist){dist=e;best=i}});
    if(best<0||dist>size*(k===n?.9:.75))continue;
    const active=act[k-1]??-1;
    return k<n&&active>=0&&best!==active?{ring:k,index:best,tentative:true}:{ring:k,index:best};
  }
  return null;
}

// What is under point p: {center:true}, {ring:1, index}, {ring:2, index} or null (outside).
// First ring: by direction, inside its band (forgiving: the finger hides the items). Second
// ring: the nearest item within reach. While `active`'s children are open, a drag towards a far
// child may pass over a neighbour: that neighbour is only `tentative` — the component switches to
// it when the finger rests on it.
function radialHit(p,o,fit,ring2=null,active=-1,opt=RADIAL){
  const levels=[{angles:fit.angles1,step:fit.step1}];
  if(ring2)levels.push(ring2);
  return radialHitN(p,o,fit,levels,[active],opt,1);
}

// The same for any number of open rings. levels[k-1] = {angles, step?} of ring k (1 = the first, with fit.angles1);
// act[k-1] = the item of ring k whose children make ring k+1 (-1: none). `from`: the innermost ring that can be hit
// (a menu that hides its older rings only answers on the visible ones). A ring that has another ring outside it is
// hit by direction inside its band, the outermost open ring by distance to its nearest item.
function radialHitN(p,o,fit,levels,act,opt=RADIAL,from=1){
  const dx=p.x-o.x,dy=o.y-p.y,d=Math.hypot(dx,dy);
  const dead=Math.min(44,fit.r1-fit.size/2-6);
  if(d<dead)return{center:true};
  const n=levels.length,a=radDeg(Math.atan2(dy,dx));
  for(let k=Math.max(1,from);k<=n;k++){
    const L=levels[k-1],r=radialRadius(fit,k,opt);
    if(k===n&&k>1){
      let best=-1,dist=Infinity;
      L.angles.forEach((b,i)=>{const q=radialPoint(o,r,b),e=Math.hypot(p.x-q.x,p.y-q.y);if(e<dist){dist=e;best=i}});
      return dist<=fit.size*.9?{ring:k,index:best}:null;
    }
    if(d>r+fit.size/2+opt.ringGap/2)continue;
    const step=L.step??(L.angles.length>1?Math.min(...L.angles.slice(1).map((b,i)=>radDiff(b,L.angles[i]))):0),tol=Math.max(step/2,16);
    let best=-1,err=Infinity;
    L.angles.forEach((b,i)=>{const e=radDiff(a,b);if(e<err){err=e;best=i}});
    if(err>tol)return null;
    const active=act[k-1]??-1;
    if(k<n&&active>=0&&best!==active){
      const q=radialPoint(o,r,L.angles[best]);
      if(Math.hypot(p.x-q.x,p.y-q.y)>fit.size*.6)return radDiff(a,L.angles[active])<=tol?{ring:k,index:active}:null;
      return{ring:k,index:best,tentative:true};
    }
    return{ring:k,index:best};
  }
  return null;
}

// Readable text on an item's color: white or ink, whichever contrasts more.
function radialInk(hex){
  const m=/^#?([\da-f]{6})$/i.exec(String(hex||''));if(!m)return'#fff';
  const lum=[0,2,4].map(i=>{const c=parseInt(m[1].slice(i,i+2),16)/255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4});
  const L=.2126*lum[0]+.7152*lum[1]+.0722*lum[2];
  return(1.05/(L+.05))>=((L+.05)/(0.0189+.05))?'#fff':'#1D2140';
}

// ─── Shared by every menu on the page ─────────────────────────
const radialOpen=new Set();     // menus open right now (closed when the screen changes)
let radialSwallowUntil=0;       // the click a mouse sends after a gesture that was already handled
let radialSafe=null;
let radialPress=null;           // the trigger a finger is down on: {id, trigger, cancel}
const radialHaptics={open:55,hover:18,confirm:[35,35,70]};
function radialTouchFeedback(){
  if(typeof window==='undefined')return false;
  const coarse=window.matchMedia?.('(pointer: coarse)').matches;
  const points=typeof navigator!=='undefined'&&(navigator.maxTouchPoints||0)>0;
  return !!(coarse||points||('ontouchstart'in window));
}
function radialVisualHaptic(kind,target){
  if(typeof document==='undefined'||!radialTouchFeedback())return;
  const el=target?.isConnected?target:document.documentElement,cls=`radial-haptic-${kind}`;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),kind==='confirm'?220:160);
}
// iPhone / iPad: no vibration API, but Safari 18+ plays the system's light tick when a native switch
// (<input type="checkbox" switch>) is toggled through its label. Older iOS: nothing (the visual pulse
// still shows). The label is marked data-haptic so the "swallow the click after a gesture" guards let it through.
function radialIosTick(){
  if(typeof document==='undefined'||!radialTouchFeedback())return;
  try{
    const label=document.createElement('label');
    label.dataset.haptic='';label.setAttribute('aria-hidden','true');label.style.display='none';
    label.innerHTML='<input type="checkbox" switch tabindex="-1">';
    document.head.appendChild(label);label.click();label.remove();
  }catch{}
}
function radialHaptic(kind,target){
  const pattern=radialHaptics[kind];
  if(!pattern)return;
  if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'){
    try{if(navigator.vibrate(pattern)!==false)return}catch{}   // Android only; iOS has no vibration API.
  }
  radialIosTick();
  radialVisualHaptic(kind,target);
}
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('click',e=>{
    if(performance.now()<radialSwallowUntil&&!e.target.closest?.('[data-haptic]')){radialSwallowUntil=0;e.preventDefault();e.stopImmediatePropagation()}
  },true);
  // The trigger left the page (the screen was redrawn) while the finger was down: cancel.
  document.addEventListener('lostpointercapture',e=>{
    if(radialPress&&e.pointerId===radialPress.id&&!radialPress.trigger.isConnected)radialPress.cancel();
  });
  // The app goes to the background (a call, the home screen): no menu is left waiting for a tap.
  document.addEventListener('visibilitychange',()=>{if(document.hidden)radialCloseAll()});
}
function radialCloseAll(){for(const m of[...radialOpen])m.close()}

// ─── Component ────────────────────────────────────────────────
// createRadialMenu({
//   trigger,                the element the finger presses (any element; it gets the no-scroll /
//                           no-selection / no-callout protections)
//   items(),                [{id, label, short, color, aria, marked, more, children}] — children: [] or () => []
//   onSelect(item, parent, {mode}), called synchronously inside the pointerup (or the Enter key)
//   overflowItem(parent),   item shown last when a parent's children don't all fit
//   describe(info),         {title, sub} for the label near the rings; info = {mode, item, parent, center}
//   onEmpty(),              items() returned nothing
//   isEnabled(), origin(),  optional: when the trigger answers; the rings' center (default: the trigger's center)
//   maxDepth, stack,        optional: rings allowed (default 2) · blur the ring before the open one and hide older ones
//   maxKids, fitOptions,    optional: most items in a ring after the first (the last becomes overflowItem) · overrides of RADIAL
//   label, closeLabel, centerHtml
// })
// onSelect(item, parent, {mode, path}): parent = the item the chosen one opened from, path = every ancestor, outermost last.
function createRadialMenu(o){
  const trigger=o.trigger||o.anchor;
  if(!trigger)return null;
  const escHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const enabled=()=>!o.isEnabled||o.isEnabled();
  let st=null;         // the open menu
  let press=null;      // the finger (or mouse button) driving the open menu: {id, out}
  const api={};

  function viewport(){
    if(!radialSafe){
      const p=document.createElement('div');p.style.cssText='position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
      document.body.appendChild(p);const cs=getComputedStyle(p);radialSafe={top:parseFloat(cs.paddingTop)||0,bottom:parseFloat(cs.paddingBottom)||0};p.remove();
    }
    return{w:window.innerWidth,h:window.innerHeight,...radialSafe};
  }
  function originPoint(){
    if(o.origin)return o.origin();
    const r=trigger.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};
  }
  const kidsOf=it=>typeof it.children==='function'?it.children():(it.children||[]);
  const depth=()=>st.levels.length;
  const itemAt=(ring,i)=>st.levels[ring-1]?.items[i];
  const parentOf=ring=>ring>1?itemAt(ring-1,st.act[ring-2]):null;                    // the item ring `ring` opened from
  const pathOf=ring=>Array.from({length:ring-1},(_,k)=>itemAt(k+1,st.act[k]));       // every ancestor of an item of ring `ring`
  const canOpen=(ring,it)=>!!it?.children&&ring<st.max;
  const fromRing=()=>o.stack?Math.max(1,depth()-1):1;                                // innermost ring that answers (stack: the visible ones)
  const outerR=()=>radialRadius(st.fit,depth(),st.opt);
  const lvC=k=>st.levels[k-1].c||st.o;                                               // center / radius of ring k (hub rings have their own)
  const lvR=k=>st.levels[k-1].r??radialRadius(st.fit,k,st.opt);

  function itemHtml(it,ring,i,p,from){
    const dx=p.x-st.o.x,dy=p.y-st.o.y,c=it.color||'#5B67F1',t=String(it.short??it.label);
    const k=t.length<=2?.32:t.length===3?.27:.22;   // longer text, smaller font: it stays inside the circle
    return`<button type="button" role="menuitem" tabindex="-1" class="radial-item r${ring}${it.marked?' marked':''}${it.more?' more':''}${from?' pre':''}" data-ring="${ring}" data-i="${i}" aria-label="${escHtml(it.aria||it.label)}"${it.children?' aria-haspopup="menu" aria-expanded="false"':''} style="left:${st.o.x}px;top:${st.o.y}px;--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;${from?`--px:${from.x.toFixed(1)}px;--py:${from.y.toFixed(1)}px;`:''}--c:${escHtml(c)};--fg:${radialInk(c)};--k:${k}"><span class="radial-dot${it.html?' has-icon':''}">${it.html||escHtml(t)}</span>${ring===1&&it.label!==it.short?`<small>${escHtml(it.label)}</small>`:''}</button>`;
  }

  // mode 'gesture': the finger is down, the menu ignores clicks (the trigger has the pointer).
  // mode 'keys': opened from the keyboard or a screen reader; items are focusable buttons.
  function open(mode,{keyboard=false}={}){
    if(st)return true;
    const items=o.items();
    if(!items.length){o.onEmpty?.();return false}
    const vp=viewport(),org=originPoint(),opt={...RADIAL,...(o.fitOptions||{}),rings:o.hub?1:(o.maxDepth||2)},fit=radialFit(items.length,org,vp,opt);
    const el=document.createElement('div');
    el.className='radial';el.dataset.mode=mode;
    el.setAttribute('role','menu');el.setAttribute('aria-label',o.label||'');
    el.style.setProperty('--s',`${fit.size}px`);
    // levels[k-1] = ring k: its items and angles; act[k-1] = the item of ring k whose children are ring k+1 (-1: none).
    st={mode,items,fit,opt,max:o.hub?(o.maxDepth||2):Math.min(o.maxDepth||2,fit.rings||2),hub:!!o.hub,entered:1,hold:null,o:org,vp,el,levels:[{items,angles:fit.angles1,step:fit.step1}],act:[-1],hot:null,openedAt:performance.now()};
    st.box=menuBox();
    const D=fit.size+2*LENS.grow;
    el.innerHTML=`<div class="radial-backdrop"></div>
      <div class="radial-lens" aria-hidden="true" style="width:${D}px;height:${D}px"></div>
      <div class="radial-title" aria-hidden="true"><b></b><span></span></div>
      <button type="button" class="radial-center" aria-label="${escHtml(o.closeLabel||'Fermer')}" style="left:${org.x}px;top:${org.y}px">${o.centerHtml||'×'}</button>
      ${items.map((it,i)=>itemHtml(it,1,i,radialPoint(org,fit.r1,fit.angles1[i]))).join('')}
      <div class="radial-lens-label" aria-hidden="true"></div>`;
    st.lens={el:el.querySelector('.radial-lens'),label:el.querySelector('.radial-lens-label'),D,x:0,y:0,vx:0,vy:0,k:1,kv:0,target:null,snap:null,shown:false,raf:0,last:0};
    el.addEventListener('click',onOverlayClick);
    el.addEventListener('keydown',onKey);
    el.addEventListener('focusin',e=>{const b=e.target.closest?.('.radial-item');if(b)describe(itemAt(+b.dataset.ring,+b.dataset.i),parentOf(+b.dataset.ring),false,+b.dataset.ring)});
    el.addEventListener('contextmenu',e=>e.preventDefault());
    el.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
    el.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
    // Menu left open by a tap (or opened from the keyboard): the lens follows the finger here, and the
    // lift picks what it is on. The touch's own click is cancelled (the menu may be gone by then).
    let down=null,tapEnd=false;
    el.addEventListener('pointerdown',e=>{if(!st||st.mode==='gesture'||!e.isPrimary)return;down=e.pointerId;lensPoint(e.clientX,e.clientY)});
    el.addEventListener('pointermove',e=>{if(st&&e.pointerId===down)lensPoint(e.clientX,e.clientY)});
    el.addEventListener('pointerup',e=>{
      if(!st||e.pointerId!==down)return;
      down=null;tapEnd=e.pointerType==='touch';
      if(!tapEnd)radialSwallowUntil=performance.now()+350;
      pick(e.clientX,e.clientY);
    });
    el.addEventListener('pointercancel',e=>{if(e.pointerId===down){down=null;lensHide()}});
    el.addEventListener('touchend',e=>{if(tapEnd&&e.cancelable)e.preventDefault();tapEnd=false},{passive:false});
    document.body.appendChild(el);
    fitLabels();
    document.documentElement.classList.add('radial-lock');
    try{window.getSelection()?.removeAllRanges()}catch{}
    trigger.setAttribute('aria-expanded','true');trigger.classList.add('radial-active');
    void el.offsetWidth;el.classList.add('open');
    describe(null,null);
    window.addEventListener('resize',onResize);
    radialOpen.add(api);
    if(mode==='gesture')radialHaptic('open',el);
    if(keyboard)focusItem(1,0);
    return true;
  }

  // Where circles can be: the trigger, the first ring, and the second ring of every item (4 children):
  // the label near the rings must not cover any of them.
  function menuBox(){
    const{fit,o:org,vp}=st,pad=fit.size*.6+4,pts=[org,...fit.angles1.map(a=>radialPoint(org,fit.r1,a))];
    if(st.hub){   // the hub circles: sampled points on the tracks a ring can take
      const z=radialHubZone(vp),t=fit.size+st.opt.ringGap,r0=fit.size+st.opt.gap+6;
      for(const r of[r0+t*.5,r0+t*1.5,r0+t*2.5])for(let a=0;a<360;a+=30)pts.push(radialPoint(z,r,a));
    }else for(let k=2;k<=st.max;k++)for(const a of fit.angles1)for(const b of radialChildren(4,a,org,vp,fit,st.opt,k).angles)pts.push(radialPoint(org,radialRadius(fit,k,st.opt),b));
    return pts.map(p=>({x0:p.x-pad,x1:p.x+pad,y0:p.y-pad,y1:p.y+pad}));
  }

  // The names under the first ring are shown only if none of them touches another item or name
  // (all or nothing, so the ring looks the same everywhere). Otherwise: the label near the rings.
  function fitLabels(){
    const s=st.fit.size,box=(x,y,w,h)=>({x0:x-w/2,x1:x+w/2,y0:y,y1:y+h});
    const pts=st.items.map((_,i)=>radialPoint(st.o,st.fit.r1,st.fit.angles1[i]));
    const solid=[...pts.map(p=>box(p.x,p.y-s/2,s,s)),box(st.o.x,st.o.y-36,72,72)];
    const labels=[...st.el.querySelectorAll('.radial-item.r1 small')];
    const boxes=labels.map(sm=>{const p=pts[+sm.parentElement.dataset.i];return{own:+sm.parentElement.dataset.i,...box(p.x,p.y+s/2+5,sm.offsetWidth,sm.offsetHeight)}});
    const hit=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
    const clash=boxes.some((b,k)=>b.x0<0||b.x1>st.vp.w||b.y1>st.vp.h||solid.some((r,j)=>j!==b.own&&hit(b,r))||boxes.some((q,m)=>m!==k&&hit(b,q)));
    if(clash)labels.forEach(sm=>sm.remove());
  }

  function teardown(){
    if(!st)return null;
    const s=st;st=null;press=null;
    clearTimeout(s.dwell?.t);
    if(s.lens?.raf)cancelAnimationFrame(s.lens.raf);
    if(radialPress?.trigger===trigger)radialPress=null;
    radialOpen.delete(api);
    window.removeEventListener('resize',onResize);
    document.documentElement.classList.remove('radial-lock');
    trigger.setAttribute('aria-expanded','false');trigger.classList.remove('radial-active');
    return s;
  }
  // Cancel: animated; the focus goes back to the trigger if it was in the menu.
  function close({focus=false}={}){
    const s=teardown();if(!s)return;
    const hadFocus=s.el.contains(document.activeElement);
    s.el.classList.remove('open');s.el.classList.add('closing');
    setTimeout(()=>s.el.remove(),reduced()?0:RADIAL.anim);
    if((focus||hadFocus)&&trigger.isConnected)trigger.focus({preventScroll:true});
  }
  function choose(ring,i){
    const item=itemAt(ring,i),parent=parentOf(ring),path=pathOf(ring);
    const s=teardown();if(!s)return;
    s.el.remove();
    radialHaptic('confirm',document.documentElement);
    o.onSelect(item,parent,{mode:s.mode,path});
  }
  // Rotation or a new window width: the rings no longer match the screen. (Height alone changes
  // when Safari's toolbar shows or hides: nothing to do.)
  const onResize=()=>{if(st&&Math.abs(window.innerWidth-st.vp.w)>1)close()};

  const nodeAt=(ring,i)=>st.el.querySelector(`.radial-item.r${ring}[data-i="${i}"]`);
  function focusItem(ring,i){nodeAt(ring,i)?.focus({preventScroll:true})}

  function describe(item,parent,center=false,ring=0){
    if(!st)return;
    const t=o.describe?.({mode:st.mode,item,parent,center,ring,path:ring?pathOf(ring):[]})||{};
    const box=st.el.querySelector('.radial-title');
    box.querySelector('b').textContent=t.title||'';
    box.querySelector('span').textContent=t.sub||'';
    box.hidden=!t.title&&!t.sub;
    // Near the rings without covering a circle: just above them, just below, or at the top or the
    // bottom of the screen — the first spot that is free (else the one covering the least).
    const w=box.offsetWidth,h=box.offsetHeight,{vp,box:circles}=st;
    const x=Math.min(Math.max(st.o.x,w/2+8),vp.w-w/2-8),minY=vp.top+8,maxY=vp.h-(vp.bottom||0)-8-h;
    const ys=circles.map(c=>c.y0),ye=circles.map(c=>c.y1);
    const cover=y=>circles.reduce((sum,c)=>sum+Math.max(0,Math.min(x+w/2,c.x1)-Math.max(x-w/2,c.x0))*Math.max(0,Math.min(y+h,c.y1)-Math.max(y,c.y0)),0);
    const spots=[Math.min(...ys)-8-h,Math.max(...ye)+8,minY,maxY].map(y=>Math.min(Math.max(y,minY),maxY));
    box.style.left=`${x}px`;
    box.style.top=`${spots.find(y=>!cover(y))??spots.reduce((a,b)=>cover(b)<cover(a)?b:a)}px`;
  }

  // Ring k+1 = the children of item i of ring k, fanned out around it (further out, as free as the screen allows).
  function openChildren(k,i){
    if(!st||st.act[k-1]===i)return;
    closeChildren(k);
    const parent=itemAt(k,i);
    let kids=kidsOf(parent);
    st.act[k-1]=i;
    const pNode=nodeAt(k,i);pNode?.classList.add('parent');pNode?.setAttribute('aria-expanded','true');
    if(!kids.length||k>=st.max)return;
    const ring=k+1;
    let layout,c=st.o,rr=radialRadius(st.fit,ring,st.opt);
    if(st.hub&&ring>=2){
      c=radialHubZone(st.vp);
      const hf=radialHubFit(Math.min(kids.length,o.maxKids||Infinity),c,st.vp,st.fit.size,ring>2?lvR(k):null,st.opt);
      layout={angles:hf.angles,step:hf.step,shown:hf.shown,capacity:hf.capacity};rr=hf.r;
    }else layout=radialChildren(kids.length,st.levels[k-1].angles[i],st.o,st.vp,st.fit,st.opt,ring);
    const cap=Math.min(layout.shown,o.maxKids||Infinity);
    if(cap<kids.length)kids=o.overflowItem?[...kids.slice(0,Math.max(1,cap-1)),o.overflowItem(parent)]:kids.slice(0,cap);
    if(layout.shown<kids.length||cap<layout.shown)layout={...layout,angles:layout.angles.slice(0,kids.length)};
    st.levels.push({items:kids,angles:layout.angles,step:layout.step,layout,c:st.hub?c:undefined,r:st.hub?rr:undefined});st.act.push(-1);st.entered=Math.min(st.entered,k);
    const r=rr,from=radialPoint(lvC(k),lvR(k),st.levels[k-1].angles[i]);
    const rel={x:from.x-st.o.x,y:from.y-st.o.y};
    st.el.insertAdjacentHTML('beforeend',kids.map((it,j)=>itemHtml(it,ring,j,radialPoint(c,r,layout.angles[j]),rel)).join(''));
    void st.el.offsetWidth;
    st.el.querySelectorAll(`.radial-item.r${ring}.pre`).forEach(n=>n.classList.remove('pre'));
    applyStack();
  }
  // Closes every ring outside ring k (and the choice made in ring k).
  function closeChildren(k=1){
    if(!st||(st.act[k-1]??-1)<0)return;
    for(let j=k;j<=depth();j++){const a=st.act[j-1];if(a>=0){const n=nodeAt(j,a);n?.classList.remove('parent');n?.setAttribute('aria-expanded','false')}}
    for(let j=depth();j>k;j--)st.el.querySelectorAll(`.radial-item.r${j}`).forEach(n=>n.remove());
    st.levels.length=k;st.act.length=k;st.act[k-1]=-1;st.entered=Math.min(st.entered,k);
    if(st.hot?.ring>k)st.hot=null;
    applyStack();
  }
  // Stacked menus (o.stack): the ring before the open one is blurred, the older ones hidden.
  function applyStack(){
    if(!o.stack||!st)return;
    const n=depth();st.el.dataset.depth=n;
    st.el.querySelectorAll('.radial-item').forEach(b=>{const r=+b.dataset.ring;b.classList.toggle('blurred',r===n-1);b.classList.toggle('gone',r<n-1);if(r<n-1)b.setAttribute('aria-hidden','true');else b.removeAttribute('aria-hidden')});
  }

  const sameHot=(a,b)=>(a?.ring??(a?.center?0:-1))===(b?.ring??(b?.center?0:-1))&&(a?.index??-1)===(b?.index??-1);
  function setHot(h){
    if(!st||sameHot(st.hot,h))return;
    st.el.querySelectorAll('.radial-item.hot').forEach(n=>n.classList.remove('hot'));
    st.hot=h;
    if(h?.ring)nodeAt(h.ring,h.index)?.classList.add('hot');
    st.el.classList.toggle('center-hot',!!h?.center);
    if(st.mode==='gesture'&&h?.ring)radialHaptic('hover',nodeAt(h.ring,h.index));
    if(h?.ring>=1)describe(itemAt(h.ring,h.index),parentOf(h.ring),false,h.ring);
    else{
      // Nothing under the finger: the title is the deepest open item (the one whose children are showing).
      let r=depth()-1;while(r>=1&&st.act[r-1]<0)r--;
      const open=!h?.center&&r>=1?itemAt(r,st.act[r-1]):null;
      describe(open,r>1?parentOf(r):null,!!h?.center,open?r:0);
    }
  }

  // The finger moves: light up what is under it (nothing is chosen yet), and the lens follows it.
  function track(x,y){
    if(!st)return;
    trackHit(x,y);
    lensPoint(x,y);
  }
  // Under (x, y): hub menus with an open second ring have rings with their own centers; all others use the single-center test.
  function hitAt(x,y){
    if(st.hub&&depth()>=2){
      if(Math.hypot(x-st.o.x,y-st.o.y)<Math.min(44,st.fit.r1-st.fit.size/2-6))return{center:true};
      return radialHitLevels({x,y},st.levels.map((L,k)=>({c:L.c||st.o,r:L.r??radialRadius(st.fit,k+1,st.opt),angles:L.angles})),st.act,st.fit.size,fromRing());
    }
    return radialHitN({x,y},st.o,st.fit,st.levels,st.act,st.opt,fromRing());
  }
  function trackHit(x,y){
    const h=hitAt(x,y);
    if(press&&!h?.center)press.out=true;   // the finger went out to the rings (a shaking hand stays in the middle)
    // Passing over another item of a ring whose children are open: switch only if the finger stays there a
    // moment (it may just be on its way to a far child).
    if(h?.tentative){
      if(st.dwell?.i!==h.index||st.dwell?.ring!==h.ring){clearTimeout(st.dwell?.t);const i=h.index,ring=h.ring;st.dwell={i,ring,t:setTimeout(()=>{if(st?.dwell?.i===i&&st.dwell.ring===ring){st.dwell=null;openChildren(ring,i);setHot({ring,index:i})}},RADIAL.dwell)}}
      return;
    }
    if(st.hold&&h?.ring===st.hold.ring&&h.index===st.hold.index){setHot(h);return}   // just came back onto it: stay, do not reopen
    st.hold=null;
    // Back onto the blurred ring (its open item) after having been out on the ring it opened: that ring closes, the one
    // before it reappears (hub menus).
    if(st.hub&&h?.ring===depth()-1&&h.index===st.act[depth()-2]&&st.entered>=depth()){
      if(st.dwell?.back!==h.ring){clearTimeout(st.dwell?.t);const ring=h.ring,i=h.index;st.dwell={back:ring,t:setTimeout(()=>{if(st?.dwell?.back===ring){st.dwell=null;closeChildren(ring);st.hold={ring,index:i};setHot({ring,index:i})}},RADIAL.dwell)}}
      return;
    }
    if(st.dwell){clearTimeout(st.dwell.t);st.dwell=null}
    if(h?.ring>st.entered)st.entered=h.ring;
    if(h?.ring){
      if(canOpen(h.ring,itemAt(h.ring,h.index)))openChildren(h.ring,h.index);else closeChildren(h.ring);
      setHot(h);
    }
    else if(h?.center){closeChildren(1);setHot(h)}
    else setHot(null);
  }
  // The finger lifts: the item the lens sits on is chosen (a section, or an item without
  // children). Not on one: `keep` → the menu stays open for taps, else it is cancelled.
  function release(x,y,keep=false){
    if(!st)return;
    lensPoint(x,y);
    const t=st.lens.snap;
    if(t&&!canOpen(t.ring,itemAt(t.ring,t.i))){choose(t.ring,t.i);return}   // a leaf (or the last ring allowed)
    if(keep){toTapMode();return}
    close();
  }
  // Still over the menu: on the rings (between items, on an item with children), not past them and
  // not on the middle.
  function overRings(x,y){
    if(hitAt(x,y)?.center)return false;
    const f=st.fit;
    if(st.hub&&depth()>=2){for(let k=fromRing();k<=depth();k++)if(Math.hypot(x-lvC(k).x,y-lvC(k).y)<=lvR(k)+f.size/2+RADIAL.ringGap)return true;return false}
    return Math.hypot(x-st.o.x,y-st.o.y)<=outerR()+f.size/2+RADIAL.ringGap;
  }
  // Tap mode: the same, except that an item with children opens them (next tap: one of them).
  function pick(x,y){
    lensPoint(x,y);
    const t=st.lens.snap;
    if(t&&canOpen(t.ring,itemAt(t.ring,t.i))){openChildren(t.ring,t.i);setHot({ring:t.ring,index:t.i});lensHide();return}
    release(x,y);
  }
  // Lifted over the menu without choosing (a tap on the trigger, a shaking hand, between items) or the
  // system took the touch: the menu stays open, choose with taps.
  function toTapMode(){st.mode='tap';st.el.dataset.mode='tap';lensHide();setHot(null)}

  // ─── Selection lens: a small round liquid glass under the finger ───
  // Follows the finger (≈70% opacity, kept within the menu's area); within 1.4 × an item's size it
  // snaps onto that item (item radius + 9 px, full opacity), the item's label grows ×1.2 and its
  // name shows in a pill above. Spring movement, slightly stretched along its speed, settling back
  // to a circle; with reduced motion it jumps. Only transform and opacity change.
  function lensPoint(x,y){
    const L=st.lens,s=st.fit.size,R=s/2;
    let best=null,bd=LENS.snap*s;
    for(let k=fromRing();k<=depth();k++){const L=st.levels[k-1],c=lvC(k),r=lvR(k);L.items.forEach((it,i)=>{if(L.angles?.[i]==null)return;const p=radialPoint(c,r,L.angles[i]),d=Math.hypot(x-p.x,y-p.y);if(d<=bd){bd=d;best={ring:k,i,p,item:it}}})}
    let tx,ty,k,op;
    if(best){tx=best.p.x;ty=best.p.y;k=1;op=1}
    else{
      const lim=st.hub?Infinity:outerR()+R,dx=x-st.o.x,dy=y-st.o.y,d=Math.hypot(dx,dy),f=d>lim?lim/d:1;
      tx=st.o.x+dx*f;ty=st.o.y+dy*f;k=R/(R+LENS.grow);op=LENS.free;
    }
    L.target={x:tx,y:ty,k};
    if(!L.shown){L.shown=true;L.x=tx;L.y=ty;L.k=k;L.vx=L.vy=L.kv=0}   // appears where the finger is
    L.el.style.opacity=String(op);
    const was=L.snap;
    if(was?.ring!==best?.ring||was?.i!==best?.i){
      if(was)nodeAt(was.ring,was.i)?.classList.remove('lensed');
      L.snap=best&&{ring:best.ring,i:best.i};
      if(best){
        nodeAt(best.ring,best.i)?.classList.add('lensed');
        L.label.textContent=best.item.label||'';
        const w=L.label.offsetWidth,h=L.label.offsetHeight;
        const lx=Math.min(Math.max(best.p.x-w/2,8),st.vp.w-w-8),ly=Math.max(st.vp.top+4,best.p.y-R-LENS.grow-6-h);
        L.label.style.transform=`translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`;
      }
      L.label.style.opacity=best?'1':'0';
    }
    if(!L.raf)L.raf=requestAnimationFrame(lensFrame);
  }
  function lensHide(){
    const L=st?.lens;if(!L)return;
    L.shown=false;L.el.style.opacity='0';L.label.style.opacity='0';
    if(L.snap)nodeAt(L.snap.ring,L.snap.i)?.classList.remove('lensed');
    L.snap=null;
  }
  function lensFrame(now){
    const L=st?.lens;if(!L)return;
    L.raf=0;
    const T=L.target;if(!T)return;
    const dt=L.last?Math.min(.05,(now-L.last)/1000):1/60;L.last=now;
    if(reduced()){L.x=T.x;L.y=T.y;L.k=T.k;L.vx=L.vy=L.kv=0}
    else{
      const n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;
      for(let i=0;i<n;i++){
        L.vx+=(LENS.stiffness*(T.x-L.x)-LENS.damping*L.vx)*h;L.x+=L.vx*h;
        L.vy+=(LENS.stiffness*(T.y-L.y)-LENS.damping*L.vy)*h;L.y+=L.vy*h;
        L.kv+=(LENS.stiffness*(T.k-L.k)-LENS.damping*L.kv)*h;L.k+=L.kv*h;
      }
    }
    // Stretched along its movement (max +35% / -20%), a circle again when it stops.
    const sp=Math.hypot(L.vx,L.vy),q=Math.min(1,sp/LENS.speed),a=Math.atan2(L.vy,L.vx)*180/Math.PI,half=L.D/2;
    L.el.style.transform=`translate(${(L.x-half).toFixed(2)}px,${(L.y-half).toFixed(2)}px) rotate(${a.toFixed(1)}deg) scale(${(L.k*(1+.35*q)).toFixed(4)},${(L.k*(1-.2*q)).toFixed(4)}) rotate(${(-a).toFixed(1)}deg)`;
    const moving=Math.abs(T.x-L.x)>.3||Math.abs(T.y-L.y)>.3||sp>4||Math.abs(T.k-L.k)>.002||Math.abs(L.kv)>.01;
    if(moving)L.raf=requestAnimationFrame(lensFrame);else L.last=0;
  }

  // Keyboard / screen reader clicks on the items (Enter on a focused item is a click).
  function onOverlayClick(e){
    if(!st||st.mode==='gesture')return;
    const b=e.target.closest('.radial-item');
    if(!b){close({focus:true});return}
    const ring=+b.dataset.ring,i=+b.dataset.i;
    if(!canOpen(ring,itemAt(ring,i))){choose(ring,i);return}
    openChildren(ring,i);setHot({ring,index:i});if(st.mode==='keys')focusItem(ring+1,0);
  }
  function onKey(e){
    if(!st)return;
    const b=document.activeElement?.closest?.('.radial-item');
    const ring=b?+b.dataset.ring:0,i=b?+b.dataset.i:-1;
    if(e.key==='Escape'){e.preventDefault();close({focus:true});return}
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
      e.preventDefault();
      const r=ring||fromRing(),n=st.levels[r-1].items.length,dir=e.key==='ArrowRight'?1:-1;
      focusItem(r,i<0?0:(i+dir+n)%n);return;
    }
    if(e.key==='ArrowUp'&&ring&&canOpen(ring,itemAt(ring,i))){e.preventDefault();openChildren(ring,i);setHot({ring,index:i});focusItem(ring+1,0);return}
    if(e.key==='ArrowUp'&&!ring){e.preventDefault();focusItem(1,0);return}
    if(e.key==='ArrowDown'&&ring>1){e.preventDefault();focusItem(ring-1,st.act[ring-2]);return}
    if(e.key==='Tab'){
      e.preventDefault();
      const all=[...st.el.querySelectorAll('.radial-item:not(.gone)')],k=all.indexOf(b);
      all[(k+(e.shiftKey?-1:1)+all.length)%all.length]?.focus({preventScroll:true});
    }
  }

  // ─── The finger: from the trigger's own events, or from begin() (a gesture started elsewhere) ───
  // Down: the first ring opens at once.
  function fingerDown(id,x,y){
    if(st)close();
    if(!open('gesture'))return false;
    press={id,out:false};
    track(x,y);
    return true;
  }
  function fingerMove(x,y){if(press)track(x,y)}
  // Up: choose right here — so a camera opened by onSelect counts as a user action. Not on an item:
  // the menu stays open for taps while the finger is still over it (it never left the middle, or it is
  // on the rings); past the rings, or back on the middle after going out to them, cancels.
  function fingerUp(x,y){
    if(!press)return;
    const out=press.out;press=null;
    if(!st)return;
    release(x,y,!out||overRings(x,y));
  }
  // The system took the touch (iOS gesture, scroll): where the finger is is unknown — stay open for taps.
  function interrupt(){if(press){press=null;if(st)toTapMode()}}
  function cancel(){if(press){press=null;close()}}

  // ─── The trigger: one continuous gesture ───
  trigger.classList.add('radial-trigger');
  trigger.setAttribute('aria-haspopup','menu');
  trigger.setAttribute('aria-expanded','false');
  // Finger down on the trigger: every move / the lift keeps coming here.
  trigger.addEventListener('pointerdown',e=>{
    if(!enabled()||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
    e.preventDefault();
    try{trigger.setPointerCapture(e.pointerId)}catch{}
    if(fingerDown(e.pointerId,e.clientX,e.clientY))radialPress={id:e.pointerId,trigger,cancel};
  });
  trigger.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.id)fingerMove(e.clientX,e.clientY)});
  trigger.addEventListener('pointerup',e=>{
    if(!press||e.pointerId!==press.id)return;
    if(e.pointerType!=='touch')radialSwallowUntil=performance.now()+350;   // the mouse's click that follows
    fingerUp(e.clientX,e.clientY);
  });
  trigger.addEventListener('pointercancel',e=>{if(press&&e.pointerId===press.id)interrupt()});

  // iOS protections: no scroll, bounce, text selection, callout or delayed click from this touch.
  // The same touch also drives the menu, in case a browser sends fewer pointer events.
  trigger.addEventListener('touchstart',e=>{
    if(!enabled())return;
    if(e.cancelable)e.preventDefault();
    if(e.touches.length>1)cancel();              // a second finger: not this gesture
  },{passive:false});
  trigger.addEventListener('touchmove',e=>{
    if(e.cancelable&&(press||st))e.preventDefault();
    const t=e.touches[0];if(t)fingerMove(t.clientX,t.clientY);
  },{passive:false});
  trigger.addEventListener('touchend',e=>{
    if(e.cancelable&&enabled())e.preventDefault();
    const t=e.changedTouches[0];if(t)fingerUp(t.clientX,t.clientY);
  },{passive:false});
  trigger.addEventListener('touchcancel',interrupt);
  trigger.addEventListener('contextmenu',e=>{if(enabled())e.preventDefault()});
  trigger.addEventListener('selectstart',e=>{if(enabled())e.preventDefault()});

  // Keyboard, and screen readers (they activate with a click and no pointer gesture).
  trigger.addEventListener('keydown',e=>{
    if(!enabled()||st)return;
    if(e.key==='Enter'||e.key===' '||e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();open('keys',{keyboard:true})}
  });
  trigger.addEventListener('click',e=>{
    if(!enabled())return;
    e.preventDefault();e.stopPropagation();
    if(!st)open('keys',{keyboard:true});
  });

  Object.assign(api,{
    open:()=>open('keys',{keyboard:true}),
    close,
    isOpen:()=>!!st,
    // A finger already down elsewhere opens the menu here; the caller sends that finger's moves and lift.
    begin:(x,y,id)=>fingerDown(id,x,y),
    move:fingerMove,lift:fingerUp,interrupt,
    state:()=>st&&{mode:st.mode,parent:st.act[0],hot:st.hot,fit:st.fit,ring2:st.levels[1]?.layout||null,origin:st.o,items:st.items.map(i=>i.id),children:(st.levels[1]?.items||[]).map(i=>i.id),depth:depth(),act:[...st.act],rings:st.levels.map(l=>l.items.map(i=>i.id))}
  });
  return api;
}

if(typeof module!=='undefined')module.exports={RADIAL,radialMinStep,radialPoint,radialRadius,radialFree,radialRun,radialAngles,radialCenter,radialFit,radialChildren,radialHit,radialHitN,radialInk,radialHubZone,radialHubFit,radialHitLevels};
