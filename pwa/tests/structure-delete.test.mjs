// Deleting a section or a séance: photos go back to "Captures à trier" unless another séance still holds them,
// references are cleaned, and a deleted default section (CM/TD/TP) is not brought back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const coursesCode=read('../pages/CoursesPage.js');
const coreLine=read('../core.js').split(/\r?\n/).find(l=>l.startsWith('function ensureDefaultSections'));

const session=(id,photoIds)=>({id,title:`Séance ${id}`,photoIds,createdAt:'2026-10-01'});
function setup(){
  const course={id:'c1',name:'Maths',defaultSectionsSeeded:true,sections:[
    {id:'cm',name:'CM',sessions:[session('s1',['p1','p2']),session('s2',['p2','p3'])]},
    {id:'td',name:'TD',sessions:[session('s3',['p4'])]},
    {id:'tp',name:'TP',sessions:[]}]};
  const state={courses:[course],inbox:[{id:'in',photoIds:['p9']}],favorites:['s1','c1'],files:[{id:'pdf',sessionIds:['s1','s3']}],
    cameraLast:{courseId:'c1',sectionId:'td',sessionId:'s3'},timetable:[{courseId:'c1',sectionId:'td'},{courseId:'c1',sectionId:'cm'}]};
  const ctx={state,course,uid:()=>'new-id',now:()=>'today',currentSessionId:'s3',currentSectionId:'td',currentCourseId:'c1'};
  vm.createContext(ctx);vm.runInContext(coursesCode,ctx);
  return{ctx,state,course};
}

test('deleting a séance keeps photos held elsewhere, parks the others in Captures à trier and cleans references',()=>{
  const{ctx,state,course}=setup();
  ctx.removeSessions(course,course.sections[0],[course.sections[0].sessions[0]]);
  assert.deepEqual(course.sections[0].sessions.map(s=>s.id),['s2']);
  const parked=state.inbox.filter(b=>b.id==='new-id');
  assert.deepEqual(parked.map(b=>[...b.photoIds]),[['p1']]);   // p2 is still in s2
  assert.deepEqual([...state.favorites],['c1']);
  assert.deepEqual([...state.files[0].sessionIds],['s3']);
});

test('deleting a section removes its séances, parks their photos and cleans the camera and timetable references',()=>{
  const{ctx,state,course}=setup();
  const ids=ctx.removeSection(course,course.sections[1]);
  assert.deepEqual([...ids],['s3']);
  assert.deepEqual(course.sections.map(s=>s.id),['cm','tp']);
  assert.deepEqual(state.inbox.flatMap(b=>[...b.photoIds]).sort(),['p4','p9']);
  assert.equal(state.cameraLast,null);
  assert.deepEqual(state.timetable.map(t=>t.sectionId),['cm']);
  assert.equal(ctx.currentSectionId,null);assert.equal(ctx.currentSessionId,null);
});

test('default sections are created once: a deleted one does not come back, a new course gets all three',()=>{
  const ctx={uid:(()=>{let n=0;return()=>`id${++n}`})()};vm.createContext(ctx);vm.runInContext(coreLine,ctx);
  const fresh={sections:[]};ctx.ensureDefaultSections(fresh);
  assert.deepEqual(fresh.sections.map(s=>s.name),['CM','TD','TP']);assert.equal(fresh.defaultSectionsSeeded,true);
  fresh.sections=fresh.sections.filter(s=>s.name!=='TD');ctx.ensureDefaultSections(fresh);
  assert.deepEqual(fresh.sections.map(s=>s.name),['CM','TP']);
  const legacy={sections:[{id:'x',name:'Projet',sessions:[]}]};ctx.ensureDefaultSections(legacy);   // an older course is completed once
  assert.deepEqual(legacy.sections.map(s=>s.name),['CM','TD','TP','Projet']);
});
