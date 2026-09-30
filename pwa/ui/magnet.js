'use strict';
// Magnetic, liquid buttons (camera screen). A finger anywhere on the screen — pressed and moving —,
// a hovering Apple Pencil or a mouse: every button within 120 px is pulled toward it and stretches
// like a water drop, its side facing the finger pointed like a drop's tail; it springs back, with
// a slight overshoot, when the pointer leaves. The touch area for the action reaches a little
// past each button (the nearest button wins). A button acts only when the pointer is released
// while attached to it, through its own click handler: what it does never changes. One
// requestAnimationFrame loop, only while something moves.
//
// Reusable: attachMagnets(root, {selector:'.magnet'}); each button holds
//   <span class="mag-blob"></span><span class="mag-glyph">…icon or text…</span>
// The blob (the background) stretches; the glyph only moves, so it stays sharp and upright.
// Pure math, tested in tests/magnet.test.mjs: magnetShape, magnetSigned, magnetNearest, magnetDrop, springStep.

const MAGNET={
  reach:1.6,       // touch area for the action: 1.6 × the button's radius (≈30% past its edge)
  range:120,       // the drop effect reaches this far (px from the button's center)
  pull:.35,        // the button moves toward the finger by up to 35% of its size
  stretch:.4,      // up to ×1.4 along the finger's direction…
  squeeze:.2,      // …and ×0.8 across it
  tail:.35,        // the side facing the finger: corner radius 50% → 15%, a drop's tail
  press:.9,        // squash while pressed
  glyph:1.12,      // the glyph leads the blob slightly
  stiffness:420,damping:24   // spring: settles in ~350 ms with a slight overshoot
};

// A button's shape from its rect: a circle (round buttons) or a stadium (text pills).
function magnetShape(r,opt=MAGNET){
  const w=r.width,h=r.height,min=Math.min(w,h);
  return{cx:r.left+w/2,cy:r.top+h/2,a:w/2,b:h/2,circle:Math.abs(w-h)<4,margin:(opt.reach-1)*min/2};
}

// Signed distance from p to the button's edge: > 0 outside, < 0 inside.
function magnetSigned(p,g){
  const dx=p.x-g.cx,dy=p.y-g.cy;
  if(g.circle)return Math.hypot(dx,dy)-g.a;
  const wide=g.a>=g.b,r=wide?g.b:g.a,half=(wide?g.a:g.b)-r;
  const along=Math.max(0,Math.abs(wide?dx:dy)-half),across=wide?dy:dx;
  return Math.hypot(along,across)-r;
}

// Index of the button the pointer belongs to (for the action): the one it is on, else the
// nearest edge within reach; -1 when none. `shapes` may hold null for hidden or disabled buttons.
function magnetNearest(p,shapes){
  let best=-1,bd=Infinity;
  shapes.forEach((g,i)=>{if(!g)return;const d=magnetSigned(p,g);if(d<=g.margin&&d<bd){bd=d;best=i}});
  return best;
}

// How a button reacts to a finger at p: offset toward it (px), stretch along the finger's
// direction and squeeze across it, the direction (degrees, screen axes) and the tail (0–1).
// Strength: 0 at `range` px from the center, rising to 1 at the button's edge (the closer, the
// stronger), back to 0 at the very center where there is no direction. Never past the finger.
const MAGNET_REST={x:0,y:0,along:1,across:1,angle:0,tail:0};
function magnetDrop(p,g,opt=MAGNET){
  const dx=p.x-g.cx,dy=p.y-g.cy,d=Math.hypot(dx,dy);
  if(d<1e-6||d>=opt.range)return{...MAGNET_REST};
  const r=Math.min(g.a,g.b),sd=magnetSigned(p,g),edge=d-sd;          // center → edge in this direction
  const lin=sd<=0?Math.max(0,1+sd/r):Math.max(0,1-sd/Math.max(1,opt.range-edge));
  const s=lin*lin*(3-2*lin),off=Math.min(d*.9,opt.pull*2*r*s);
  return{x:dx/d*off,y:dy/d*off,along:1+opt.stretch*s,across:1-opt.squeeze*s,angle:Math.atan2(dy,dx)*180/Math.PI,tail:s};
}

// One spring step (semi-implicit Euler, in small sub-steps so a slow frame never overshoots wildly).
function springStep(x,v,target,dt,k=MAGNET.stiffness,c=MAGNET.damping){
  const n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;
  for(let i=0;i<n;i++){v+=(k*(target-x)-c*v)*h;x+=v*h}
  return[x,v];
}

// Touches from these never become a button's action (they have their own behaviour).
const MAGNET_BLOCK='button,a,input,select,textarea,label,[role="tab"],[role="button"],.cam-sheet,.cam-panel,.cam-notice,.cam-modes,.zoom-chips';

function attachMagnets(root,{selector='.magnet'}={}){
  if(!root||root.dataset.magnets)return null;
  root.dataset.magnets='1';
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const touchEvents='ontouchend'in window;
  const KEYS=['x','y','al','ac','sq','tl'];
  let items=[],measuredAt=0,raf=0,last=0;
  let track=null;       // the pointer pressed anywhere on the screen: {id, p} — the drops follow it
  let multi=false;      // a second finger is down (pinch to zoom): no drops, no button
  let claim=null;       // the button that pointer is attached to, for the action: {id, type, item (null: none)}
  let hover=null;       // a hovering pen or mouse: {x, y}
  let pending=null;     // a touch released on a button: acts in its touchend (a sure user gesture on iOS)
  let touchEnding=false;// that touchend belongs to a handled press: no browser click for it
  let swallowUntil=0;   // the browser's own click for a press this module already handled

  const usable=el=>el.isConnected&&!el.disabled&&el.offsetParent!==null&&getComputedStyle(el).visibility!=='hidden';
  function measure(){
    const els=[...root.querySelectorAll(selector)];
    items=els.map(el=>{
      const it=items.find(i=>i.el===el)||{el,s:{x:[0,0],y:[0,0],al:[1,0],ac:[1,0],sq:[1,0],tl:[0,0]},angle:0,still:true};
      it.blob=el.querySelector('.mag-blob');it.glyph=el.querySelector('.mag-glyph');
      it.shape=usable(el)?magnetShape(el.getBoundingClientRect()):null;
      // Round blob: the tail is one corner turned toward the finger. Other shapes: the corners
      // facing the finger get sharper. (Base radius read at rest, when no inline radius is set.)
      if(it.blob&&it.still){
        const br=getComputedStyle(it.blob).borderTopLeftRadius,v=parseFloat(br)||0,w=el.offsetWidth,h=el.offsetHeight,pct=/%$/.test(br);
        it.round=pct?v>=50:Math.abs(w-h)<4&&v>=Math.min(w,h)/2-1;
        it.baseR=pct?v/100*Math.min(w,h):v;
      }
      return it;
    });
    measuredAt=performance.now();
  }
  const nearest=p=>{const k=magnetNearest(p,items.map(i=>i.shape));return k<0?null:items[k]};

  function goal(it){
    const p=multi?null:track?.p||hover;
    const m=p&&it.shape?magnetDrop(p,it.shape):MAGNET_REST;
    if(m.x||m.y)it.angle=m.angle;
    // Pressed: a quick squash, which gives way to the drop stretch as the finger pulls away.
    return{x:m.x,y:m.y,al:m.along,ac:m.across,sq:claim?.item===it?1-(1-MAGNET.press)*(1-m.tail):1,tl:m.tail};
  }
  function paint(it){
    const[x,y,al,ac,sq,tl]=KEYS.map(k=>it.s[k][0]),a=it.angle,b=it.blob;
    const rest=Math.abs(x)<.05&&Math.abs(y)<.05&&Math.abs(al-1)<.001&&Math.abs(ac-1)<.001&&Math.abs(sq-1)<.001&&Math.abs(tl)<.002;
    if(rest){if(!it.still){it.still=true;if(b){b.style.transform='';b.style.borderRadius=''}if(it.glyph)it.glyph.style.transform=''}return}
    it.still=false;
    const t=Math.max(0,Math.min(1,tl));
    const move=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${a.toFixed(1)}deg) scale(${(al*sq).toFixed(4)},${(ac*sq).toFixed(4)})`;
    if(b&&it.round){
      // rotate → scale → rotate: stretched along the finger's direction, the blob's top-left corner
      // turned toward the finger becomes the pointed tail.
      b.style.transform=`${move} rotate(135deg)`;
      b.style.borderRadius=`${(50-100*MAGNET.tail*t).toFixed(2)}% 50% 50% 50%`;
    }else if(b){
      b.style.transform=`${move} rotate(${(-a).toFixed(1)}deg)`;
      const corner=c=>(it.baseR*(1-2*MAGNET.tail*t*Math.max(0,Math.cos((a-c)*Math.PI/180))**3)).toFixed(2);
      b.style.borderRadius=`${corner(225)}px ${corner(315)}px ${corner(45)}px ${corner(135)}px`;
    }
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
        if(Math.abs(x-g[k])>(k==='x'||k==='y'?.05:k==='tl'?.002:.001)||Math.abs(v)>(k==='x'||k==='y'?.5:.01))moving=true;
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

  // The whole camera screen listens (it has touch-action:none, so iOS keeps sending pointermove):
  // the drops follow a finger that went down anywhere, except on the sheets and panels over it.
  root.addEventListener('pointerdown',e=>{
    if(pending){const it=pending;pending=null;act(it)}    // a touchend never came: act anyway
    touchEnding=false;swallowUntil=0;                     // an earlier press's own click came already
    if(!e.isPrimary){multi=true;track=null;claim=null;kick();return}   // a second finger (pinch to zoom)
    multi=false;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(e.target.closest?.('.cam-sheet,.cam-panel'))return;
    measure();
    const p={x:e.clientX,y:e.clientY};
    track={id:e.pointerId,p};hover=null;
    // The action: pressed on a button, or elsewhere on the screen but not on another control (modes,
    // zoom, destination…) — then it attaches to a button once the finger is within its touch area.
    const direct=e.target.closest?.(selector);
    if(direct){const it=items.find(i=>i.el===direct);if(it?.shape)claim={id:e.pointerId,type:e.pointerType,item:it}}   // a disabled button stays inert
    else if(!e.target.closest?.(MAGNET_BLOCK))claim={id:e.pointerId,type:e.pointerType,item:nearest(p)};
    if(e.pointerType==='mouse'&&claim?.item)e.preventDefault();
    kick();
  });
  root.addEventListener('pointermove',e=>{
    const p={x:e.clientX,y:e.clientY};
    if(track){
      if(e.pointerId!==track.id||multi)return;
      track.p=p;
      if(claim)claim.item=nearest(p);                 // attached to the nearest button in its touch area, or none
      kick();return;
    }
    if(e.pointerType==='touch'||e.buttons)return;     // hover: a pen or a mouse, nothing pressed
    if(performance.now()-measuredAt>500)measure();
    hover=p;
    kick();
  });
  root.addEventListener('pointerup',e=>{
    if(!track||e.pointerId!==track.id)return;
    const c=claim;track=null;claim=null;kick();
    if(!c?.item)return;                               // not on a button: nothing (a tap on the preview stays a focus tap)
    if(c.type!=='mouse'&&touchEvents){touchEnding=true;pending=c.item;return}   // acts in the touchend
    swallowUntil=performance.now()+600;               // the mouse's own click, right after
    act(c.item);
  });
  root.addEventListener('pointercancel',e=>{if(track&&e.pointerId===track.id){track=null;claim=null;kick()}});
  root.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'&&hover){hover=null;kick()}});
  // The touch that ends a handled press: no browser click (no double action, no tap-to-focus), and
  // the action runs here, inside the touchend.
  root.addEventListener('touchend',e=>{
    if(!touchEnding)return;
    touchEnding=false;
    if(e.cancelable)e.preventDefault();               // cancels the browser's click: nothing to swallow later
    const it=pending;pending=null;act(it);
  },{passive:false});
  root.addEventListener('touchcancel',()=>{pending=null;touchEnding=false;track=null;claim=null;kick()});
  root.addEventListener('click',e=>{
    if(e.isTrusted&&performance.now()<swallowUntil){swallowUntil=0;e.preventDefault();e.stopImmediatePropagation()}
  },true);

  return{measure,state:()=>({claim:claim&&{item:claim.item?.el.id||null},tracking:!!track,hover:!!hover})};
}

if(typeof module!=='undefined')module.exports={MAGNET,magnetShape,magnetSigned,magnetNearest,magnetDrop,springStep};
