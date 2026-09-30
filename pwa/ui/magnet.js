'use strict';
// Magnetic, liquid buttons (camera screen). Near a finger — pressing and sliding —, a hovering
// Apple Pencil or a mouse, the nearest button is pulled toward the pointer and stretches like a
// water drop; it springs back, with a slight overshoot, when the pointer leaves. The touch area
// reaches a little past each button (the nearest button wins). A button acts only when the
// pointer is released while still attached to it, through its own click handler: what it does
// never changes. Only `transform` is animated, one requestAnimationFrame loop, only while moving.
//
// Reusable: attachMagnets(root, {selector:'.magnet'}); each button holds
//   <span class="mag-blob"></span><span class="mag-glyph">…icon or text…</span>
// The blob (the background) stretches; the glyph only moves, so it stays sharp.
// Pure math, tested in tests/magnet.test.mjs: magnetShape, magnetSigned, magnetNearest, magnetPull, springStep.

const MAGNET={
  reach:1.6,       // attraction / touch radius: 1.6 × the button's radius (≈30% past its edge)
  pull:.3,         // the button moves toward the pointer by up to 30% of its size
  stretch:.25,     // up to ×1.25 along the pull…
  squeeze:.12,     // …and ×0.88 across it
  press:.9,        // squash while pressed
  glyph:1.12,      // the glyph leads the blob slightly
  stiffness:420,damping:24   // spring: settles in ~350 ms with a slight overshoot
};

// A button's shape from its rect: a circle (round buttons) or a stadium (text pills).
function magnetShape(r,opt=MAGNET){
  const w=r.width,h=r.height,min=Math.min(w,h);
  return{cx:r.left+w/2,cy:r.top+h/2,a:w/2,b:h/2,circle:Math.abs(w-h)<4,margin:(opt.reach-1)*min/2,maxPull:opt.pull*min};
}

// Signed distance from p to the button's edge: > 0 outside, < 0 inside.
function magnetSigned(p,g){
  const dx=p.x-g.cx,dy=p.y-g.cy;
  if(g.circle)return Math.hypot(dx,dy)-g.a;
  const wide=g.a>=g.b,r=wide?g.b:g.a,half=(wide?g.a:g.b)-r;
  const along=Math.max(0,Math.abs(wide?dx:dy)-half),across=wide?dy:dx;
  return Math.hypot(along,across)-r;
}

// Index of the button the pointer belongs to: the one it is on, else the nearest edge within
// reach; -1 when none. `shapes` may hold null for buttons that are hidden or disabled.
function magnetNearest(p,shapes){
  let best=-1,bd=Infinity;
  shapes.forEach((g,i)=>{if(!g)return;const d=magnetSigned(p,g);if(d<=g.margin&&d<bd){bd=d;best=i}});
  return best;
}

// How a button reacts to a pointer at p: offset toward it (px), stretch along the pull, squeeze
// across it, and the pull's angle (degrees). Stronger the closer the pointer is; never past it.
const MAGNET_REST={x:0,y:0,along:1,across:1,angle:0};
function magnetPull(p,g,opt=MAGNET){
  const dx=p.x-g.cx,dy=p.y-g.cy,d=Math.hypot(dx,dy),sd=magnetSigned(p,g);
  if(d<1e-6||sd>g.margin)return{...MAGNET_REST};
  const s=sd>0?.55*(1-sd/g.margin):.55+.45*Math.min(1,-sd/Math.min(g.a,g.b));
  const off=Math.min(d*.9,g.maxPull*s),k=off/g.maxPull;
  return{x:dx/d*off,y:dy/d*off,along:1+opt.stretch*k,across:1-opt.squeeze*k,angle:Math.atan2(dy,dx)*180/Math.PI};
}

// One spring step (semi-implicit Euler, in small sub-steps so a slow frame never overshoots wildly).
function springStep(x,v,target,dt,k=MAGNET.stiffness,c=MAGNET.damping){
  const n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;
  for(let i=0;i<n;i++){v+=(k*(target-x)-c*v)*h;x+=v*h}
  return[x,v];
}

// Touches from these never belong to a magnet (they have their own behaviour).
const MAGNET_BLOCK='button,a,input,select,textarea,label,[role="tab"],[role="button"],.cam-sheet,.cam-panel,.cam-notice,.cam-modes,.zoom-chips';

function attachMagnets(root,{selector='.magnet'}={}){
  if(!root||root.dataset.magnets)return null;
  root.dataset.magnets='1';
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const touchEvents='ontouchend'in window;
  const KEYS=['x','y','al','ac','sq'];
  let items=[],measuredAt=0,raf=0,last=0;
  let claim=null;       // the pressing pointer: {id, type, item (null: detached), p}
  let hover=null;       // a hovering pen or mouse: {x, y, item}
  let pending=null;     // a touch released on a button: acts in its touchend (a sure user gesture on iOS)
  let touchEnding=false;// that touchend belongs to a handled press: no browser click for it
  let swallowUntil=0;   // the browser's own click for a press this module already handled

  const usable=el=>el.isConnected&&!el.disabled&&el.offsetParent!==null&&getComputedStyle(el).visibility!=='hidden';
  function measure(){
    const els=[...root.querySelectorAll(selector)];
    items=els.map(el=>{
      const it=items.find(i=>i.el===el)||{el,s:{x:[0,0],y:[0,0],al:[1,0],ac:[1,0],sq:[1,0]},angle:0,still:true};
      it.blob=el.querySelector('.mag-blob');it.glyph=el.querySelector('.mag-glyph');
      it.shape=usable(el)?magnetShape(el.getBoundingClientRect()):null;
      return it;
    });
    measuredAt=performance.now();
  }
  const nearest=p=>{const k=magnetNearest(p,items.map(i=>i.shape));return k<0?null:items[k]};

  function goal(it){
    const p=claim?(claim.item===it?claim.p:null):hover?.item===it?hover:null;
    const m=p&&it.shape?magnetPull(p,it.shape):MAGNET_REST;
    if(m.x||m.y)it.angle=m.angle;
    // Pressed: a quick squash, which gives way to the drop stretch as the finger pulls away.
    const k=(m.along-1)/MAGNET.stretch;
    return{x:m.x,y:m.y,al:m.along,ac:m.across,sq:claim?.item===it?1-(1-MAGNET.press)*(1-k):1};
  }
  function paint(it){
    const[x,y,al,ac,sq]=KEYS.map(k=>it.s[k][0]),a=it.angle;
    const rest=Math.abs(x)<.05&&Math.abs(y)<.05&&Math.abs(al-1)<.001&&Math.abs(ac-1)<.001&&Math.abs(sq-1)<.001;
    if(rest){if(!it.still){it.still=true;if(it.blob)it.blob.style.transform='';if(it.glyph)it.glyph.style.transform=''}return}
    it.still=false;
    if(it.blob)it.blob.style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${a.toFixed(1)}deg) scale(${(al*sq).toFixed(4)},${(ac*sq).toFixed(4)}) rotate(${(-a).toFixed(1)}deg)`;
    if(it.glyph)it.glyph.style.transform=`translate(${(x*MAGNET.glyph).toFixed(2)}px,${(y*MAGNET.glyph).toFixed(2)}px) scale(${sq.toFixed(4)})`;
  }
  function frame(now){
    raf=0;
    if(!root.isConnected)return;
    const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;
    let moving=false;
    for(const it of items){
      const g=goal(it);
      for(const k of KEYS){
        const[x,v]=springStep(it.s[k][0],it.s[k][1],g[k],dt);it.s[k]=[x,v];
        if(Math.abs(x-g[k])>(k==='x'||k==='y'?.05:.001)||Math.abs(v)>(k==='x'||k==='y'?.5:.01))moving=true;
        else it.s[k]=[g[k],0];
      }
      paint(it);
    }
    if(moving)raf=requestAnimationFrame(frame);else last=0;
  }
  // Reduced motion: no movement at all — the larger buttons and touch areas still work.
  const kick=()=>{if(!reduced()&&!raf)raf=requestAnimationFrame(frame)};

  function act(it){
    if(!it||!usable(it.el))return;
    it.el.click();                                  // its usual action (isTrusted false: not swallowed)
  }

  root.addEventListener('pointerdown',e=>{
    if(pending){const it=pending;pending=null;act(it)}    // a touchend never came: act anyway
    touchEnding=false;swallowUntil=0;                     // an earlier press's own click came already
    if(!e.isPrimary){if(claim){claim=null;kick()}return}  // a second finger (pinch to zoom): no button
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const direct=e.target.closest?.(selector);
    if(!direct&&e.target.closest?.(MAGNET_BLOCK))return;
    measure();
    const p={x:e.clientX,y:e.clientY};
    let it;
    if(direct){it=items.find(i=>i.el===direct);if(!it?.shape)return}   // a disabled button stays inert
    else it=nearest(p);
    if(!it)return;
    claim={id:e.pointerId,type:e.pointerType,item:it,p};hover=null;
    if(e.pointerType==='mouse')e.preventDefault();
    kick();
  });
  root.addEventListener('pointermove',e=>{
    const p={x:e.clientX,y:e.clientY};
    if(claim){
      if(e.pointerId!==claim.id)return;
      claim.p=p;claim.item=nearest(p);                // attached to the nearest button in reach, or none
      kick();return;
    }
    if(e.pointerType==='touch'||e.buttons)return;     // hover: a pen or a mouse, nothing pressed
    if(performance.now()-measuredAt>500)measure();
    const it=nearest(p);
    hover=it?{...p,item:it}:null;
    kick();
  });
  root.addEventListener('pointerup',e=>{
    if(!claim||e.pointerId!==claim.id)return;
    const{item,type}=claim;claim=null;kick();
    if(type!=='mouse'&&touchEvents){touchEnding=true;pending=item;return}   // acts in the touchend
    swallowUntil=performance.now()+600;               // the mouse's own click, right after
    act(item);                                        // (null: slid away from every button — nothing)
  });
  root.addEventListener('pointercancel',e=>{if(claim&&e.pointerId===claim.id){claim=null;kick()}});
  root.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'&&hover){hover=null;kick()}});
  // The touch that ends a handled press: no browser click (no double action, no tap-to-focus), and
  // the action runs here, inside the touchend.
  root.addEventListener('touchend',e=>{
    if(!touchEnding)return;
    touchEnding=false;
    if(e.cancelable)e.preventDefault();               // cancels the browser's click: nothing to swallow later
    const it=pending;pending=null;act(it);
  },{passive:false});
  root.addEventListener('touchcancel',()=>{pending=null;touchEnding=false;if(claim){claim=null;kick()}});
  root.addEventListener('click',e=>{
    if(e.isTrusted&&performance.now()<swallowUntil){swallowUntil=0;e.preventDefault();e.stopImmediatePropagation()}
  },true);

  return{measure,state:()=>({claim:claim&&{item:claim.item?.el.id||null},hover:hover?.item.el.id||null})};
}

if(typeof module!=='undefined')module.exports={MAGNET,magnetShape,magnetSigned,magnetNearest,magnetPull,springStep};
