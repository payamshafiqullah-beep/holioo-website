'use strict';
// Water drops: round items a finger moves toward (the Capture rapide menu on Accueil — courses,
// then CM / TD / TP…). Every item within 120 px of the finger moves toward it, stretches along
// the finger's direction and points a drop's tail at it — the closer, the stronger — and springs
// back with a slight overshoot when the finger leaves. Visual only: what is chosen stays with the
// menu's own hit testing (ui/radial-menu.js).
//
// Each item holds <span class="mag-blob"></span> (its background: stretches into a drop) and
// <span class="mag-glyph">…</span> (its label: only moves, stays upright and sharp).
// Pure math, tested in tests/magnet.test.mjs: magnetShape, magnetSigned, magnetDrop, springStep.

const MAGNET={
  range:120,       // the drop effect reaches this far (px from the item's center)
  pull:.35,        // the item moves toward the finger by up to 35% of its size
  stretch:.4,      // up to ×1.4 along the finger's direction…
  squeeze:.2,      // …and ×0.8 across it
  tail:.35,        // the side facing the finger: corner radius 50% → 15%, a drop's tail
  glyph:1.12,      // the label leads the drop slightly
  stiffness:420,damping:24   // spring: settles in ~350 ms with a slight overshoot
};

// An item's shape from its box: a circle (w ≈ h) or a stadium (pill).
function magnetShape(r){
  const w=r.width,h=r.height;
  return{cx:r.left+w/2,cy:r.top+h/2,a:w/2,b:h/2,circle:Math.abs(w-h)<4};
}

// Signed distance from p to the item's edge: > 0 outside, < 0 inside.
function magnetSigned(p,g){
  const dx=p.x-g.cx,dy=p.y-g.cy;
  if(g.circle)return Math.hypot(dx,dy)-g.a;
  const wide=g.a>=g.b,r=wide?g.b:g.a,half=(wide?g.a:g.b)-r;
  const along=Math.max(0,Math.abs(wide?dx:dy)-half),across=wide?dy:dx;
  return Math.hypot(along,across)-r;
}

// How an item reacts to a finger at p: offset toward it (px), stretch along the finger's
// direction and squeeze across it, the direction (degrees, screen axes) and the tail (0–1).
// Strength: 0 at `range` px from the center, rising to 1 at the item's edge (the closer, the
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

// Animates round items toward a finger. drops.set([{el, blob, glyph, shape}]) — the items on
// screen now (shape: magnetShape of the item's resting box); drops.point({x,y} | null) — the
// finger, or none (everything springs back); drops.stop(). One requestAnimationFrame loop, only
// while something moves; nothing at all with reduced motion.
function createDrops(){
  const KEYS=['x','y','al','ac','tl'];
  const springs=new Map();          // el → {s: {key: [value, velocity]}, angle, still}
  let list=[],point=null,raf=0,last=0;
  const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const springOf=it=>{let sp=springs.get(it.el);if(!sp){sp={s:{x:[0,0],y:[0,0],al:[1,0],ac:[1,0],tl:[0,0]},angle:0,still:true};springs.set(it.el,sp)}return sp};
  function paint(it,sp){
    const[x,y,al,ac,tl]=KEYS.map(k=>sp.s[k][0]),a=sp.angle,b=it.blob;
    const rest=Math.abs(x)<.05&&Math.abs(y)<.05&&Math.abs(al-1)<.001&&Math.abs(ac-1)<.001&&Math.abs(tl)<.002;
    if(rest){if(!sp.still){sp.still=true;if(b){b.style.transform='';b.style.borderRadius=''}if(it.glyph)it.glyph.style.transform=''}return}
    sp.still=false;
    if(b){
      // rotate → scale → rotate: stretched along the finger's direction; the blob's top-left
      // corner, turned toward the finger, becomes the pointed tail.
      b.style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${a.toFixed(1)}deg) scale(${al.toFixed(4)},${ac.toFixed(4)}) rotate(135deg)`;
      b.style.borderRadius=`${(50-100*MAGNET.tail*Math.max(0,Math.min(1,tl))).toFixed(2)}% 50% 50% 50%`;
    }
    if(it.glyph)it.glyph.style.transform=`translate(${(x*MAGNET.glyph).toFixed(2)}px,${(y*MAGNET.glyph).toFixed(2)}px)`;
  }
  function frame(now){
    raf=0;
    const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;
    let moving=false;
    for(const it of list){
      if(!it.el.isConnected)continue;
      const sp=springOf(it),m=point&&it.shape?magnetDrop(point,it.shape):MAGNET_REST;
      if(m.x||m.y)sp.angle=m.angle;
      const g={x:m.x,y:m.y,al:m.along,ac:m.across,tl:m.tail};
      for(const k of KEYS){
        const[x,v]=springStep(sp.s[k][0],sp.s[k][1],g[k],dt);sp.s[k]=[x,v];
        if(Math.abs(x-g[k])>(k==='x'||k==='y'?.05:k==='tl'?.002:.001)||Math.abs(v)>(k==='x'||k==='y'?.5:.01))moving=true;
        else sp.s[k]=[g[k],0];
      }
      paint(it,sp);
    }
    if(moving)raf=requestAnimationFrame(frame);else last=0;
  }
  const kick=()=>{if(!reduced()&&!raf)raf=requestAnimationFrame(frame)};
  return{
    set(items){list=items;for(const el of[...springs.keys()])if(!items.some(i=>i.el===el))springs.delete(el);kick()},
    point(p){point=p;kick()},
    stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;list=[];point=null;springs.clear()}
  };
}

if(typeof module!=='undefined')module.exports={MAGNET,magnetShape,magnetSigned,magnetDrop,springStep};
