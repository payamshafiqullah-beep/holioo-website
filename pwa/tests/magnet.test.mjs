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

test('drop: reacts within 120 px of the center, stronger as the finger gets closer, strongest at the edge',()=>{
  const at=d=>M.magnetDrop({x:shutter.cx,y:shutter.cy-d},shutter);
  assert.deepEqual([...[at(120),at(200)].map(m=>m.tail)],[0,0],'120 px and beyond: at rest');
  const seq=[110,90,70,55,43].map(at);
  for(let i=1;i<seq.length;i++)assert.ok(seq[i].tail>seq[i-1].tail&&seq[i].y<=seq[i-1].y,`closer = stronger (${seq.map(m=>m.tail.toFixed(2)).join(' → ')})`);
  assert.ok(Math.abs(seq.at(-1).tail-1)<1e-9,'full strength at the edge');
  assert.ok(Math.abs(at(43).angle+90)<1e-9,'direction points up (−90° on screen)');
  const c=M.magnetDrop({x:shutter.cx,y:shutter.cy},shutter);
  assert.deepEqual([c.x,c.y,c.along,c.across,c.tail],[0,0,1,1,0],'finger on the very center: no direction, no drop');
  // A finger 100 px away already moves the neighbour a little: the effect reaches 120 px.
  assert.ok(M.magnetDrop({x:flip.cx-100,y:flip.cy},flip).tail>0);
});

test('drop: moves up to 35% of the size (never past the finger), stretches ×1.4 along and ×0.8 across',()=>{
  let maxOff=0,maxAlong=1,minAcross=1,maxTail=0;
  for(let d=0;d<=130;d+=.5){
    const m=M.magnetDrop({x:shutter.cx+d,y:shutter.cy},shutter),off=Math.hypot(m.x,m.y);
    assert.ok(off<=d+1e-9,'never past the finger');
    maxOff=Math.max(maxOff,off);maxAlong=Math.max(maxAlong,m.along);minAcross=Math.min(minAcross,m.across);maxTail=Math.max(maxTail,m.tail);
  }
  assert.ok(maxOff>.3*86&&maxOff<=.35*86+1e-9,`offset up to ${maxOff.toFixed(1)} px`);
  assert.ok(Math.abs(maxAlong-1.4)<1e-9&&Math.abs(minAcross-.8)<1e-9&&Math.abs(maxTail-1)<1e-9,`${maxAlong} / ${minAcross} / ${maxTail}`);
  // Text pills too (Terminé, Importer): strongest at their edge, in any direction.
  const pill=M.magnetShape(rect(0,0,110,44));
  assert.ok(Math.abs(M.magnetDrop({x:55,y:-0.001},pill).tail-1)<1e-3&&Math.abs(M.magnetDrop({x:110.001,y:22},pill).tail-1)<1e-3);
});

test('spring: settles back in ~300–400 ms with a slight overshoot, stable on slow frames',()=>{
  let x=20,v=0,t=0,min=Infinity,settled=null;
  while(t<1){[x,v]=[...M.springStep(x,v,0,1/60)];t+=1/60;min=Math.min(min,x);if(settled===null&&Math.abs(x)<.5&&Math.abs(v)<5)settled=t}
  assert.ok(min<0&&min>-4,`overshoot ${min.toFixed(2)} px`);
  assert.ok(settled>.2&&settled<.45,`settles in ${(settled*1000).toFixed(0)} ms`);
  let y=20,w=0;for(let i=0;i<10;i++)[y,w]=[...M.springStep(y,w,0,.05)];
  assert.ok(Math.abs(y)<3,'20 fps frames: still converges');
});
