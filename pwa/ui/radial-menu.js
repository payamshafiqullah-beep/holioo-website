'use strict';
// Radial menu — one continuous gesture, the finger never leaves the screen:
//   press the trigger → a ring of items opens around it;
//   drag onto an item → it lights up; if it has children, a second ring opens further out in
//   that direction (dragging back onto another item of the first ring switches the second ring);
//   lift on a child → it is chosen. Lifting anywhere else (the trigger, between items, outside)
//   cancels. Choosing happens only when the finger lifts, never on hover.
// The keyboard works too (accessibility): Enter opens, arrows move, Enter chooses, Escape closes.
//
// Reusable on any element:  createRadialMenu({trigger, items, onSelect})
// Nothing here knows about courses or the camera (see features/quick-capture.js).
// Geometry and hit testing are pure functions, tested in tests/radial-menu.test.mjs.
// Angles are in degrees, 0 = right, 90 = straight up, counter-clockwise.

const RADIAL={
  size:56,minSize:44,gap:8,ringGap:14,
  margin:10,       // min distance between an item and the screen edge
  stepMax:40,      // widest spacing between two neighbours of the first ring
  anchorR:32,      // radius of the trigger itself: the first ring starts past it
  minR1:96,
  maxR1:260,       // beyond this the ring is out of thumb reach: items shrink instead
  maxItems:7,
  dwell:180,       // ms the finger rests on another course before its sections replace the open ones
  anim:150
};
const radDeg=r=>r*180/Math.PI;
const radNorm=a=>((a%360)+360)%360;
const radDiff=(a,b)=>Math.abs(((a-b)%360+540)%360-180);

// Smallest angle between two neighbours so that items of `size` px don't touch on a ring of radius r.
const radialMinStep=(r,size,gap=RADIAL.gap)=>radDeg(2*Math.asin(Math.min(1,(size+gap)/(2*r))));

const radialPoint=(o,r,a)=>({x:o.x+r*Math.cos(a*Math.PI/180),y:o.y-r*Math.sin(a*Math.PI/180)});

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
    return{size:s,r1:r,r2:r+s+opt.ringGap,step1:step,angles1};
  };
  // roomy: every item also keeps room on both sides for 4 children centered on it, so they fan
  // straight out from it instead of being pushed sideways over a neighbour.
  const tryFit=(roomy,dr)=>{
    for(let s=opt.size;s>=opt.minSize;s-=2){
      for(let r=Math.max(opt.minR1,opt.anchorR+s/2+opt.gap);r<=opt.maxR1;r+=dr){
        const r2=r+s+opt.ringGap;
        // Farther out, fewer angles stay on screen: once the second ring has none, stop growing.
        let run=radialRun(radialFree(o,r2,s,vp,opt));if(!run)break;
        if(roomy&&!run.full){const m=1.5*radialMinStep(r2,s,opt.gap)*1.08;if(run.len<2*m)continue;run={start:run.start+m,len:run.len-2*m,full:false}}
        const fit=place(s,r,run);if(fit)return fit;
      }
    }
    return null;
  };
  // Coarse search first (fast); a tight corner may only fit within a narrow band of radii.
  const fit=tryFit(true,3)||tryFit(false,3)||tryFit(false,1);if(fit)return fit;
  // A tiny window: the first ring alone, smallest items.
  const s=opt.minSize,r=Math.max(opt.minR1,opt.anchorR+s/2+opt.gap);
  const run=radialRun(radialFree(o,r,s,vp,opt))||{start:0,len:360,full:true};
  return place(s,r,run)||{size:s,r1:r,r2:r+s+opt.ringGap,step1:n>1?300/(n-1):0,angles1:radialAngles(n,90,n>1?300/(n-1):0)};
}

// Second ring: k children around their parent's angle, as close to it as the screen allows.
// `shown` < k when they don't all fit: the caller then turns the last one into a "more" item.
function radialChildren(k,parentAngle,o,vp,fit,opt=RADIAL){
  const s=fit.size,r=fit.r2;
  const run=radialRun(radialFree(o,r,s,vp,opt),radNorm(parentAngle))||{start:radNorm(parentAngle),len:0,full:false};
  const step=radialMinStep(r,s,opt.gap)*1.08;
  const capacity=run.full?Math.max(1,Math.floor(360/step)):Math.max(1,Math.floor(run.len/step+1e-9)+1);
  const shown=Math.min(k,capacity),total=(shown-1)*step;
  return{angles:radialAngles(shown,radialCenter(run,parentAngle,total),step),step,shown,capacity};
}

// What is under point p: {center:true}, {ring:1, index}, {ring:2, index} or null (outside).
// First ring: by direction, inside its band (forgiving: the finger hides the items). Second
// ring: the nearest item within reach. While `active`'s children are open, a drag towards a far
// child may pass over a neighbour: that neighbour is only `tentative` — the component switches to
// it when the finger rests on it.
function radialHit(p,o,fit,ring2=null,active=-1,opt=RADIAL){
  const dx=p.x-o.x,dy=o.y-p.y,d=Math.hypot(dx,dy);
  const dead=Math.min(44,fit.r1-fit.size/2-6);
  if(d<dead)return{center:true};
  if(d<=fit.r1+fit.size/2+opt.ringGap/2){
    const a=radDeg(Math.atan2(dy,dx)),tol=Math.max(fit.step1/2,16);
    let best=-1,err=Infinity;
    fit.angles1.forEach((b,i)=>{const e=radDiff(a,b);if(e<err){err=e;best=i}});
    if(err>tol)return null;
    if(ring2&&active>=0&&best!==active){
      const q=radialPoint(o,fit.r1,fit.angles1[best]);
      if(Math.hypot(p.x-q.x,p.y-q.y)>fit.size*.6)return radDiff(a,fit.angles1[active])<=tol?{ring:1,index:active}:null;
      return{ring:1,index:best,tentative:true};
    }
    return{ring:1,index:best};
  }
  if(ring2){
    let best=-1,dist=Infinity;
    ring2.angles.forEach((a,i)=>{const q=radialPoint(o,fit.r2,a),e=Math.hypot(p.x-q.x,p.y-q.y);if(e<dist){dist=e;best=i}});
    if(dist<=fit.size*.9)return{ring:2,index:best};
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
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('click',e=>{
    if(performance.now()<radialSwallowUntil){radialSwallowUntil=0;e.preventDefault();e.stopImmediatePropagation()}
  },true);
  // The trigger left the page (the screen was redrawn) while the finger was down: cancel.
  document.addEventListener('lostpointercapture',e=>{
    if(radialPress&&e.pointerId===radialPress.id&&!radialPress.trigger.isConnected)radialPress.cancel();
  });
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
//   label, closeLabel, centerHtml
// })
function createRadialMenu(o){
  const trigger=o.trigger||o.anchor;
  if(!trigger)return null;
  const escHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const enabled=()=>!o.isEnabled||o.isEnabled();
  let st=null;         // the open menu
  let press=null;      // the finger (or mouse button) currently down on the trigger: {id, x, y}
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

  function itemHtml(it,ring,i,p,from){
    const dx=p.x-st.o.x,dy=p.y-st.o.y,c=it.color||'#5B67F1',t=String(it.short??it.label);
    const k=t.length<=2?.32:t.length===3?.27:.22;   // longer text, smaller font: it stays inside the circle
    return`<button type="button" role="menuitem" tabindex="-1" class="radial-item r${ring}${it.marked?' marked':''}${it.more?' more':''}${from?' pre':''}" data-ring="${ring}" data-i="${i}" aria-label="${escHtml(it.aria||it.label)}"${it.children?' aria-haspopup="menu" aria-expanded="false"':''} style="left:${st.o.x}px;top:${st.o.y}px;--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;${from?`--px:${from.x.toFixed(1)}px;--py:${from.y.toFixed(1)}px;`:''}--c:${escHtml(c)};--fg:${radialInk(c)};--k:${k}"><span class="mag-blob" aria-hidden="true"></span><span class="mag-glyph"><span class="radial-dot">${escHtml(t)}</span>${ring===1&&it.label!==it.short?`<small>${escHtml(it.label)}</small>`:''}</span></button>`;
  }

  // mode 'gesture': the finger is down, the menu ignores clicks (the trigger has the pointer).
  // mode 'keys': opened from the keyboard or a screen reader; items are focusable buttons.
  function open(mode,{keyboard=false}={}){
    if(st)return true;
    const items=o.items();
    if(!items.length){o.onEmpty?.();return false}
    const vp=viewport(),org=originPoint(),fit=radialFit(items.length,org,vp);
    const el=document.createElement('div');
    el.className='radial';el.dataset.mode=mode;
    el.setAttribute('role','menu');el.setAttribute('aria-label',o.label||'');
    el.style.setProperty('--s',`${fit.size}px`);
    st={mode,items,fit,o:org,vp,el,parent:-1,children:[],ring2:null,hot:null,openedAt:performance.now()};
    st.box=menuBox();
    el.innerHTML=`<div class="radial-backdrop"></div>
      <div class="radial-title" aria-hidden="true"><b></b><span></span></div>
      <button type="button" class="radial-center" aria-label="${escHtml(o.closeLabel||'Fermer')}" style="left:${org.x}px;top:${org.y}px">${o.centerHtml||'×'}</button>
      ${items.map((it,i)=>itemHtml(it,1,i,radialPoint(org,fit.r1,fit.angles1[i]))).join('')}`;
    el.addEventListener('click',onOverlayClick);
    el.addEventListener('keydown',onKey);
    el.addEventListener('focusin',e=>{const b=e.target.closest?.('.radial-item');if(b)describe(itemAt(+b.dataset.ring,+b.dataset.i),+b.dataset.ring===2?st.items[st.parent]:null)});
    el.addEventListener('contextmenu',e=>e.preventDefault());
    el.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault()},{passive:false});
    el.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
    document.body.appendChild(el);
    fitLabels();
    st.drops=typeof createDrops==='function'?createDrops():null;syncDrops();
    document.documentElement.classList.add('radial-lock');
    try{window.getSelection()?.removeAllRanges()}catch{}
    trigger.setAttribute('aria-expanded','true');trigger.classList.add('radial-active');
    void el.offsetWidth;el.classList.add('open');
    describe(null,null);
    window.addEventListener('resize',onResize);
    radialOpen.add(api);
    if(keyboard)focusItem(1,0);
    return true;
  }

  // Where circles can be: the trigger, the first ring, and the second ring of every item (4 children):
  // the label near the rings must not cover any of them.
  function menuBox(){
    const{fit,o:org,vp}=st,pad=fit.size*.6+4,pts=[org,...fit.angles1.map(a=>radialPoint(org,fit.r1,a))];
    for(const a of fit.angles1)for(const b of radialChildren(4,a,org,vp,fit).angles)pts.push(radialPoint(org,fit.r2,b));
    return pts.map(p=>({x0:p.x-pad,x1:p.x+pad,y0:p.y-pad,y1:p.y+pad}));
  }

  // The names under the first ring are shown only if none of them touches another item or name
  // (all or nothing, so the ring looks the same everywhere). Otherwise: the label near the rings.
  function fitLabels(){
    const s=st.fit.size,box=(x,y,w,h)=>({x0:x-w/2,x1:x+w/2,y0:y,y1:y+h});
    const pts=st.items.map((_,i)=>radialPoint(st.o,st.fit.r1,st.fit.angles1[i]));
    const solid=[...pts.map(p=>box(p.x,p.y-s/2,s,s)),box(st.o.x,st.o.y-36,72,72)];
    const labels=[...st.el.querySelectorAll('.radial-item.r1 small')];
    const boxes=labels.map(sm=>{const i=+sm.closest('.radial-item').dataset.i,p=pts[i];return{own:i,...box(p.x,p.y+s/2+5,sm.offsetWidth,sm.offsetHeight)}});
    const hit=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
    const clash=boxes.some((b,k)=>b.x0<0||b.x1>st.vp.w||b.y1>st.vp.h||solid.some((r,j)=>j!==b.own&&hit(b,r))||boxes.some((q,m)=>m!==k&&hit(b,q)));
    if(clash)labels.forEach(sm=>sm.remove());
  }

  // The circles on screen, for the water drops (ui/magnet.js): each one with its resting box.
  function syncDrops(){
    if(!st?.drops)return;
    const s=st.fit.size;
    st.drops.set([...st.el.querySelectorAll('.radial-item')].map(n=>{
      const ring=+n.dataset.ring,i=+n.dataset.i;
      const p=radialPoint(st.o,ring===2?st.fit.r2:st.fit.r1,ring===2?st.ring2.angles[i]:st.fit.angles1[i]);
      return{el:n,blob:n.querySelector('.mag-blob'),glyph:n.querySelector('.mag-glyph'),shape:magnetShape({left:p.x-s/2,top:p.y-s/2,width:s,height:s})};
    }));
  }

  function teardown(){
    if(!st)return null;
    const s=st;st=null;press=null;
    clearTimeout(s.dwell?.t);
    s.drops?.stop();
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
  function choose(item,parent){
    const s=teardown();if(!s)return;
    s.el.remove();
    o.onSelect(item,parent,{mode:s.mode});
  }
  // Rotation or a new window width: the rings no longer match the screen. (Height alone changes
  // when Safari's toolbar shows or hides: nothing to do.)
  const onResize=()=>{if(st&&Math.abs(window.innerWidth-st.vp.w)>1)close()};

  const itemAt=(ring,i)=>ring===2?st.children[i]:st.items[i];
  const nodeAt=(ring,i)=>st.el.querySelector(`.radial-item.r${ring}[data-i="${i}"]`);
  function focusItem(ring,i){nodeAt(ring,i)?.focus({preventScroll:true})}

  function describe(item,parent,center=false){
    if(!st)return;
    const t=o.describe?.({mode:st.mode,item,parent,center})||{};
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

  function openChildren(i){
    if(!st||st.parent===i)return;
    closeChildren();
    const parent=st.items[i];
    let kids=kidsOf(parent);
    st.parent=i;
    const pNode=nodeAt(1,i);pNode?.classList.add('parent');pNode?.setAttribute('aria-expanded','true');
    if(!kids.length)return;
    let layout=radialChildren(kids.length,st.fit.angles1[i],st.o,st.vp,st.fit);
    if(layout.shown<kids.length)kids=o.overflowItem?[...kids.slice(0,layout.shown-1),o.overflowItem(parent)]:kids.slice(0,layout.shown);
    st.children=kids;st.ring2=layout;
    const from=radialPoint(st.o,st.fit.r1,st.fit.angles1[i]);
    const rel={x:from.x-st.o.x,y:from.y-st.o.y};
    st.el.insertAdjacentHTML('beforeend',kids.map((k,j)=>itemHtml(k,2,j,radialPoint(st.o,st.fit.r2,layout.angles[j]),rel)).join(''));
    void st.el.offsetWidth;
    st.el.querySelectorAll('.radial-item.r2.pre').forEach(n=>n.classList.remove('pre'));
    syncDrops();
  }
  function closeChildren(){
    if(!st||st.parent<0)return;
    const pNode=nodeAt(1,st.parent);pNode?.classList.remove('parent');pNode?.setAttribute('aria-expanded','false');
    st.el.querySelectorAll('.radial-item.r2').forEach(n=>n.remove());
    st.parent=-1;st.children=[];st.ring2=null;
    if(st.hot?.ring===2)st.hot=null;
    syncDrops();
  }

  const sameHot=(a,b)=>(a?.ring??(a?.center?0:-1))===(b?.ring??(b?.center?0:-1))&&(a?.index??-1)===(b?.index??-1);
  function setHot(h){
    if(!st||sameHot(st.hot,h))return;
    st.el.querySelectorAll('.radial-item.hot').forEach(n=>n.classList.remove('hot'));
    st.hot=h;
    if(h?.ring)nodeAt(h.ring,h.index)?.classList.add('hot');
    st.el.classList.toggle('center-hot',!!h?.center);
    if(st.mode==='gesture'&&h?.ring&&'vibrate'in navigator)try{navigator.vibrate(8)}catch{}   // Android only; iOS has no vibration API
    if(h?.ring===2)describe(st.children[h.index],st.items[st.parent]);
    else if(h?.ring===1)describe(st.items[h.index],null);
    else describe(st.parent>=0&&!h?.center?st.items[st.parent]:null,null,!!h?.center);
  }

  // The finger moves: the circles near it reach for it like water drops, and what is under it
  // lights up (nothing is chosen yet).
  function track(x,y){
    if(!st)return;
    const h=radialHit({x,y},st.o,st.fit,st.ring2,st.parent);
    st.drops?.point(h?.center?null:{x,y});            // back on the trigger: the drops settle
    // Passing over another course while its neighbour's sections are open: switch only if the
    // finger stays there a moment (it may just be on its way to a far section).
    if(h?.tentative){
      if(st.dwell?.i!==h.index){clearTimeout(st.dwell?.t);const i=h.index;st.dwell={i,t:setTimeout(()=>{if(st?.dwell?.i===i){st.dwell=null;openChildren(i);setHot({ring:1,index:i})}},RADIAL.dwell)}}
      return;
    }
    if(st.dwell){clearTimeout(st.dwell.t);st.dwell=null}
    if(h?.ring===1){
      if(st.items[h.index].children)openChildren(h.index);else closeChildren();
      setHot(h);
    }else if(h?.ring===2)setHot(h);
    else if(h?.center){closeChildren();setHot(h)}
    else setHot(null);
  }
  // The finger lifts: a child (or an item without children) is chosen; anywhere else cancels.
  function release(x,y){
    if(!st)return;
    const h=radialHit({x,y},st.o,st.fit,st.ring2,st.parent);
    if(h?.ring===2){choose(st.children[h.index],st.items[st.parent]);return}
    if(h?.ring===1&&!st.items[h.index].children){choose(st.items[h.index],null);return}
    close();
  }

  // Keyboard / screen reader mode only: clicks on the items (Enter on a focused item is a click).
  function onOverlayClick(e){
    if(!st||st.mode!=='keys')return;
    const b=e.target.closest('.radial-item');
    if(!b){close({focus:true});return}
    const ring=+b.dataset.ring,i=+b.dataset.i;
    if(ring===2){choose(st.children[i],st.items[st.parent]);return}
    const it=st.items[i];
    if(!it.children){choose(it,null);return}
    openChildren(i);setHot({ring:1,index:i});focusItem(2,0);
  }
  function onKey(e){
    if(!st)return;
    const b=document.activeElement?.closest?.('.radial-item');
    const ring=b?+b.dataset.ring:0,i=b?+b.dataset.i:-1;
    if(e.key==='Escape'){e.preventDefault();close({focus:true});return}
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
      e.preventDefault();
      const r=ring||1,n=r===2?st.children.length:st.items.length,dir=e.key==='ArrowRight'?1:-1;
      focusItem(r,i<0?0:(i+dir+n)%n);return;
    }
    if(e.key==='ArrowUp'&&ring===1&&st.items[i]?.children){e.preventDefault();openChildren(i);setHot({ring:1,index:i});focusItem(2,0);return}
    if(e.key==='ArrowUp'&&!ring){e.preventDefault();focusItem(1,0);return}
    if(e.key==='ArrowDown'&&ring===2){e.preventDefault();focusItem(1,st.parent);return}
    if(e.key==='Tab'){
      e.preventDefault();
      const all=[...st.el.querySelectorAll('.radial-item')],k=all.indexOf(b);
      all[(k+(e.shiftKey?-1:1)+all.length)%all.length]?.focus({preventScroll:true});
    }
  }

  // ─── The trigger: one continuous gesture ───
  trigger.classList.add('radial-trigger');
  trigger.setAttribute('aria-haspopup','menu');
  trigger.setAttribute('aria-expanded','false');
  // Finger down: the first ring opens at once, and every move / the lift keeps coming here.
  trigger.addEventListener('pointerdown',e=>{
    if(!enabled()||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
    e.preventDefault();
    if(st)close();
    try{trigger.setPointerCapture(e.pointerId)}catch{}
    if(!open('gesture'))return;
    press={id:e.pointerId,x:e.clientX,y:e.clientY};
    radialPress={id:e.pointerId,trigger,cancel};
    track(e.clientX,e.clientY);
  });
  trigger.addEventListener('pointermove',e=>{
    if(!press||e.pointerId!==press.id)return;
    press.x=e.clientX;press.y=e.clientY;
    track(e.clientX,e.clientY);
  });
  // Finger up: choose or cancel, right here — so a camera opened by onSelect counts as a user action.
  trigger.addEventListener('pointerup',e=>{
    if(!press||e.pointerId!==press.id)return;
    press=null;
    if(e.pointerType!=='touch')radialSwallowUntil=performance.now()+350;   // the mouse's click that follows
    release(e.clientX,e.clientY);
  });
  function cancel(){if(press){press=null;close()}}
  trigger.addEventListener('pointercancel',e=>{if(press&&e.pointerId===press.id)cancel()});

  // iOS protections: no scroll, bounce, text selection, callout or delayed click from this touch.
  // The same touch also drives the menu, in case a browser sends fewer pointer events.
  trigger.addEventListener('touchstart',e=>{
    if(!enabled())return;
    if(e.cancelable)e.preventDefault();
    if(e.touches.length>1)cancel();              // a second finger: not this gesture
  },{passive:false});
  trigger.addEventListener('touchmove',e=>{
    if(e.cancelable&&(press||st))e.preventDefault();
    const t=e.touches[0];if(press&&t){press.x=t.clientX;press.y=t.clientY;track(t.clientX,t.clientY)}
  },{passive:false});
  trigger.addEventListener('touchend',e=>{
    if(e.cancelable&&enabled())e.preventDefault();
    const t=e.changedTouches[0];
    if(press&&t){press=null;release(t.clientX,t.clientY)}
  },{passive:false});
  trigger.addEventListener('touchcancel',cancel);
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
    state:()=>st&&{mode:st.mode,parent:st.parent,hot:st.hot,fit:st.fit,ring2:st.ring2,origin:st.o,items:st.items.map(i=>i.id),children:st.children.map(i=>i.id)}
  });
  return api;
}

if(typeof module!=='undefined')module.exports={RADIAL,radialMinStep,radialPoint,radialFree,radialRun,radialAngles,radialCenter,radialFit,radialChildren,radialHit,radialInk};
