// Quick Capture: radial menu geometry and hit testing (ui/radial-menu.js), the course order and
// today's session (features/camera-destination.js), and the camera opening on that destination.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const load=p=>{const ctx={module:{exports:{}}};vm.runInNewContext(read(p),ctx);return ctx.module.exports};
const R=load('../ui/radial-menu.js');
const D=load('../features/camera-destination.js');

// The orange button sits at the bottom center, about 70 px above the bottom edge.
const screens={
  'iPhone SE (320×568)':{w:320,h:568},
  'iPhone 8 (375×667)':{w:375,h:667},
  'iPhone 15 (390×844)':{w:390,h:844,top:47},
  'Pro Max (430×932)':{w:430,h:932,top:59},
  'iPad (768×1024)':{w:768,h:1024,top:24},
  'phone landscape (844×390)':{w:844,h:390}
};
const originOf=vp=>({x:vp.w/2,y:vp.h-70});
const inside=(p,s,vp)=>p.x-s/2>=0&&p.x+s/2<=vp.w&&p.y-s/2>=(vp.top||0)&&p.y+s/2<=vp.h;

for(const [name,vp] of Object.entries(screens))for(const n of [1,2,3,5,7])test(`${name}: ${n} course(s) fit on screen without overlapping, sections too`,()=>{
  const o=originOf(vp),fit=R.radialFit(n,o,vp);
  assert.ok(fit.size>=R.RADIAL.minSize,'items stay touch-sized');
  const pts=fit.angles1.map(a=>R.radialPoint(o,fit.r1,a));
  pts.forEach(p=>assert.ok(inside(p,fit.size,vp),`course at ${p.x.toFixed(0)},${p.y.toFixed(0)} is off screen`));
  for(let i=1;i<pts.length;i++)assert.ok(Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y)>=fit.size,'courses do not overlap');
  pts.forEach(p=>assert.ok(p.y<o.y,'the ring opens above the button'));
  assert.ok(pts.every((p,i)=>!i||p.x>pts[i-1].x),'courses go left to right');
  // Every course's sections (CM, TD, TP + a custom one) also fit, whatever course is chosen.
  for(const a of fit.angles1){
    const ring=R.radialChildren(4,a,o,vp,fit);
    assert.ok(ring.shown>=4,`4 sections shown (${ring.shown})`);
    const kids=ring.angles.map(b=>R.radialPoint(o,fit.r2,b));
    kids.forEach(p=>assert.ok(inside(p,fit.size,vp),`section at ${p.x.toFixed(0)},${p.y.toFixed(0)} is off screen`));
    for(let i=1;i<kids.length;i++)assert.ok(Math.hypot(kids[i].x-kids[i-1].x,kids[i].y-kids[i-1].y)>=fit.size,'sections do not overlap');
    // The second ring never covers the first.
    for(const k of kids)for(const p of pts)assert.ok(Math.hypot(k.x-p.x,k.y-p.y)>=fit.size,'rings do not overlap');
  }
});

test('the rings stay compact: the smallest ring that fits is used (thumb reach)',()=>{
  const vp=screens['iPhone 15 (390×844)'],o=originOf(vp);
  assert.equal(R.radialFit(3,o,vp).r1,R.RADIAL.minR1);
  assert.ok(R.radialFit(7,o,vp).r1<=160);
});

test('too many sections for a small phone: the ring says how many fit (the rest go to "more")',()=>{
  const vp=screens['iPhone SE (320×568)'],o=originOf(vp),fit=R.radialFit(7,o,vp);
  const ring=R.radialChildren(12,90,o,vp,fit);
  assert.ok(ring.shown<12&&ring.shown===ring.capacity&&ring.shown>=4);
});

test('a section ring opened from a course near the edge is pulled back on screen',()=>{
  const vp=screens['iPhone 8 (375×667)'],o=originOf(vp),fit=R.radialFit(5,o,vp);
  const left=fit.angles1[0],ring=R.radialChildren(3,left,o,vp,fit);
  assert.ok(Math.max(...ring.angles)<=left+1e-9||ring.angles.every(a=>{const p=R.radialPoint(o,fit.r2,a);return inside(p,fit.size,vp)}));
});

test('hit testing: center cancels, a course by its direction, a section by distance, outside is nothing',()=>{
  const vp=screens['iPhone 15 (390×844)'],o=originOf(vp),fit=R.radialFit(3,o,vp);
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
  assert.equal(R.radialHit({x:o.x+60,y:o.y+40},o,fit,ring),null,'below the button: outside');
  assert.equal(R.radialHit(R.radialPoint(o,fit.r1,175),o,fit,ring),null,'beside the ring: outside');
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
  for(const f of ['../features/camera-destination.js','../features/camera-queue.js','../features/capture-actions.js'])vm.runInContext(read(f),ctx);
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
