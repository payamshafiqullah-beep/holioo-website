// Tests for the camera destination logic (features/camera-destination.js).
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The app files are plain browser scripts: load this one into a sandbox and use its functions.
const ctx={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../features/camera-destination.js',import.meta.url),'utf8'),ctx);
const {matchTimetable,resolveCameraDestination,nextSessionNumber,pushRecentDestination,validRecentDestinations}=ctx.module.exports;

// 2026-10-05 is a Monday (day 1).
const at=(hhmm,day=5)=>{const[h,m]=hhmm.split(':').map(Number);return new Date(2026,9,day,h,m)};
const MON=1,TUE=2;
const course=(id,sessions=[])=>({id,name:id,sections:[{id:`${id}-CM`,name:'CM',sessions},{id:`${id}-TD`,name:'TD',sessions:[]}]});
const slot=(id,courseId,day,start,end,section='CM')=>({id,courseId,sectionId:`${courseId}-${section}`,day,start,end});

test('matches the class happening now',()=>{
  const tt=[slot('a','Analyse',MON,'08:00','10:00')];
  assert.equal(matchTimetable(tt,at('09:00'))?.id,'a');
  assert.equal(matchTimetable(tt,at('12:00')),null);
  assert.equal(matchTimetable(tt,at('09:00',6)),null,'other day');
});

test('tolerance of 10 minutes before and after a class',()=>{
  const tt=[slot('a','Analyse',MON,'08:00','10:00')];
  assert.equal(matchTimetable(tt,at('07:50'))?.id,'a');
  assert.equal(matchTimetable(tt,at('07:49')),null);
  assert.equal(matchTimetable(tt,at('10:10'))?.id,'a');
  assert.equal(matchTimetable(tt,at('10:11')),null);
});

test('back-to-back classes: the one that started most recently wins',()=>{
  const tt=[slot('a','Analyse',MON,'08:00','10:00'),slot('b','Physique',MON,'10:00','12:00')];
  assert.equal(matchTimetable(tt,at('09:55'))?.id,'a','b has not started yet');
  assert.equal(matchTimetable(tt,at('10:00'))?.id,'b');
  assert.equal(matchTimetable(tt,at('10:05'))?.id,'b','a is only in its after-tolerance');
});

test('overlapping entries: the most recent start wins',()=>{
  const tt=[slot('long','Analyse',MON,'08:00','12:00'),slot('short','Physique',MON,'09:30','10:30')];
  assert.equal(matchTimetable(tt,at('09:00'))?.id,'long');
  assert.equal(matchTimetable(tt,at('09:45'))?.id,'short');
  assert.equal(matchTimetable(tt,at('11:00'))?.id,'long');
});

test('before any class has started, the earliest upcoming one in tolerance wins',()=>{
  const tt=[slot('b','Physique',MON,'08:08','09:00'),slot('a','Analyse',MON,'08:05','09:00')];
  assert.equal(matchTimetable(tt,at('08:00'))?.id,'a');
});

test('invalid entries are ignored',()=>{
  const tt=[slot('x','Analyse',MON,'10:00','09:00'),slot('y','Analyse',MON,'bad','09:00'),null];
  assert.equal(matchTimetable(tt,at('09:30')),null);
  assert.equal(matchTimetable(undefined,at('09:30')),null);
});

test('timetable → new session when none was created today',()=>{
  const old={id:'s1',number:1,createdAt:new Date(2026,9,1,9).toISOString()};
  const courses=[course('Analyse',[old])];
  const d=resolveCameraDestination({courses,timetable:[slot('a','Analyse',MON,'08:00','10:00')],last:null},at('09:00'));
  assert.deepEqual({...d},{courseId:'Analyse',sectionId:'Analyse-CM',sessionId:null,source:'timetable'});
});

test('timetable → keeps adding to the session started today',()=>{
  const today={id:'s2',number:2,createdAt:at('08:10').toISOString()};
  const courses=[course('Analyse',[{id:'s1',number:1,createdAt:new Date(2026,9,1).toISOString()},today])];
  const d=resolveCameraDestination({courses,timetable:[slot('a','Analyse',MON,'08:00','10:00')],last:null},at('09:00'));
  assert.equal(d.sessionId,'s2');
});

test('no timetable match → last used destination',()=>{
  const courses=[course('Analyse',[{id:'s1',number:1}])];
  const d=resolveCameraDestination({courses,timetable:[],last:{courseId:'Analyse',sectionId:'Analyse-CM',sessionId:'s1'}},at('09:00'));
  assert.deepEqual({...d},{courseId:'Analyse',sectionId:'Analyse-CM',sessionId:'s1',source:'last'});
});

test('last used session deleted → same section, new session',()=>{
  const courses=[course('Analyse',[])];
  const d=resolveCameraDestination({courses,timetable:[],last:{courseId:'Analyse',sectionId:'Analyse-CM',sessionId:'gone'}},at('09:00'));
  assert.equal(d.sessionId,null);
  assert.equal(d.source,'last');
});

test('timetable entry pointing at a deleted course falls back to last used',()=>{
  const courses=[course('Analyse')];
  const d=resolveCameraDestination({courses,timetable:[slot('a','Deleted',MON,'08:00','10:00')],last:{courseId:'Analyse',sectionId:'Analyse-TD'}},at('09:00'));
  assert.equal(d.source,'last');
  assert.equal(d.sectionId,'Analyse-TD');
});

test('no timetable and no history → no destination (the user must choose)',()=>{
  assert.equal(resolveCameraDestination({courses:[course('Analyse')],timetable:[],last:null},at('09:00')),null);
  assert.equal(resolveCameraDestination({courses:[course('Analyse')],timetable:[],last:{courseId:'Deleted',sectionId:'x'}},at('09:00')),null);
});

test('next session number follows the last one in the section',()=>{
  assert.equal(nextSessionNumber({sessions:[]}),1);
  assert.equal(nextSessionNumber({sessions:[{number:1},{number:4}]}),5);
  assert.equal(nextSessionNumber(undefined),1);
});

test('recent destinations: newest first, unique, max 5, deleted places removed',()=>{
  let r=[];
  for(const s of ['a','b','c','d','e','f'])r=pushRecentDestination(r,{courseId:'Analyse',sectionId:'Analyse-CM',sessionId:s});
  assert.equal(r.length,5);
  assert.equal(r[0].sessionId,'f');
  r=pushRecentDestination(r,{courseId:'Analyse',sectionId:'Analyse-CM',sessionId:'d'});
  assert.deepEqual([...r.map(x=>x.sessionId)],['d','f','e','c','b']);
  const courses=[course('Analyse',[{id:'d'},{id:'f'}])];
  assert.deepEqual([...validRecentDestinations(r,courses).map(x=>x.sessionId)],['d','f']);
});

test('recent: a created session replaces the "new session" entry of its section',()=>{
  let r=pushRecentDestination([],{courseId:'A',sectionId:'A-CM',sessionId:null});
  r=pushRecentDestination(r,{courseId:'B',sectionId:'B-TD',sessionId:null});
  r=pushRecentDestination(r,{courseId:'A',sectionId:'A-CM',sessionId:'s9'});
  assert.deepEqual(JSON.parse(JSON.stringify(r)),[{courseId:'A',sectionId:'A-CM',sessionId:'s9'},{courseId:'B',sectionId:'B-TD',sessionId:null}]);
});
