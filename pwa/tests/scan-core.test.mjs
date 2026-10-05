// Scanner logic (features/scanner/scan-core.js): corner order, smooth tracking, auto-capture decisions,
// book split, ID card layout, tilt hint, screen mapping. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};ctx.self=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../features/scanner/scan-core.js',import.meta.url),'utf8'),ctx);
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

test('confidence: edges, a clear step, size and shape raise it; a bare side, a cut-off or a reflection lower it',()=>{
  const good={support:.95,contrast:40,coverage:.3,minArea:.08,quad:Q,aspect:.75,weak:.9};
  const c=C.confidence(good);
  assert.ok(c>.9&&c<=1,`good ${c}`);
  assert.ok(C.confidence({...good,support:.4})<.8,'weak edges: doubtful (under 80 %)');
  assert.ok(C.confidence({...good,weak:0})<c*.7,'one side with no edge at all');
  assert.ok(C.confidence({...good,through:2})<c,'edges that go on past the corners');
  assert.ok(C.confidence({...good,cutoff:true})<c&&C.confidence({...good,glare:true})<c);
  assert.ok(C.confidence({...good,quad:[[.1,.1],[.9,.1],[.2,.2],[.1,.9]]})<c,'a needle-thin corner');
  assert.doesNotThrow(()=>C.confidence({}));
  for(const v of[C.confidence({support:9,contrast:999,coverage:9,minArea:.01,quad:Q}),C.confidence({support:-1,contrast:0,coverage:0})])assert.ok(v>=0&&v<=1);
});

test('board frames the detector is not sure of are never auto-captured (the shutter still works)',()=>{
  const ok={sharpness:200,brightness:140,support:.9};
  assert.deepEqual(plain(C.judgeFrame({...ok,confidence:.9},'board')),{ok:true,warn:null});
  assert.deepEqual(plain(C.judgeFrame({...ok,confidence:.5},'board')),{ok:false,warn:'lowconf'});
  assert.equal(C.judgeFrame({...ok,confidence:.5},'document').ok,true,'documents are unchanged');
  assert.equal(C.judgeFrame(ok,'board').ok,true,'no confidence given: unchanged');
});

test('a point dragged on the preview maps back to the same frame point (corners by hand)',()=>{
  const view={videoW:1920,videoH:1080,elW:390,elH:700,zoom:1.6,crop:{x:240,y:135,w:1440,h:810}};
  for(const p of[[.1,.2],[.5,.5],[.93,.81]]){
    const [sx,sy]=C.mapToScreen([p],view)[0],back=C.mapFromScreen([sx,sy],view);
    assert.ok(Math.abs(back[0]-p[0])<1e-9&&Math.abs(back[1]-p[1])<1e-9,`${p} → ${back}`);
  }
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

test('frame judgement: dark, blur, page cut off or too far block the auto-capture; a reflection only warns',()=>{
  const good={sharpness:300,brightness:130};
  assert.deepEqual(plain(C.judgeFrame(good)),{ok:true,warn:null});
  assert.equal(C.judgeFrame({...good,brightness:30}).warn,'dark');
  assert.equal(C.judgeFrame({...good,sharpness:10}).warn,'blur');
  assert.deepEqual(plain(C.judgeFrame({...good,cutoff:true})),{ok:false,warn:'cutoff'});
  assert.deepEqual(plain(C.judgeFrame({...good,far:true})),{ok:false,warn:'far'});
  assert.deepEqual(plain(C.judgeFrame({...good,glare:true})),{ok:true,warn:'glare'});
  assert.deepEqual(plain(C.judgeFrame({...good,support:.1})),{ok:false,warn:null},'an outline not on real edges is never shot by itself');
});

test('framing guide: a rectangle in the shape of the mode, centred, clear of the top bar and the shutter',()=>{
  const side=g=>[Math.hypot(g[1][0]-g[0][0],g[1][1]-g[0][1]),Math.hypot(g[3][0]-g[0][0],g[3][1]-g[0][1])];
  const doc=C.guideQuad('document',390,844),[dw,dh]=side(doc);
  assert.ok(Math.abs(dh/dw-Math.SQRT2)<.01,'A4 portrait on a portrait phone');
  assert.ok(doc[0][1]>90&&doc[2][1]<844-190,'between the top bar and the controls');
  const[iw,ih]=side(C.guideQuad('id',390,844));assert.ok(Math.abs(iw/ih-85.6/54)<.01,'card shape');
  const[lw,lh]=side(C.guideQuad('document',844,390));assert.ok(lw>lh,'a landscape phone gets a landscape page');
  const[qw,qh]=side(C.guideQuad('qr',390,844));assert.ok(Math.abs(qw-qh)<.01,'square for QR');
  for(const m of['document','board','book','id','qr'])for(const[w,h]of[[390,844],[844,390],[768,1024]]){
    const g=C.guideQuad(m,w,h);assert.ok(g.every(([x,y])=>x>=0&&x<=w&&y>=0&&y<=h),`${m} ${w}×${h} stays inside the preview`);
  }
});

test('corner brackets: one L at every corner, along the two sides, never longer than the sides allow',()=>{
  const q=[[100,100],[300,100],[300,400],[100,400]],d=C.bracketPath(q);
  assert.equal(d.match(/M/g).length,4);
  assert.ok(d.startsWith('M100.0 136.0L100.0 100.0L136.0 100.0'),'36 px arms from the top-left corner');
  const tiny=C.bracketPath([[0,0],[10,0],[10,10],[0,10]]);
  assert.ok(!/NaN|Infinity/.test(tiny));
  assert.equal(C.polyPath(q),'M100.0 100.0L300.0 100.0L300.0 400.0L100.0 400.0Z');
});

test('corners by hand start on screen, whatever part of the video the phone shows (video is "cover")',()=>{
  // A 16:9 frame on a portrait phone: only the middle ~26 % of its width is visible.
  const view={videoW:1280,videoH:720,elW:375,elH:812,zoom:1,crop:{x:0,y:0,w:1280,h:720}};
  const old=C.mapToScreen([[.14,.2],[.86,.2],[.86,.78],[.14,.78]],view);
  assert.ok(old.some(([x])=>x<0||x>375),'the old default (frame points .14/.86) was off screen: x '+old.map(p=>Math.round(p[0])));
  const box=C.freeBox(375,812),lim={box:{x0:14,x1:361,y0:62,y1:530},avoid:[{x0:283,x1:367,y0:60,y1:204}]};
  for(const mode of['board','document','book']){
    const guide=C.guideQuad(mode,375,812).map(p=>C.placePoint(p,lim));
    for(const[x,y]of guide){
      assert.ok(x>=lim.box.x0&&x<=lim.box.x1&&y>=lim.box.y0&&y<=lim.box.y1,`${mode}: ${x},${y} inside the limits`);
      assert.ok(!(x>283&&x<367&&y>60&&y<204),`${mode}: ${x},${y} not under the Auto / Coins buttons`);
      const f=C.mapFromScreen([x,y],view),back=C.mapToScreen([f],view)[0];
      assert.ok(Math.abs(back[0]-x)<1e-6&&Math.abs(back[1]-y)<1e-6,'frame point maps back to the same screen point');
    }
  }
  assert.ok(box.y0>0&&box.y1>box.y0);
});

test('a corner is kept inside the limits and pushed out from under a button',()=>{
  const lim={box:{x0:10,x1:360,y0:60,y1:530},avoid:[{x0:280,x1:370,y0:60,y1:200}]};
  assert.deepEqual(plain(C.placePoint([-300,135],lim)),[10,135],'off the left edge');
  assert.deepEqual(plain(C.placePoint([700,700],lim)),[360,530],'off the bottom right');
  const [x,y]=C.placePoint([330,120],lim);
  assert.ok(!(x>280&&x<370&&y>60&&y<200),`under a button: moved to ${x},${y}`);
  assert.deepEqual(plain(C.placePoint(C.placePoint([330,120],lim),lim)),plain(C.placePoint([330,120],lim)),'placing twice changes nothing');
  assert.deepEqual(plain(C.placePoint([100,300],lim)),[100,300],'a free point does not move');
});

test('a placed quad is refused when it is a bow-tie, tiny, or had to be squeezed in from far off screen',()=>{
  const lim={box:{x0:10,x1:360,y0:60,y1:530},avoid:[]};
  const ok=[[60,120],[300,110],[310,400],[50,410]];
  assert.deepEqual(plain(C.placeQuad(ok,lim)),ok);
  assert.equal(C.placeQuad([[60,120],[300,400],[310,110],[50,410]],lim),null,'bow-tie');
  assert.equal(C.placeQuad([[100,100],[110,100],[110,110],[100,110]],lim),null,'tiny');
  assert.equal(C.placeQuad([[-300,120],[300,110],[310,400],[-290,410]],lim,{maxShift:28}),null,'mostly off screen');
  assert.ok(C.placeQuad([[-300,120],[300,110],[310,400],[-290,410]],lim),'without a limit it is squeezed in');
});
