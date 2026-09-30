// Magnetic camera buttons (ui/magnet.js): touch areas, nearest button, pull / stretch, spring.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../ui/magnet.js',import.meta.url),'utf8'),ctx);
const M=ctx.module.exports;
const rect=(x,y,w,h)=>({left:x,top:y,width:w,height:h});

// Camera bottom row on a 390 px phone: last photo (66), shutter (86), switch camera (66).
const last=M.magnetShape(rect(52,700,66,66)),shutter=M.magnetShape(rect(152,690,86,86)),flip=M.magnetShape(rect(272,700,66,66));
const row=[last,shutter,flip];

test('touch area: 1.6× the radius, i.e. about 30% past the edge (at least 56 px wide)',()=>{
  assert.equal(M.magnetSigned({x:shutter.cx,y:shutter.cy},shutter),-43);
  assert.ok(Math.abs(shutter.margin-.6*43)<1e-9);
  for(const g of row)assert.ok(2*(g.a+g.margin)>=56);
  const pill=M.magnetShape(rect(0,0,110,44));
  assert.equal(pill.circle,false);assert.ok(2*(pill.b+pill.margin)>=56,'a 44 px pill still has a 56 px touch area');
  assert.ok(Math.abs(M.magnetSigned({x:55,y:-10},pill)-10)<1e-9,'above the middle of the pill: 10 px away');
  assert.ok(Math.abs(M.magnetSigned({x:-10,y:22},pill)-10)<1e-9,'left of the rounded end: 10 px away');
});

test('the button under the finger wins; slightly outside still counts; the nearest edge wins between two',()=>{
  assert.equal(M.magnetNearest({x:shutter.cx+30,y:shutter.cy},row),1,'on the shutter');
  assert.equal(M.magnetNearest({x:shutter.cx,y:shutter.cy-43-20},row),1,'20 px above the shutter');
  assert.equal(M.magnetNearest({x:shutter.cx,y:shutter.cy-43-30},row),-1,'30 px above: too far, nothing');
  assert.equal(M.magnetNearest({x:132,y:733},row),0,'between last photo and shutter, nearer the last photo');
  assert.equal(M.magnetNearest({x:146,y:733},row),1,'a little further right: the shutter');
  assert.equal(M.magnetNearest({x:shutter.cx,y:shutter.cy},[null,null,flip]),-1,'hidden / disabled buttons never take a touch');
});

test('pull: toward the pointer, stronger when closer, never more than 30% of the size nor past the finger',()=>{
  const far=M.magnetPull({x:shutter.cx,y:shutter.cy-43-20},shutter);
  const edge=M.magnetPull({x:shutter.cx,y:shutter.cy-43},shutter);
  const near=M.magnetPull({x:shutter.cx,y:shutter.cy-25},shutter);
  assert.ok(far.y<0&&edge.y<far.y&&near.y<=edge.y,`${far.y.toFixed(1)} → ${edge.y.toFixed(1)} → ${near.y.toFixed(1)}`);
  for(const m of [far,edge,near])assert.ok(Math.hypot(m.x,m.y)<=.3*86+1e-9);
  assert.ok(Math.abs(near.y)<=25*.9+1e-9,'not past the finger');
  assert.ok(Math.abs(near.angle+90)<1e-9,'pull angle points up (−90° on screen)');
  const center=M.magnetPull({x:shutter.cx,y:shutter.cy},shutter);
  assert.deepEqual([center.x,center.y,center.along,center.across],[0,0,1,1],'finger on the center: no pull');
  const out=M.magnetPull({x:shutter.cx,y:shutter.cy-200},shutter);
  assert.deepEqual([out.x,out.y,out.along,out.across],[0,0,1,1],'out of reach: at rest');
});

test('water-drop stretch: up to ×1.25 along the pull and ×0.88 across',()=>{
  let maxAlong=1,minAcross=1;
  for(let d=0;d<=80;d+=1){const m=M.magnetPull({x:shutter.cx+d,y:shutter.cy},shutter);maxAlong=Math.max(maxAlong,m.along);minAcross=Math.min(minAcross,m.across)}
  assert.ok(maxAlong>1.15&&maxAlong<=1.25+1e-9,String(maxAlong));
  assert.ok(minAcross<.93&&minAcross>=.88-1e-9,String(minAcross));
});

test('spring: settles back in ~300–400 ms with a slight overshoot, stable on slow frames',()=>{
  let x=20,v=0,t=0,min=Infinity,settled=null;
  while(t<1){[x,v]=[...M.springStep(x,v,0,1/60)];t+=1/60;min=Math.min(min,x);if(settled===null&&Math.abs(x)<.5&&Math.abs(v)<5)settled=t}
  assert.ok(min<0&&min>-4,`overshoot ${min.toFixed(2)} px`);
  assert.ok(settled>.2&&settled<.45,`settles in ${(settled*1000).toFixed(0)} ms`);
  let y=20,w=0;for(let i=0;i<10;i++)[y,w]=[...M.springStep(y,w,0,.05)];
  assert.ok(Math.abs(y)<3,'20 fps frames: still converges');
});
