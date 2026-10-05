'use strict';
// Radial menu, component: shared state, haptics and createRadialMenu() (geometry is in radial-geometry.js).
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
