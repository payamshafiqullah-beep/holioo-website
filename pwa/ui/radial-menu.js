'use strict';
// Radial menu — press and hold a button: a ring of items opens around it. Drag onto an item and
// release to choose it; an item with children opens a second ring further out. Releasing on the
// button (center) or outside every item cancels. A simple tap opens the same menu in tap mode
// (choose by tapping), and the keyboard works too: Enter opens, arrows move, Escape closes.
// Reusable: nothing here knows about courses or the camera (see features/quick-capture.js).
//
// Geometry and hit testing are pure functions, tested in tests/radial-menu.test.mjs.
// Angles are in degrees, 0 = right, 90 = straight up; the items of a ring go left to right.

const RADIAL={
  hold:250,        // ms of press before the menu opens (moving the finger opens it at once)
  drag:10,         // px of movement that counts as a drag
  size:56,minSize:44,gap:8,ringGap:14,
  margin:10,       // min distance between an item and the screen edge
  minAngle:12,     // items stay above the button line
  stepMax:40,      // widest spacing between two neighbours of the first ring
  spanMax:156,
  anchorR:32,      // radius of the button itself: the first ring starts past it
  minR1:96,
  maxItems:7,
  anim:150
};
const radDeg=r=>r*180/Math.PI;

// Smallest angle between two neighbours so that items of `size` px don't touch on a ring of radius r.
const radialMinStep=(r,size,gap=RADIAL.gap)=>radDeg(2*Math.asin(Math.min(1,(size+gap)/(2*r))));

const radialPoint=(o,r,a)=>({x:o.x+r*Math.cos(a*Math.PI/180),y:o.y-r*Math.sin(a*Math.PI/180)});

// Angles [lo, hi] where an item of `size` stays fully on screen on a ring of radius r around o,
// or null. vp = {w, h, top, bottom} (top / bottom: safe areas, in px).
function radialRange(o,r,size,vp,opt=RADIAL){
  const half=size/2+opt.margin;
  if(opt.right){   // fan opening to the right (button in the left rail): angles around 0, inside all four edges
    if(o.x+r>vp.w-half)return null;
    const up=(o.y-(vp.top||0)-half)/r,down=(vp.h-(vp.bottom||0)-half-o.y)/r;
    if(up<-1||down<-1)return null;
    const hi=Math.min(radDeg(Math.asin(Math.min(1,up))),90-opt.minAngle),lo=Math.max(-radDeg(Math.asin(Math.min(1,down))),opt.minAngle-90);
    return hi>=lo?[lo,hi]:null;
  }
  const cHi=(vp.w-half-o.x)/r,cLo=(half-o.x)/r;
  if(cHi<-1||cLo>1)return null;
  const sMin=(o.y-(vp.h-(vp.bottom||0)-half))/r;   // below the screen bottom
  if(sMin>1)return null;
  const aMin=sMin>0?radDeg(Math.asin(sMin)):0;
  const lo=Math.max(radDeg(Math.acos(Math.min(1,cHi))),aMin,opt.minAngle);
  const hi=Math.min(radDeg(Math.acos(Math.max(-1,cLo))),180-aMin,180-opt.minAngle);
  return hi>=lo?[lo,hi]:null;
}

// n angles `step` apart around `center`, left to right.
const radialMid=opt=>opt.right?0:90;
const radialAngles=(n,center,step)=>Array.from({length:n},(_,i)=>center+(n-1)*step/2-i*step);

// First ring for n items. Items shrink (down to minSize) and the ring grows until everything fits
// on screen, with room for the second ring above it. The smallest ring that fits wins: it keeps
// every item within thumb reach. Returns {size, r1, r2, step1, angles1}.
function radialFit(n,o,vp,opt=RADIAL){
  const tryFit=strict=>{
    for(let s=opt.size;s>=opt.minSize;s-=2){
      const rMin=Math.max(opt.minR1,opt.anchorR+s/2+opt.gap);
      // The second ring (r1 + s + ringGap) must fit below the top of the screen.
      const rMax=strict?(opt.right?vp.w-o.x:o.y-(vp.top||0))-opt.margin-s/2-(s+opt.ringGap):Math.max(vp.w,vp.h);
      for(let r=rMin;r<=rMax;r+=2){
        const range=radialRange(o,r,s,vp,opt);if(!range)continue;
        const span=Math.min(range[1]-range[0],opt.spanMax),min=radialMinStep(r,s,opt.gap);
        if(n>1&&(n-1)*min>span+1e-9)continue;
        const step=n>1?Math.max(min,Math.min(opt.stepMax,span/(n-1))):0,total=(n-1)*step;
        const center=Math.min(Math.max(radialMid(opt),range[0]+total/2),range[1]-total/2);
        return{size:s,r1:r,r2:r+s+opt.ringGap,step1:step,angles1:radialAngles(n,center,step)};
      }
    }
    return null;
  };
  // A tiny window where nothing fits: smallest items, evenly spread, even if they touch.
  return tryFit(true)||tryFit(false)||(()=>{const s=opt.minSize,r=opt.minR1,step=n>1?156/(n-1):0;return{size:s,r1:r,r2:r+s+opt.ringGap,step1:step,angles1:radialAngles(n,radialMid(opt),step)}})();
}

// Second ring: k children around their parent's angle, as close to it as the screen allows.
// `shown` < k when they don't all fit: the caller then turns the last one into a "more" item.
function radialChildren(k,parentAngle,o,vp,fit,opt=RADIAL){
  const s=fit.size,r=fit.r2;
  const range=radialRange(o,r,s,vp,opt)||[radialMid(opt),radialMid(opt)];
  const step=radialMinStep(r,s,opt.gap)*1.08;
  const capacity=Math.max(1,Math.floor((range[1]-range[0])/step+1e-9)+1);
  const shown=Math.min(k,capacity),total=(shown-1)*step;
  const center=Math.min(Math.max(parentAngle,range[0]+total/2),range[1]-total/2);
  return{angles:radialAngles(shown,center,step),step,shown,capacity};
}

// What is under point p: {center:true}, {ring:1, index}, {ring:2, index} or null (outside).
// First ring: by angle inside its band (forgiving: the finger hides the items). Second ring:
// the nearest item within reach.
function radialHit(p,o,fit,ring2=null,opt=RADIAL){
  const dx=p.x-o.x,dy=o.y-p.y,d=Math.hypot(dx,dy);
  const dead=Math.min(44,fit.r1-fit.size/2-6);
  if(d<dead)return{center:true};
  if(d<=fit.r1+fit.size/2+opt.ringGap/2){
    if(dy<=0&&!opt.right)return null;
    const a=radDeg(Math.atan2(dy,dx)),tol=Math.max(fit.step1/2,16);
    let best=-1,err=Infinity;
    fit.angles1.forEach((b,i)=>{const e=Math.abs(a-b);if(e<err){err=e;best=i}});
    return err<=tol?{ring:1,index:best}:null;
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

// ─── Component ────────────────────────────────────────────────
// createRadialMenu({
//   anchor,                 the button that opens the menu
//   isEnabled(),            false: the button keeps its normal behaviour
//   origin(),               {x, y} center of the rings (default: center of the anchor)
//   items(),                [{id, label, short, color, aria, marked, more, children}] — children: [] or () => []
//   overflowItem(parent),   item shown last when a parent's children don't all fit
//   describe(info),         {title, sub} for the label above the rings; info = {mode, item, parent, center}
//   onSelect(item, parent, {mode}), called synchronously inside the pointerup / click / key event
//   onEmpty(),              items() returned nothing
//   label, closeLabel, centerHtml
// })
function createRadialMenu(o){
  const anchor=o.anchor;
  const escHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const enabled=()=>!o.isEnabled||o.isEnabled();
  let st=null;         // the open menu
  let press=null;      // the pointer on the button, before the menu opens and while dragging
  let swallowUntil=0;  // the click a mouse sends after a gesture that was already handled (one only)
  let safeTop=null;
  let safe={bottom:0,right:0};   // insets, measured once; only used by the rail layout
  const fanRight=()=>!!o.fanRight?.();
  const radialOpt=()=>fanRight()?{...RADIAL,right:true}:RADIAL;
  let touchHandled=false;  // this touch was handled here: its touchend must not become a click

  // Touch needs none: the button's touchend cancels the browser's click (see below).
  const swallow=e=>{if(e.pointerType!=='touch')swallowUntil=performance.now()+350};
  // Wherever it lands (the button, the menu, or the camera screen that just opened).
  window.addEventListener('click',e=>{if(performance.now()<swallowUntil){swallowUntil=0;e.preventDefault();e.stopImmediatePropagation()}},true);

  function viewport(){
    if(safeTop===null){
      const p=document.createElement('div');p.style.cssText='position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
      document.body.appendChild(p);safeTop=p.offsetHeight||0;
      p.style.cssText+=';padding:0;padding-bottom:env(safe-area-inset-bottom);padding-right:env(safe-area-inset-right)';
      safe={bottom:parseFloat(getComputedStyle(p).paddingBottom)||0,right:parseFloat(getComputedStyle(p).paddingRight)||0};p.remove();
    }
    const vp={w:window.innerWidth,h:window.innerHeight,top:safeTop,bottom:0};
    if(fanRight()){vp.bottom=safe.bottom;vp.w-=safe.right}
    return vp;
  }
  function originPoint(){
    if(o.origin)return o.origin();
    const r=anchor.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};
  }
  const kidsOf=it=>typeof it.children==='function'?it.children():(it.children||[]);

  function itemHtml(it,ring,i,p,from){
    const dx=p.x-st.o.x,dy=p.y-st.o.y,c=it.color||'#5B67F1',t=String(it.short??it.label);
    const k=t.length<=2?.32:t.length===3?.27:.22;   // longer text, smaller font: it stays inside the circle
    return`<button type="button" role="menuitem" tabindex="-1" class="radial-item r${ring}${it.marked?' marked':''}${it.more?' more':''}${from?' pre':''}" data-ring="${ring}" data-i="${i}" aria-label="${escHtml(it.aria||it.label)}"${it.children?' aria-haspopup="menu" aria-expanded="false"':''} style="left:${st.o.x}px;top:${st.o.y}px;--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;${from?`--px:${from.x.toFixed(1)}px;--py:${from.y.toFixed(1)}px;`:''}--c:${escHtml(c)};--fg:${radialInk(c)};--k:${k}"><span class="radial-dot">${escHtml(t)}</span>${ring===1&&it.label!==it.short?`<small>${escHtml(it.label)}</small>`:''}</button>`;
  }

  function open(mode,{keyboard=false}={}){
    if(st)return true;
    const items=o.items();
    if(!items.length){o.onEmpty?.();return false}
    const vp=viewport(),org=originPoint(),opt=radialOpt(),fit=radialFit(items.length,org,vp,opt);
    const el=document.createElement('div');
    el.className='radial';el.dataset.mode=mode;
    el.setAttribute('role','menu');el.setAttribute('aria-label',o.label||'');
    el.style.setProperty('--s',`${fit.size}px`);
    st={mode,items,fit,opt,o:org,vp,el,parent:-1,children:[],ring2:null,hot:null,openedAt:performance.now()};
    el.innerHTML=`<div class="radial-backdrop"></div>
      <div class="radial-title" aria-hidden="true" style="left:${org.x}px"><b></b><span></span></div>
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
    document.documentElement.classList.add('radial-lock');
    try{window.getSelection()?.removeAllRanges()}catch{}
    anchor.setAttribute('aria-expanded','true');
    void el.offsetWidth;el.classList.add('open');
    describe(null,null);
    window.addEventListener('resize',onResize);
    if(keyboard)focusItem(1,0);
    return true;
  }

  // The names under the first ring are shown only if none of them touches another item or name
  // (all or nothing, so the ring looks the same everywhere). Otherwise: the label above the rings.
  function fitLabels(){
    const s=st.fit.size,box=(x,y,w,h)=>({x0:x-w/2,x1:x+w/2,y0:y,y1:y+h});
    const pts=st.items.map((_,i)=>radialPoint(st.o,st.fit.r1,st.fit.angles1[i]));
    const solid=[...pts.map(p=>box(p.x,p.y-s/2,s,s)),box(st.o.x,st.o.y-36,72,72)];
    const labels=[...st.el.querySelectorAll('.radial-item.r1 small')];
    const boxes=labels.map(sm=>{const p=pts[+sm.parentElement.dataset.i];return{own:+sm.parentElement.dataset.i,...box(p.x,p.y+s/2+5,sm.offsetWidth,sm.offsetHeight)}});
    const hit=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
    const clash=boxes.some((b,k)=>b.x0<0||b.x1>st.vp.w||b.y1>st.vp.h||solid.some((r,j)=>j!==b.own&&hit(b,r))||boxes.some((o,m)=>m!==k&&hit(b,o)));
    if(clash)labels.forEach(sm=>sm.remove());
  }

  function teardown(){
    if(!st)return null;
    const s=st;st=null;
    window.removeEventListener('resize',onResize);
    document.documentElement.classList.remove('radial-lock');
    anchor.setAttribute('aria-expanded','false');
    return s;
  }
  // Cancel: animated; the focus goes back to the button if it was in the menu.
  function close({focus=false}={}){
    const s=teardown();if(!s)return;
    const hadFocus=s.el.contains(document.activeElement);
    s.el.classList.remove('open');s.el.classList.add('closing');
    setTimeout(()=>s.el.remove(),reduced()?0:RADIAL.anim);
    if(focus||hadFocus)anchor.focus({preventScroll:true});
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
    // Just above the outer ring (it grows upwards when the text takes two lines), never under the status bar.
    if(st.opt.right){   // above the topmost item, kept inside the screen
      const top=Math.min(...st.fit.angles1.map(a=>radialPoint(st.o,st.fit.r2,a).y))-st.fit.size*.6-12-box.offsetHeight;
      box.style.top=`${Math.max(st.vp.top+8,top)}px`;
      const half=box.offsetWidth/2,x=st.o.x+st.fit.r1;
      box.style.left=`${Math.min(Math.max(x,half+8),st.vp.w-half-8)}px`;
      return;
    }
    box.style.top=`${Math.max(st.vp.top+8,st.o.y-st.fit.r2-st.fit.size*.6-12-box.offsetHeight)}px`;
  }

  function openChildren(i){
    if(!st||st.parent===i)return;
    closeChildren();
    const parent=st.items[i];
    let kids=kidsOf(parent);
    st.parent=i;
    const pNode=nodeAt(1,i);pNode?.classList.add('parent');pNode?.setAttribute('aria-expanded','true');
    if(!kids.length)return;
    let layout=radialChildren(kids.length,st.fit.angles1[i],st.o,st.vp,st.fit,st.opt);
    if(layout.shown<kids.length)kids=o.overflowItem?[...kids.slice(0,layout.shown-1),o.overflowItem(parent)]:kids.slice(0,layout.shown);
    st.children=kids;st.ring2=layout;
    const from=radialPoint(st.o,st.fit.r1,st.fit.angles1[i]);
    const rel={x:from.x-st.o.x,y:from.y-st.o.y};
    st.el.insertAdjacentHTML('beforeend',kids.map((k,j)=>itemHtml(k,2,j,radialPoint(st.o,st.fit.r2,layout.angles[j]),rel)).join(''));
    void st.el.offsetWidth;
    st.el.querySelectorAll('.radial-item.r2.pre').forEach(n=>n.classList.remove('pre'));
  }
  function closeChildren(){
    if(!st||st.parent<0)return;
    const pNode=nodeAt(1,st.parent);pNode?.classList.remove('parent');pNode?.setAttribute('aria-expanded','false');
    st.el.querySelectorAll('.radial-item.r2').forEach(n=>n.remove());
    st.parent=-1;st.children=[];st.ring2=null;
    if(st.hot?.ring===2)st.hot=null;
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

  // Gesture: the finger moves over the rings.
  function track(x,y){
    const h=radialHit({x,y},st.o,st.fit,st.ring2,st.opt);
    if(h?.ring===1){
      if(st.items[h.index].children)openChildren(h.index);else closeChildren();
      setHot(h);
    }else if(h?.ring===2)setHot(h);
    else if(h?.center){closeChildren();setHot(h)}
    else setHot(null);
  }
  // Gesture: the finger is lifted.
  function release(x,y){
    const h=radialHit({x,y},st.o,st.fit,st.ring2,st.opt);
    if(h?.ring===2){choose(st.children[h.index],st.items[st.parent]);return}
    if(h?.ring===1){
      const it=st.items[h.index];
      if(!it.children){choose(it,null);return}
      // Released on a parent: the menu stays open on its children, to finish with a tap.
      st.mode='tap';st.el.dataset.mode='tap';openChildren(h.index);setHot(null);
      describe(it,null);
      return;
    }
    close();
  }

  // Tap mode and keyboard: ordinary clicks on the items.
  function onOverlayClick(e){
    if(!st||st.mode!=='tap')return;
    const b=e.target.closest('.radial-item');
    if(!b){close({focus:e.detail===0});return}
    const ring=+b.dataset.ring,i=+b.dataset.i;
    if(ring===2){choose(st.children[i],st.items[st.parent]);return}
    const it=st.items[i];
    if(!it.children){choose(it,null);return}
    openChildren(i);setHot({ring:1,index:i});
    if(e.detail===0)focusItem(2,0);
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

  // ─── The button ───
  anchor.setAttribute('aria-expanded','false');
  anchor.addEventListener('pointerdown',e=>{
    if(!enabled()||(e.pointerType==='mouse'&&e.button!==0))return;
    e.preventDefault();
    touchHandled=e.pointerType==='touch';
    if(st){close();swallow(e);return}   // a tap on the button closes the open menu
    try{anchor.setPointerCapture(e.pointerId)}catch{}
    press={id:e.pointerId,x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,opened:false,timer:setTimeout(startGesture,RADIAL.hold)};
    anchor.classList.add('radial-pressing');
  });
  function startGesture(){
    if(!press||press.opened)return;
    clearTimeout(press.timer);press.opened=true;anchor.classList.remove('radial-pressing');
    if(!open('gesture')){press=null;return}
    track(press.lx,press.ly);
  }
  anchor.addEventListener('pointermove',e=>{
    if(!press||e.pointerId!==press.id)return;
    press.lx=e.clientX;press.ly=e.clientY;
    if(!press.opened){if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>RADIAL.drag)startGesture();return}
    if(st?.mode==='gesture')track(e.clientX,e.clientY);
  });
  anchor.addEventListener('pointerup',e=>{
    if(!press||e.pointerId!==press.id)return;
    clearTimeout(press.timer);
    const p=press;press=null;anchor.classList.remove('radial-pressing');
    swallow(e);
    if(!p.opened){open('tap');return}
    if(st?.mode==='gesture')release(e.clientX,e.clientY);
  });
  const cancelPress=()=>{
    if(!press)return;
    clearTimeout(press.timer);press=null;anchor.classList.remove('radial-pressing');
    if(st?.mode==='gesture')close();
  };
  anchor.addEventListener('pointercancel',cancelPress);
  anchor.addEventListener('lostpointercapture',()=>{if(press?.opened)cancelPress()});
  // Keyboard and screen readers activate the button with a click and no pointer gesture.
  anchor.addEventListener('click',e=>{
    if(!enabled())return;
    e.preventDefault();e.stopPropagation();
    if(st){if(performance.now()-st.openedAt>400)close({focus:true});return}
    open('tap',{keyboard:e.detail===0});
  });
  anchor.addEventListener('keydown',e=>{
    if(!enabled()||st)return;
    if(e.key==='Enter'||e.key===' '||e.key==='ArrowUp'){e.preventDefault();open('tap',{keyboard:true})}
  });
  // iOS: no callout, no text selection, no scroll or bounce while the finger is on the button,
  // and no delayed click once the gesture is handled.
  anchor.addEventListener('contextmenu',e=>{if(enabled())e.preventDefault()});
  anchor.addEventListener('selectstart',e=>{if(enabled())e.preventDefault()});
  anchor.addEventListener('touchmove',e=>{if((press||st)&&e.cancelable)e.preventDefault()},{passive:false});
  anchor.addEventListener('touchend',e=>{if((enabled()||touchHandled)&&e.cancelable)e.preventDefault();touchHandled=false},{passive:false});

  return{
    open:(opts)=>open('tap',opts),
    close,
    isOpen:()=>!!st,
    state:()=>st&&{mode:st.mode,parent:st.parent,hot:st.hot,fit:st.fit,ring2:st.ring2,origin:st.o,items:st.items.map(i=>i.id),children:st.children.map(i=>i.id)}
  };
}

if(typeof module!=='undefined')module.exports={RADIAL,radialMinStep,radialPoint,radialRange,radialAngles,radialFit,radialChildren,radialHit,radialInk};
