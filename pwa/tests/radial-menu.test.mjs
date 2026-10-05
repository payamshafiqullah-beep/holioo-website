// Quick Capture: radial menu geometry and hit testing (ui/radial-menu.js), the course order and
// today's session (features/camera/camera-destination.js), and the camera opening on that destination.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const captureParts=['capture-destination','capture-status','camera-stream','camera-scan-modes','capture-shutter','capture-batch'].map(n=>`../features/camera/${n}.js`);
const load=(...files)=>{const ctx=vm.createContext({module:{exports:{}}});for(const p of files)vm.runInContext(read(p),ctx);return ctx.module.exports};
const R=load('../ui/radial-geometry.js','../ui/radial-menu.js');
const D=load('../features/camera/camera-destination.js');

const screens={
  'iPhone SE (320×568)':{w:320,h:568},
  'iPhone 8 (375×667)':{w:375,h:667},
  'iPhone 15 (390×844)':{w:390,h:844,top:47,bottom:34},
  'Pro Max (430×932)':{w:430,h:932,top:59,bottom:34},
  'iPad (768×1024)':{w:768,h:1024,top:24,bottom:20},
  'phone landscape (844×390)':{w:844,h:390,bottom:21}
};
// Where a trigger can be: the Accueil card (right side, near the top), the bottom center, the
// middle of the screen, a top corner.
const triggers={
  'Accueil card':vp=>({x:vp.w-78,y:Math.min((vp.top||0)+250,vp.h-120)}),
  'bottom center':vp=>({x:vp.w/2,y:vp.h-(vp.bottom||0)-70}),
  'middle':vp=>({x:vp.w/2,y:vp.h/2}),
  'top left corner':vp=>({x:60,y:(vp.top||0)+70})
};
const inside=(p,s,vp)=>p.x-s/2>=0&&p.x+s/2<=vp.w&&p.y-s/2>=(vp.top||0)&&p.y+s/2<=vp.h-(vp.bottom||0);
const apart=(pts,s)=>pts.every((p,i)=>pts.every((q,j)=>i===j||Math.hypot(p.x-q.x,p.y-q.y)>=s-1e-6));

for(const [name,vp] of Object.entries(screens))for(const [where,at] of Object.entries(triggers))test(`${name}, trigger ${where}: courses and sections fit on screen without overlapping`,()=>{
  const o=at(vp);
  for(const n of [1,3,5,7]){
    const fit=R.radialFit(n,o,vp);
    assert.ok(fit.size>=R.RADIAL.minSize,'items stay touch-sized');
    const pts=fit.angles1.map(a=>R.radialPoint(o,fit.r1,a));
    pts.forEach(p=>assert.ok(inside(p,fit.size,vp),`${n} courses: one at ${p.x.toFixed(0)},${p.y.toFixed(0)} is off screen`));
    assert.ok(apart(pts,fit.size),`${n} courses overlap`);
    // Every course's sections (CM, TD, TP + a custom one), whatever course the finger is on.
    for(const a of fit.angles1){
      const ring=R.radialChildren(4,a,o,vp,fit);
      assert.ok(ring.shown>=3,`${n} courses: only ${ring.shown} section(s) fit`);
      const kids=ring.angles.map(b=>R.radialPoint(o,fit.r2,b));
      kids.forEach(p=>assert.ok(inside(p,fit.size,vp),`section at ${p.x.toFixed(0)},${p.y.toFixed(0)} is off screen`));
      assert.ok(apart(kids,fit.size),'sections overlap');
      for(const k of kids)for(const p of pts)assert.ok(Math.hypot(k.x-p.x,k.y-p.y)>=fit.size-1e-6,'the second ring covers the first');
    }
  }
});

test('bottom center: the ring opens upwards, courses left to right, compact',()=>{
  const vp=screens['iPhone 15 (390×844)'],o=triggers['bottom center'](vp);
  const fit=R.radialFit(5,o,vp),pts=fit.angles1.map(a=>R.radialPoint(o,fit.r1,a));
  assert.ok(pts.every(p=>p.y<o.y),'above the finger');
  assert.ok(pts.every((p,i)=>!i||p.x>pts[i-1].x),'left to right');
  assert.equal(R.radialFit(3,o,vp).r1,R.RADIAL.minR1,'smallest ring that fits');
});

test('Accueil card (right side): the rings open towards the free side, above the finger when possible',()=>{
  for(const vp of [screens['iPhone SE (320×568)'],screens['iPhone 15 (390×844)']]){
    const o=triggers['Accueil card'](vp),fit=R.radialFit(3,o,vp);
    const pts=fit.angles1.map(a=>R.radialPoint(o,fit.r1,a));
    assert.ok(pts.reduce((s,p)=>s+p.x,0)/pts.length<o.x,'towards the middle of the screen, not off the right edge');
  }
  const vp=screens['iPhone 15 (390×844)'],o=triggers['Accueil card'](vp),fit=R.radialFit(3,o,vp);
  assert.ok(fit.angles1.some(a=>R.radialPoint(o,fit.r1,a).y<o.y-40),'at least part of the ring above the finger');
  // Many courses: the arc goes round the left side; the first (most used) one is the highest.
  const f7=R.radialFit(7,o,vp),ys=f7.angles1.map(a=>R.radialPoint(o,f7.r1,a).y);
  assert.equal(Math.min(...ys),ys[0],'first course at the top of the arc, not under the hand');
});

for(const [name,vp] of Object.entries(screens))test(`${name}: dragging straight from a course to any of its sections never switches the course`,()=>{
  for(const [where,at] of Object.entries(triggers))for(const n of [3,5,7]){
    const o=at(vp),fit=R.radialFit(n,o,vp);
    fit.angles1.forEach((a,i)=>{
      const ring=R.radialChildren(4,a,o,vp,fit),from=R.radialPoint(o,fit.r1,a);
      ring.angles.forEach((b,j)=>{
        const to=R.radialPoint(o,fit.r2,b);
        for(let k=0;k<=20;k++){
          const p={x:from.x+(to.x-from.x)*k/20,y:from.y+(to.y-from.y)*k/20},h=R.radialHit(p,o,fit,ring,i);
          assert.ok(!(h?.ring===1&&h.index!==i&&!h.tentative),`${where}, ${n} courses: course ${i} → section ${j} switches to course ${h?.index}`);
        }
        assert.deepEqual({...R.radialHit(to,o,fit,ring,i)},{ring:2,index:j});
      });
    });
  }
});

test('free angles: the whole circle, one arc, or the arc containing an angle',()=>{
  const vp={w:1000,h:1000};
  assert.equal(R.radialRun(R.radialFree({x:500,y:500},100,40,vp)).full,true);
  const edge=R.radialRun(R.radialFree({x:960,y:500},100,40,vp));
  assert.ok(!edge.full&&edge.start>80&&edge.start<120&&edge.len>120&&edge.len<200,JSON.stringify(edge));
  assert.equal(R.radialRun(R.radialFree({x:500,y:500},900,40,vp)),null);
});

test('too many sections for a small phone: the ring says how many fit (the rest go to "more")',()=>{
  const vp=screens['iPhone SE (320×568)'],o=triggers['bottom center'](vp),fit=R.radialFit(7,o,vp);
  const ring=R.radialChildren(20,90,o,vp,fit);
  assert.ok(ring.shown<20&&ring.shown===ring.capacity&&ring.shown>=4);
});

test('hit testing: center cancels, a course by its direction, a section by distance, outside is nothing',()=>{
  const vp=screens['iPhone 15 (390×844)'],o=triggers['bottom center'](vp),fit=R.radialFit(3,o,vp);
  assert.deepEqual({...R.radialHit({x:o.x+5,y:o.y-10},o,fit)},{center:true});
  const c1=R.radialPoint(o,fit.r1,fit.angles1[1]);
  assert.deepEqual({...R.radialHit(c1,o,fit)},{ring:1,index:1});
  // The finger hides the item: a little short of it, in the same direction, still counts.
  const near=R.radialPoint(o,fit.r1*.7,fit.angles1[2]+6);
  assert.deepEqual({...R.radialHit(near,o,fit)},{ring:1,index:2});
  const ring=R.radialChildren(3,fit.angles1[1],o,vp,fit);
  const s2=R.radialPoint(o,fit.r2,ring.angles[2]);
  assert.deepEqual({...R.radialHit({x:s2.x+8,y:s2.y-6},o,fit,ring)},{ring:2,index:2});
  assert.equal(R.radialHit({x:o.x,y:30},o,fit,ring),null,'far above: outside');
  assert.equal(R.radialHit({x:o.x+60,y:o.y+40},o,fit,ring),null,'below the finger: outside');
  assert.equal(R.radialHit(R.radialPoint(o,fit.r1,175),o,fit,ring),null,'beside the ring: outside');
});

test('hit testing across the left side (angles around 180°) and back from ring 2 to another course',()=>{
  const vp=screens['iPhone 15 (390×844)'],o=triggers['Accueil card'](vp),fit=R.radialFit(5,o,vp);
  fit.angles1.forEach((a,i)=>assert.deepEqual({...R.radialHit(R.radialPoint(o,fit.r1,a+3),o,fit)},{ring:1,index:i},`course ${i} at ${a.toFixed(0)}°`));
  const ring=R.radialChildren(3,fit.angles1[0],o,vp,fit);
  const kid=R.radialPoint(o,fit.r2,ring.angles[1]);
  assert.deepEqual({...R.radialHit(kid,o,fit,ring)},{ring:2,index:1});
  // Dragging back onto another course while course 0's sections are open: tentative (the menu
  // switches when the finger rests on it); beside it: still course 0's direction or nothing.
  assert.deepEqual({...R.radialHit(R.radialPoint(o,fit.r1,fit.angles1[3]),o,fit,ring,0)},{ring:1,index:3,tentative:true});
  assert.deepEqual({...R.radialHit(R.radialPoint(o,fit.r1,fit.angles1[0]+2),o,fit,ring,0)},{ring:1,index:0});
  assert.deepEqual({...R.radialHit(R.radialPoint(o,fit.r1,fit.angles1[3]),o,fit,ring)},{ring:1,index:3},'no open ring: plain hit');
});

test('the layout is fast enough for the moment the finger touches down',()=>{
  const vp=screens['iPhone SE (320×568)'];R.radialFit(3,triggers.middle(vp),vp);
  const t=performance.now();
  for(const at of Object.values(triggers))for(const n of [3,7])R.radialFit(n,at(vp),vp);
  assert.ok((performance.now()-t)/8<50,`${((performance.now()-t)/8).toFixed(1)} ms per layout`);
});

test('item text is readable on every course color',()=>{
  assert.equal(R.radialInk('#1D2140'),'#fff');
  assert.equal(R.radialInk('#506BFF'),'#fff');
  assert.equal(R.radialInk('#FFE066'),'#1D2140');
});

// ─── Course order and today's session ───

const sec=(id,sessions=[])=>({id,name:id,sessions});
const courses=['A','B','C','D','E','F','G','H','I'].map(id=>({id,name:id,sections:[sec(`${id}-CM`),sec(`${id}-TD`)]}));

test('courses: last used first, then the camera history, then the usual order',()=>{
  const r=D.quickCaptureCourses(courses.slice(0,4),[{courseId:'C'},{courseId:'B'}],{courseId:'D',sectionId:'D-TD'});
  assert.deepEqual([...r.courses.map(c=>c.id)],['D','C','B','A']);assert.equal(r.more,false);
});

test('more than 7 courses: 6 most recent + "Plus…"',()=>{
  const r=D.quickCaptureCourses(courses,[{courseId:'I'},{courseId:'H'}],null,7);
  assert.equal(r.courses.length,6);assert.equal(r.more,true);
  assert.deepEqual([...r.courses.map(c=>c.id)],['I','H','A','B','C','D']);
  assert.equal(D.quickCaptureCourses(courses.slice(0,7),[],null,7).more,false,'exactly 7: no "Plus…"');
});

test('deleted courses in the history are ignored',()=>{
  const r=D.quickCaptureCourses(courses.slice(0,2),[{courseId:'gone'}],{courseId:'gone'});
  assert.deepEqual([...r.courses.map(c=>c.id)],['A','B']);
});

test('last used section of a course',()=>{
  assert.equal(D.quickCaptureLastSection('A',[{courseId:'B',sectionId:'B-CM'},{courseId:'A',sectionId:'A-TD'}],null),'A-TD');
  assert.equal(D.quickCaptureLastSection('A',[],{courseId:'A',sectionId:'A-CM'}),'A-CM');
  assert.equal(D.quickCaptureLastSection('A',[],null),null);
});

test("today's session is reused, otherwise a new session (created on the first photo)",()=>{
  const day=new Date(2026,8,30,10,0);
  const old={id:'s1',createdAt:new Date(2026,8,29,9).toISOString()},today={id:'s2',createdAt:new Date(2026,8,30,8).toISOString()};
  const course={id:'A'};
  assert.deepEqual({...D.quickCaptureDestination(course,sec('CM',[old,today]),day)},{courseId:'A',sectionId:'CM',sessionId:'s2',source:'quick'});
  assert.equal(D.quickCaptureDestination(course,sec('CM',[old]),day).sessionId,null);
  assert.equal(D.quickCaptureDestination(course,sec('CM',[]),day).sessionId,null);
});

// ─── The camera opens on the Quick Capture destination ───

function cameraSandbox(){
  const sections=['CM','TD'].map(id=>({id,name:id,sessions:[{id:id+'1',number:1,photoIds:[],title:id+' 1',createdAt:'2026-09-01'}]}));
  const state={courses:[{id:'course',name:'Course',sections}],inbox:[],cameraRecent:[],cameraLast:{courseId:'course',sectionId:'CM',sessionId:'CM1'}};
  const ctx={state,currentCourseId:null,currentSectionId:null,currentSessionId:null,byId:()=>null,saveState(){},window:{addEventListener(){}},clearTimeout,setTimeout,DB:{get:async()=>null,put:async()=>{}},now:()=>new Date().toISOString(),uid:()=>'new-session'};
  ctx.findSessionContext=id=>{for(const course of state.courses)for(const section of course.sections){const session=section.sessions.find(s=>s.id===id);if(session)return{course,section,session}}};
  vm.createContext(ctx);ctx.Scanner={subscribe(){},stop(){}};
  for(const f of ['../features/camera/camera-destination.js','../features/camera/camera-queue.js',...captureParts])vm.runInContext(read(f),ctx);
  vm.runInContext('setCameraThumb=()=>{}; renderCameraChip=()=>{};',ctx);
  return{ctx,state,run:code=>vm.runInContext(code,ctx)};
}

test('Quick Capture destination wins over the timetable and the last destination',()=>{
  const{ctx,state,run}=cameraSandbox();
  ctx.resolveCameraDestination=()=>{throw Error('the automatic destination must not be used')};
  ctx.dest={courseId:'course',sectionId:'TD',sessionId:null,source:'quick'};
  run("camKeepBatch=true; camShots=['old']; prepareCameraEntry('home',dest); initCameraDestination()");
  assert.equal(run('camDest.sectionId'),'TD');assert.equal(run('camDest.source'),'quick');assert.equal(run('camShots.length'),0);
  assert.equal(state.cameraLast.sectionId,'TD','remembered: TD comes first next time');
  const shot=ctx.destinationForShot();
  assert.equal(shot.sessionId,'new-session','a new session on the first photo');
  const created=state.courses[0].sections[1].sessions.at(-1);
  assert.equal(created.id,'new-session');assert.equal(new Date(created.createdAt).toDateString(),new Date().toDateString(),"created with today's date");
});

test('the stream asked for during the gesture is used by the camera screen',async()=>{
  const{ctx,run}=cameraSandbox();
  let calls=0;const track={stop(){},addEventListener(){},getCapabilities:()=>({}),applyConstraints:async()=>{}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const video={play:async()=>{},set srcObject(v){this._s=v},get srcObject(){return this._s}};
  Object.assign(ctx,{isSecureContext:true,navigator:{mediaDevices:{getUserMedia:()=>{calls++;return Promise.resolve(stream)}},permissions:{query:async()=>({state:'prompt'})}},localStorage:{getItem:()=>null,setItem(){}},document:{querySelectorAll:()=>[]},camT:k=>k,currentView:'capture',cameraFacing:'environment',cameraStream:null,cameraTrack:null,torchOn:false,zoomValue:1});
  ctx.window.isSecureContext=true;
  run('var byIdReal=byId; byId=id=>id==="cameraVideo"?video:null; applyCameraMode=()=>{}; setCameraZoom=async()=>{};');
  ctx.video=video;
  assert.equal(run('prewarmCamera()'),true);assert.equal(calls,1,'asked for synchronously');
  await run('startCamera()');
  assert.equal(calls,1,'no second request: the first-time explanation is skipped, the gesture already asked');
  assert.equal(run('cameraStream'),stream);
});

// Local rings (menus with `local`): from the second ring on, a ring right round the item that was picked (never round the
// middle of the screen), clamped at the screen edges.
const sizes = { phone: { w: 390, h: 844, top: 47, bottom: 34 }, tablet: { w: 1024, h: 768, top: 24, bottom: 20 }, 'tablet portrait': { w: 768, h: 1024, top: 24, bottom: 20 } };
const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
test('local ring: full circle round the picked item, on screen, no overlap, close to it', () => {
  for (const [name, vp] of Object.entries(screens)) {
    const s = R.RADIAL.size, c = { x: vp.w / 2, y: vp.h / 2 };   // an item in the middle: a full circle fits
    for (const n of [2, 3, 5, 8]) {
      const h = R.radialLocalFit(n, c, vp, s);
      assert.equal(h.shown, n, `${name}: ${n} items fit`);
      assert.ok(h.r <= (n <= 5 ? 1.6 : 2.4) * s, `${name}: ${n} items stay close to their parent (r=${h.r})`);
      const pts = h.angles.map(a => R.radialPoint(c, h.r, a));
      pts.forEach(p => assert.ok(inside(p, s, vp), `${name}: item on screen`));
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
        assert.ok(gap(pts[i], pts[j]) >= s, `${name}: ${n} items do not overlap`);
    }
  }
});
test('local ring: the gap to the parent is smaller than the old hub ring (item + 6 px, was + 14 px)', () => {
  const vp = screens['iPhone 15 (390×844)'], s = R.RADIAL.size, c = { x: 195, y: 420 };
  const h = R.radialLocalFit(1, c, vp, s);
  assert.equal(h.r, s + R.RADIAL.localGap);
  assert.ok(R.RADIAL.localGap < 14);
});
test('first ring: with room around the trigger it sits closer than before (minR1 76, was 96)', () => {
  for (const vp of Object.values(sizes)) {
    const org = { x: vp.w / 2, y: vp.h / 2 };
    const now = R.radialFit(5, org, vp, { ...R.RADIAL, minR1: 76, rings: 1, local: true }), before = R.radialFit(5, org, vp, { ...R.RADIAL, rings: 1, local: true });
    assert.ok(now.r1 < before.r1 && now.r1 <= 80, `r1 ${now.r1} < ${before.r1}`);
  }
});
test('local ring: too many items → fewer shown (the caller adds "•••"); the ring never leaves the screen', () => {
  const vp = screens['iPhone 15 (390×844)'], s = R.RADIAL.size, c = { x: 195, y: 420 };
  const many = R.radialLocalFit(60, c, vp, s);
  assert.ok(many.shown < 60 && many.shown >= 8, 'capacity limits what is shown');
  many.angles.forEach(a => assert.ok(inside(R.radialPoint(c, many.r, a), s, vp)));
});

// Phone, tablet (landscape) and tablet portrait: every depth of Capture rapide / Lecture rapide opens beside its parent and no
// icon ever lands on another one (the earlier rings, the middle button, the other children).
test('local rings: at every depth the children sit next to their parent, inside the viewport, and on no other icon', () => {
  const opt = { ...R.RADIAL, minR1: 76, rings: 1, local: true };
  let checked = 0, far = 0;
  for (const [name, vp] of Object.entries(sizes)) {
    // Triggers: the Accueil card (right, upper part), the lecture row (lower left), the bottom middle.
    for (const org of [{ x: vp.w - 60, y: vp.top + 220 }, { x: 60, y: vp.h * .7 }, { x: vp.w / 2, y: vp.h - vp.bottom - 60 }]) {
      const fit = R.radialFit(7, org, vp, opt), s = fit.size;
      const taken = [{ x: org.x, y: org.y, r: 30 }, ...fit.angles1.map(a => R.radialPoint(org, fit.r1, a))];
      // Walk down every first-ring item, and from each one down the first and the last child.
      for (let pick = 0; pick < fit.angles1.length; pick++) {
        let parent = taken[1 + pick], all = [...taken];
        for (let depth = 2; depth <= 4; depth++) {
          const away = Math.atan2(org.y - parent.y, parent.x - org.x) * 180 / Math.PI;
          const h = R.radialLocalFit(6, parent, vp, s, opt, all, away);
          assert.ok(h.shown >= 1, `${name}: depth ${depth} has items`);
          const pts = h.angles.map(a => R.radialPoint(parent, h.r, a));
          pts.forEach((p, i) => {
            assert.ok(inside(p, s, vp), `${name}: depth ${depth} item inside the viewport`);
            if (h.r > R.RADIAL.localMaxR * s + 1e-6) far++;   // only when nothing free exists nearer (a crowded corner, the last child of the last child…)
            for (const q of all) assert.ok(gap(p, q) >= s - 1e-6 && (q.r === undefined || gap(p, q) >= q.r + s / 2), `${name}: depth ${depth} item ${i} overlaps an earlier icon`);
            for (let j = i + 1; j < pts.length; j++) assert.ok(gap(p, pts[j]) >= s - 1e-6, `${name}: depth ${depth} children overlap each other`);
            checked++;
          });
          all = [...all, ...pts];
          parent = pts[pts.length - 1];
        }
      }
    }
  }
  assert.ok(checked > 200, `${checked} items checked`);
  assert.ok(far / checked < 0.03, `${far} of ${checked} items had to go beyond ${R.RADIAL.localMaxR} item sizes from their parent`);
});
test('local ring: with a neighbour in the way the ring goes round it (still next to the parent), never over it', () => {
  const vp = sizes.phone, s = R.RADIAL.size, c = { x: 195, y: 420 };
  const neighbour = { x: c.x + s + 8, y: c.y };
  const h = R.radialLocalFit(5, c, vp, s, R.RADIAL, [neighbour, c]);
  h.angles.forEach(a => assert.ok(gap(R.radialPoint(c, h.r, a), neighbour) >= s, 'clear of the neighbour'));
  assert.equal(h.shown, 5);
});
const hit=(...a)=>{const r=R.radialHitLevels(...a);return r&&JSON.parse(JSON.stringify(r))};
test('local hit: the open ring wins, the blurred one answers by its other items (tentative) and its open item', () => {
  const o = { x: 330, y: 250 }, c = { x: 195, y: 420 };
  const l1 = { c: o, r: 100, angles: [90, 135, 180] }, l2 = { c, r: 100, angles: [90, 210, 330] };
  const at = (L, i) => R.radialPoint(L.c, L.r, L.angles[i]);
  assert.deepEqual(hit(at(l2, 1), [l1, l2], [0, -1], 56), { ring: 2, index: 1 });
  assert.deepEqual(hit(at(l1, 2), [l1, l2], [0, -1], 56), { ring: 1, index: 2, tentative: true });
  assert.deepEqual(hit(at(l1, 0), [l1, l2], [0, -1], 56), { ring: 1, index: 0 });
  assert.equal(R.radialHitLevels({ x: 5, y: 5 }, [l1, l2], [0, -1], 56), null);
});
