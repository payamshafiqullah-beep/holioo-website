// Water drops of the Capture rapide menu (ui/magnet.js): reach, strength, shape limits, spring.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../ui/magnet.js',import.meta.url),'utf8'),ctx);
const M=ctx.module.exports;
const rect=(x,y,w,h)=>({left:x,top:y,width:w,height:h});

// Two course circles of the menu (56 px), 66 px apart.
const course=M.magnetShape(rect(100,300,56,56)),next=M.magnetShape(rect(166,300,56,56));

test('shape: circles by their radius, pills as stadiums',()=>{
  assert.equal(M.magnetSigned({x:course.cx,y:course.cy},course),-28);
  assert.equal(M.magnetSigned({x:course.cx+40,y:course.cy},course),12);
  const pill=M.magnetShape(rect(0,0,110,44));
  assert.equal(pill.circle,false);
  assert.ok(Math.abs(M.magnetSigned({x:55,y:-10},pill)-10)<1e-9,'above the middle of the pill: 10 px away');
  assert.ok(Math.abs(M.magnetSigned({x:-10,y:22},pill)-10)<1e-9,'left of the rounded end: 10 px away');
});

test('drop: reacts within 120 px of the center, stronger as the finger gets closer, strongest at the edge',()=>{
  const at=d=>M.magnetDrop({x:course.cx,y:course.cy-d},course);
  assert.deepEqual([...[at(120),at(200)].map(m=>m.tail)],[0,0],'120 px and beyond: at rest');
  const seq=[110,90,70,50,28].map(at);
  for(let i=1;i<seq.length;i++)assert.ok(seq[i].tail>seq[i-1].tail&&seq[i].y<=seq[i-1].y,`closer = stronger (${seq.map(m=>m.tail.toFixed(2)).join(' → ')})`);
  assert.ok(Math.abs(seq.at(-1).tail-1)<1e-9,'full strength at the edge');
  assert.ok(Math.abs(at(28).angle+90)<1e-9,'direction points up (−90° on screen)');
  const c=M.magnetDrop({x:course.cx,y:course.cy},course);
  assert.deepEqual([c.x,c.y,c.along,c.across,c.tail],[0,0,1,1,0],'finger on the very center: no direction, no drop');
  // The neighbour reaches for the same finger too, less.
  const p={x:course.cx+30,y:course.cy},a=M.magnetDrop(p,course),b=M.magnetDrop(p,next);
  assert.ok(a.tail>b.tail&&b.tail>0&&a.x>0&&b.x<0,'both lean toward the finger, the nearer one more');
});

test('drop: moves up to 35% of the size (never past the finger), stretches ×1.4 along and ×0.8 across',()=>{
  let maxOff=0,maxAlong=1,minAcross=1,maxTail=0;
  for(let d=0;d<=130;d+=.5){
    const m=M.magnetDrop({x:course.cx+d,y:course.cy},course),off=Math.hypot(m.x,m.y);
    assert.ok(off<=d+1e-9,'never past the finger');
    maxOff=Math.max(maxOff,off);maxAlong=Math.max(maxAlong,m.along);minAcross=Math.min(minAcross,m.across);maxTail=Math.max(maxTail,m.tail);
  }
  assert.ok(maxOff>.3*56&&maxOff<=.35*56+1e-9,`offset up to ${maxOff.toFixed(1)} px`);
  assert.ok(Math.abs(maxAlong-1.4)<1e-9&&Math.abs(minAcross-.8)<1e-9&&Math.abs(maxTail-1)<1e-9,`${maxAlong} / ${minAcross} / ${maxTail}`);
});

test('spring: settles back in ~300–400 ms with a slight overshoot, stable on slow frames',()=>{
  let x=20,v=0,t=0,min=Infinity,settled=null;
  while(t<1){[x,v]=[...M.springStep(x,v,0,1/60)];t+=1/60;min=Math.min(min,x);if(settled===null&&Math.abs(x)<.5&&Math.abs(v)<5)settled=t}
  assert.ok(min<0&&min>-4,`overshoot ${min.toFixed(2)} px`);
  assert.ok(settled>.2&&settled<.45,`settles in ${(settled*1000).toFixed(0)} ms`);
  let y=20,w=0;for(let i=0;i<10;i++)[y,w]=[...M.springStep(y,w,0,.05)];
  assert.ok(Math.abs(y)<3,'20 fps frames: still converges');
});
