// Scanner logic (features/scan-core.js): corner order, smooth tracking, auto-capture decisions,
// book split, ID card layout, tilt hint, screen mapping. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};ctx.self=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../features/scan-core.js',import.meta.url),'utf8'),ctx);
const C=ctx.ScanCore;
const plain=v=>JSON.parse(JSON.stringify(v));
const Q=[[.2,.1],[.8,.12],[.85,.9],[.15,.88]];

test('corners are ordered TL, TR, BR, BL from any order, even for a turned page',()=>{
  assert.deepEqual(plain(C.orderQuad([Q[2],Q[0],Q[3],Q[1]])),Q);
  const turned=[[.5,.05],[.95,.5],[.5,.95],[.05,.5]]; // a diamond
  const o=C.orderQuad([turned[2],turned[1],turned[3],turned[0]]);
  assert.equal(C.isConvex(o),true);
  assert.equal(C.orderQuad([[0,0],[1,0]]),null);
});

test('plausible pages only: convex, big enough, no needle corners',()=>{
  assert.equal(C.quadValid(Q,{minArea:.2}),true);
  assert.equal(C.quadValid([[.4,.4],[.5,.4],[.5,.5],[.4,.5]],{minArea:.2}),false,'too small');
  assert.equal(C.quadValid([[.1,.1],[.9,.1],[.2,.2],[.1,.9]],{minArea:.01}),false,'not convex');
  assert.equal(C.quadValid([[.05,.5],[.9,.3],[.95,.5],[.9,.7]],{minArea:.001}),false,'needle corner');
});

test('tracking: small jitter is smoothed, a jump needs confirmation, a lost page disappears',()=>{
  const tr=C.createTracker();
  let s=tr.update(Q,0);assert.equal(s.visible,false,'one frame is not enough');
  s=tr.update(Q,100);assert.equal(s.visible,true);
  const jitter=Q.map(([x,y])=>[x+.01,y-.01]);
  s=tr.update(jitter,200);
  assert.ok(Math.abs(s.quad[0][0]-(.2+.0035))<1e-6,'moves only part of the way (smooth)');
  const far=Q.map(([x,y])=>[x+.3,y]);
  s=tr.update(far,300);assert.ok(Math.abs(s.quad[0][0]-.2)<.02,'a single far detection is ignored');
  s=tr.update(far,400);assert.ok(Math.abs(s.quad[0][0]-.5)<1e-9,'confirmed twice → jumps');
  for(let t=500;t<900;t+=100)s=tr.update(null,t);
  assert.equal(s.visible,false,'lost after several misses');
});

test('stable after about a second held still; moving resets it',()=>{
  const tr=C.createTracker({stableMs:1000});let s;
  for(let t=0;t<=1100;t+=100)s=tr.update(Q.map(([x,y])=>[x+(t%200?.003:0),y]),t);
  assert.equal(s.stable,true);
  s=tr.update(Q.map(([x,y])=>[x+.05,y]),1200);
  assert.equal(s.stable,false);
});

test('auto-capture: once per page, only when stable and sharp, never twice in a row',()=>{
  const ac=C.createAutoCapture({cooldownMs:1500});
  const ok={ok:true};
  assert.equal(ac.decide({quad:Q,stable:true,quality:ok,t:1000,enabled:false}),false,'manual mode');
  assert.equal(ac.decide({quad:Q,stable:false,quality:ok,t:1000,enabled:true}),false,'not stable');
  assert.equal(ac.decide({quad:Q,stable:true,quality:{ok:false,warn:'blur'},t:1000,enabled:true}),false,'blurred');
  assert.equal(ac.decide({quad:Q,stable:true,quality:ok,t:1000,enabled:true}),true);
  assert.equal(ac.decide({quad:Q,stable:true,quality:ok,t:4000,enabled:true}),false,'same page, still there');
  ac.decide({quad:null,t:4100,enabled:true}); // the page is turned: it leaves the frame
  assert.equal(ac.decide({quad:Q,stable:true,quality:ok,t:5000,enabled:true}),true,'next page');
});

test('frame ↔ editor coordinates round-trip',()=>{
  const e=C.toEditQuad(Q,1920,1080);
  assert.ok(Math.abs(e[2][1]-.9*1080/1920)<1e-12);
  const back=C.fromEditQuad(e,1920,1080);
  back.forEach((p,i)=>{assert.ok(Math.abs(p[0]-Q[i][0])<1e-12&&Math.abs(p[1]-Q[i][1])<1e-12)});
});

test('book spread is split into two pages that share the fold',()=>{
  const[l,r]=C.splitSpread(Q,.5);
  assert.deepEqual(plain(l[1]),plain(r[0]));assert.deepEqual(plain(l[2]),plain(r[3]));
  assert.deepEqual(plain(l[0]),Q[0]);assert.deepEqual(plain(r[2]),Q[2]);
  assert.equal(C.findGutter(Q,()=>200),.5,'flat spread without a visible fold: cut in the middle');
});

test('A4 snapping and ID card layout at true size',()=>{
  const nearA4=[[0,0],[1,0],[1,1.38],[0,1.38]];
  assert.ok(Math.abs(C.pageRatio(nearA4,{snap:'a4'})-Math.SQRT2)<1e-12);
  assert.ok(Math.abs(C.pageRatio([[0,0],[1,0],[1,1],[0,1]],{snap:'a4'})-1)<1e-12,'a square stays square');
  const L=C.idCardLayout(2100,2970); // 10 px per mm
  assert.ok(Math.abs(L.front.w-856)<1e-9&&Math.abs(L.front.h-540)<1e-9);
  assert.ok(L.front.y+L.front.h<L.back.y,'front above back, no overlap');
});

test('tilt hint: flat phone for documents, upright phone for boards',()=>{
  assert.equal(C.tiltHint(3,-4,'document'),null);
  assert.equal(C.tiltHint(35,0,'document'),'tilt');
  assert.equal(C.tiltHint(88,5,'board'),null);
  assert.equal(C.tiltHint(50,0,'board'),'tilt');
  assert.equal(C.tiltHint(null,null,'document'),null,'no sensor: no hint');
});

test('screen mapping follows object-fit: cover and zoom',()=>{
  // 1920×1080 video in a 390×844 portrait screen: scaled to the height, cropped left/right.
  const [p]=C.mapToScreen([[.5,.5]],{videoW:1920,videoH:1080,elW:390,elH:844});
  assert.ok(Math.abs(p[0]-195)<1e-9&&Math.abs(p[1]-422)<1e-9,'centre stays centre');
  const [tl]=C.mapToScreen([[0,0]],{videoW:1080,videoH:1920,elW:390,elH:844});
  assert.ok(Math.abs(tl[1])<1e-9,'top of a portrait video at the top');
  const [z]=C.mapToScreen([[0,0]],{videoW:1080,videoH:1920,elW:390,elH:844,zoom:2});
  assert.ok(z[0]<tl[0]&&z[1]<tl[1],'zoom pushes corners outward');
});
