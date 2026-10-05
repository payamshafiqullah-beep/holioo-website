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
// A gesture can also start elsewhere (ui/item-menu.js: a long-press on an item): begin(x, y, id),
// then the same finger's move(x, y), lift(x, y) or interrupt().
// Deeper menus: `maxDepth` (default 2) allows courses → sections → sessions → documents … (ring k opens from an item of
// ring k-1, further out); `stack:true` blurs the ring before the open one and hides the older ones (features/home/quick-reading.js).
// Nothing here knows about courses or the camera (see features/camera/quick-capture.js).
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
// From the second ring on, the children of an item are laid out as a small full circle right round that item (the smallest one
// that holds them and stays on screen), not fanned far out. Every ring before stays where it was, blurred: moving back onto the
// open item (the middle of the circle) is the way back.
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
