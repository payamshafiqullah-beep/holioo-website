// Same account, same files on every device: the merge of two devices' states (sync/cloud-sync.js).
// The rule under test: nothing is lost. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};ctx.self=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../sync/cloud-sync.js',import.meta.url),'utf8')+';this.CloudSync=CloudSync',ctx);
const C=ctx.CloudSync;
const plain=v=>JSON.parse(JSON.stringify(v)),eq=(a,b,m)=>assert.deepEqual(plain(a),plain(b),m);   // values built inside the vm have another Array prototype

const course=(id,name,sessions=[])=>({id,name,color:'#506BFF',defaultSectionsSeeded:true,sections:[{id:id+'-cm',name:'CM',type:'CM',sortOrder:0,sessions},{id:id+'-td',name:'TD',type:'TD',sortOrder:1,sessions:[]}]});
const session=(id,title,photoIds=[])=>({id,number:1,title,photoIds,createdAt:'2026-10-01T10:00:00Z',visibility:'private'});
const state=(courses=[],extra={})=>({courses,inbox:[],files:[],favorites:[],timetable:[],lastModified:0,...extra});
// What device A wrote to Drive, and the base each device remembers from its last sync.
const snap=(s,photos=[],at=1000,pdfs={})=>({...C.snapshot(s,Object.fromEntries(photos.map(id=>[id,{d:'drive-'+id,n:id+'.jpg'}])),pdfs,at)});
const base=(s,at)=>({s:C.structureOf(s),at});
const sessionOf=(s,cid,sid)=>s.courses.find(c=>c.id===cid).sections.flatMap(x=>x.sessions).find(q=>q.id===sid);

test('a fresh tablet gets the phone\'s courses, séances and photos, and no duplicate sample courses',()=>{
  const phone=state([course('c1','VHDL',[session('s1','CM 1',['p1','p2'])]),course('c2','Mathématiques'),course('c3','Électronique')]);
  const tablet=state([course('t1','VHDL'),course('t2','Mathématiques'),course('t3','Électronique'),course('t4','Mon cours')]);
  const r=C.merge(tablet,snap(phone,['p1','p2']),null,{localModified:5000});
  eq(tablet.courses.map(c=>c.name).sort(),['Mathématiques','Mon cours','VHDL','Électronique'],'one of each, and the tablet\'s own course is kept');
  eq(tablet.courses.find(c=>c.name==='VHDL').id,'c1','the phone\'s course (with the séance) is the one kept');
  eq([...sessionOf(tablet,'c1','s1').photoIds],['p1','p2']);
  eq([...r.newPhotos].sort(),['p1','p2'],'both photos are to be fetched');
  assert.equal(r.changed,true);
});

test('a sample course that holds something is never dropped',()=>{
  const phone=state([course('c1','VHDL')]);
  const tablet=state([course('t1','VHDL',[session('ts','TD 1',['tp1'])])]);
  C.merge(tablet,snap(phone),null,{localModified:5000});
  eq(tablet.courses.map(c=>c.id).sort(),['c1','t1'],'two VHDL: nothing is thrown away');
});

test('a séance and photos added on the phone appear on the tablet, in the same order',()=>{
  const a=state([course('c1','VHDL',[session('s1','CM 1',['p1'])])]),b=C.structureOf(a);
  const tablet=state(C.clone(b.courses),{lastModified:100});const baseB=base(tablet,1000);
  a.courses[0].sections[0].sessions[0].photoIds.push('p2');
  a.courses[0].sections[1].sessions.push(session('s2','TD 1',['p3']));
  const r=C.merge(tablet,snap(a,['p1','p2','p3'],2000),baseB,{localModified:100});
  eq([...sessionOf(tablet,'c1','s1').photoIds],['p1','p2']);
  eq([...sessionOf(tablet,'c1','s2').photoIds],['p3']);
  eq([...r.newPhotos].sort(),['p2','p3']);
});

test('what the phone deleted is deleted on the tablet, and its photos are reported for cleaning',()=>{
  const both=state([course('c1','VHDL',[session('s1','CM 1',['p1','p2']),session('s2','CM 2',['p3'])])]);
  const phone=state(C.clone(both.courses)),tablet=state(C.clone(both.courses),{lastModified:100}),baseT=base(both,1000);
  phone.courses[0].sections[0].sessions=phone.courses[0].sections[0].sessions.filter(q=>q.id!=='s1');   // séance deleted
  const r=C.merge(tablet,snap(phone,['p3'],2000),baseT,{localModified:100});
  eq(tablet.courses[0].sections[0].sessions.map(q=>q.id),['s2']);
  eq([...r.droppedPhotos].sort(),['p1','p2']);
});

test('a séance the phone deleted survives on the tablet if a photo was put into it there since',()=>{
  const both=state([course('c1','VHDL',[session('s1','CM 1',['p1'])])]);
  const phone=state(C.clone(both.courses)),tablet=state(C.clone(both.courses),{lastModified:3000}),baseT=base(both,1000);
  phone.courses[0].sections[0].sessions=[];
  tablet.courses[0].sections[0].sessions[0].photoIds.push('new-on-tablet');
  const r=C.merge(tablet,snap(phone,[],2000),baseT,{localModified:3000});
  assert.equal(tablet.courses[0].sections[0].sessions.length,1,'kept: it holds a photo nobody else knows');
  assert.ok(sessionOf(tablet,'c1','s1').photoIds.includes('new-on-tablet'));
  assert.ok(!r.droppedPhotos.includes('new-on-tablet'));
});

test('a photo moved to another séance on the phone is moved on the tablet, not duplicated',()=>{
  const both=state([course('c1','VHDL',[session('s1','CM 1',['p1','p2']),session('s2','CM 2',[])])]);
  const phone=state(C.clone(both.courses)),tablet=state(C.clone(both.courses),{lastModified:100}),baseT=base(both,1000);
  phone.courses[0].sections[0].sessions[0].photoIds=['p2'];phone.courses[0].sections[0].sessions[1].photoIds=['p1'];
  const r=C.merge(tablet,snap(phone,['p1','p2'],2000),baseT,{localModified:100});
  eq([...sessionOf(tablet,'c1','s1').photoIds],['p2']);
  eq([...sessionOf(tablet,'c1','s2').photoIds],['p1']);
  eq(r.droppedPhotos,[],'still referenced: not deleted');
});

test('both devices add things while apart: everything is kept',()=>{
  const both=state([course('c1','VHDL',[session('s1','CM 1',['p1'])])]);
  const phone=state(C.clone(both.courses)),tablet=state(C.clone(both.courses),{lastModified:3000}),baseT=base(both,1000);
  phone.courses[0].sections[0].sessions[0].photoIds.push('from-phone');
  phone.courses.push(course('c9','Nouveau cours phone'));
  tablet.courses[0].sections[0].sessions[0].photoIds.push('from-tablet');
  tablet.courses.push(course('t9','Nouveau cours tablette'));
  C.merge(tablet,snap(phone,['p1','from-phone'],2000),baseT,{localModified:3000});
  eq([...sessionOf(tablet,'c1','s1').photoIds].sort(),['from-phone','from-tablet','p1']);
  eq(tablet.courses.map(c=>c.name).sort(),['Nouveau cours phone','Nouveau cours tablette','VHDL']);
});

test('renamed on both: the most recent change wins',()=>{
  const both=state([course('c1','VHDL')]);
  const phone=state(C.clone(both.courses)),tablet=state(C.clone(both.courses),{lastModified:3000}),baseT=base(both,1000);
  phone.courses[0].name='VHDL (phone)';tablet.courses[0].name='VHDL (tablet)';
  C.merge(tablet,snap(phone,[],2000),baseT,{localModified:3000});
  assert.equal(tablet.courses[0].name,'VHDL (tablet)','the tablet changed it last');
  const tablet2=state(C.clone(both.courses),{lastModified:1500});tablet2.courses[0].name='VHDL (tablet)';
  C.merge(tablet2,snap(phone,[],2000),baseT,{localModified:1500});
  assert.equal(tablet2.courses[0].name,'VHDL (phone)','the phone changed it last');
});

test('merging the same snapshot again changes nothing',()=>{
  const phone=state([course('c1','VHDL',[session('s1','CM 1',['p1'])])]),tablet=state([]);
  const remote=snap(phone,['p1']);
  C.merge(tablet,remote,null,{localModified:1});
  const again=C.merge(tablet,remote,base(tablet,1000),{localModified:1});
  assert.equal(again.changed,false);eq(again.newPhotos,[]);eq(again.droppedPhotos,[]);
});

test('PDFs, favourites and the timetable are shared too, and nothing points to a deleted course',()=>{
  const phone=state([course('c1','VHDL',[session('s1','CM 1',['p1'])])],{files:[{id:'f1',title:'Cours VHDL',courseId:'c1',sessionIds:['s1'],createdAt:'x'}],favorites:['s1'],timetable:[{id:'t',courseId:'c1',sectionId:'c1-cm',day:1,start:'08:00',end:'10:00'}]});
  const tablet=state([]);
  const r=C.merge(tablet,snap(phone,['p1'],1000,{f1:{d:'drive-f1',n:'a.pdf'}}),null,{localModified:1});
  assert.equal(tablet.files[0].title,'Cours VHDL');eq(tablet.favorites,['s1']);assert.equal(tablet.timetable.length,1);
  eq(r.newPdfs,['f1']);
  // the phone deletes the course: the tablet's timetable entry and favourite go with it
  const phone2=state([]);
  C.merge(tablet,snap(phone2,[],2000),base(phone,1000),{localModified:1});
  assert.equal(tablet.courses.length,0);assert.equal(tablet.timetable.length,0);eq(tablet.favorites,[]);
});

test('Captures batches are shared; an empty batch disappears',()=>{
  const phone=state([],{inbox:[{id:'b1',title:'Capture',photoIds:['p1','p2'],createdAt:'x'}]});
  const tablet=state([]);
  C.merge(tablet,snap(phone,['p1','p2']),null,{localModified:1});
  eq([...tablet.inbox[0].photoIds],['p1','p2']);
  const phone2=state([],{inbox:[]});
  C.merge(tablet,snap(phone2,[],2000),base(phone,1000),{localModified:1});
  assert.equal(tablet.inbox.length,0);
});

test('the arrays and objects of an open screen are kept, not replaced',()=>{
  const phone=state([course('c1','VHDL',[session('s1','CM 1',['p1'])])]);
  const tablet=state([course('c1','VHDL',[session('s1','CM 1',[])])]);
  const courses=tablet.courses,s1=sessionOf(tablet,'c1','s1'),ids=s1.photoIds;
  C.merge(tablet,snap(phone,['p1']),null,{localModified:1});
  assert.equal(tablet.courses,courses);assert.equal(sessionOf(tablet,'c1','s1'),s1);assert.equal(s1.photoIds,ids);eq([...ids],['p1']);
});

test('the snapshot lists only photos that are in Drive',()=>{
  const s=state([course('c1','VHDL',[session('s1','CM 1',['p1','p2'])])]);
  const out=C.snapshot(s,{p1:{d:'x'}},{},5);
  eq(Object.keys(out.photos),['p1']);assert.equal(out.updatedAt,5);
  assert.equal(C.sameContent(out,{...out,updatedAt:99,device:'other'}),true);
});
