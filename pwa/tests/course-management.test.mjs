import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const coursesCode=[read('../features/course-actions.js'),read('../pages/CoursesPage.js')].join(';');
const course=(id,photos=[])=>({id,name:id,sections:[{id:`sec-${id}`,name:'CM',sessions:[{id:`session-${id}`,title:'Séance 1',photoIds:photos}]}]});
test('deleting a populated course preserves unique photos and PDFs, clears stale destinations',()=>{
 const state={courses:[course('a',['p1','p2','p2','shared']),course('b',['shared'])],inbox:[{id:'in',photoIds:['p1']}],files:[{id:'pdf',courseId:'a'}],favorites:['session-a','pdf'],cameraLast:{courseId:'a'},timetable:[{courseId:'a'},{courseId:'b'}]};
 const ctx={state,uid:()=> 'recovered',now:()=> 'today',currentCourseId:'a',currentSectionId:'sec-a',currentSessionId:'session-a'};
 vm.createContext(ctx);vm.runInContext(coursesCode,ctx);ctx.removeCourse('a');
 assert.deepEqual(state.courses.map(c=>c.id),['b']);
 assert.deepEqual(Array.from(state.inbox[1].photoIds),['p2']);
 assert.equal(state.files[0].id,'pdf');assert.equal(state.cameraLast,null);
 assert.deepEqual(state.timetable.map(t=>t.courseId),['b']);assert.deepEqual(state.favorites,['pdf']);assert.equal(ctx.currentCourseId,null);
 ctx.removeCourse('b');assert.equal(state.courses.length,0);assert.deepEqual(Array.from(state.inbox[2].photoIds),['shared']);
});
test('loading a saved empty course list does not recreate defaults',()=>{
 const core=read('../core.js');const load=core.slice(core.indexOf('function loadState(){'),core.indexOf('\nlet state=loadState();'));
 const ctx={localStorage:{getItem:()=>JSON.stringify({courses:[],inbox:[],files:[]})},stateKey:()=> 'key',stateOwner:'',STORE_KEY:'key',LEGACY_KEY:'old',defaultState:()=>({profile:{},settings:{},courses:[course('default')]}),ensureDefaultSections:()=>{},console};
 vm.createContext(ctx);vm.runInContext(load,ctx);assert.equal(ctx.loadState().courses.length,0);
});
test('deleting one session keeps its unique photos in Captures and its ink is purged',()=>{
 const a=course('a',['p1','shared']);a.sections[0].sessions.push({id:'s2',title:'Séance 2',photoIds:['p3']});
 const state={courses:[a,course('b',['shared'])],inbox:[],favorites:[]};const purged=[];
 const ctx={state,uid:()=> 'recovered',now:()=> 'today',currentSessionId:'session-a',console,
  purgeSessionInk:ids=>{purged.push(...ids);return Promise.resolve()},
  findSessionContext:id=>{for(const c of state.courses)for(const section of c.sections)for(const session of section.sessions)if(session.id===id)return{course:c,section,session};return null}};
 vm.createContext(ctx);vm.runInContext(coursesCode,ctx);ctx.removeSession('session-a');
 assert.deepEqual(a.sections[0].sessions.map(s=>s.id),['s2']);
 assert.equal(state.inbox.length,1);assert.equal(state.inbox[0].title,'a · Séance 1');assert.deepEqual(Array.from(state.inbox[0].photoIds),['p1']);
 assert.deepEqual(purged,['session-a']);assert.equal(ctx.currentSessionId,null);
});
test('only custom sections can be deleted; their sessions’ photos go to Captures',()=>{
 const a=course('a');a.sections.push({id:'x',name:'Projet',type:'CUSTOM',sessions:[{id:'q1',title:'Projet 1',photoIds:['p9']}]});
 const state={courses:[a],inbox:[],favorites:[]};const purged=[];
 const ctx={state,uid:()=> 'recovered',now:()=> 'today',currentSectionId:'x',currentSessionId:'q1',console,purgeSessionInk:ids=>{purged.push(...ids);return Promise.resolve()}};
 vm.createContext(ctx);vm.runInContext(coursesCode,ctx);
 ctx.removeSection(a,'sec-a');assert.equal(a.sections.length,2);
 ctx.removeSection(a,'x');assert.deepEqual(a.sections.map(s=>s.id),['sec-a']);
 assert.deepEqual(Array.from(state.inbox[0].photoIds),['p9']);assert.deepEqual(purged,['q1']);assert.equal(ctx.currentSectionId,null);
});
test('course and section names must stay unique (they are Drive folder names)',()=>{
 const a=course('Maths');a.sections.push({id:'x',name:'Projet',type:'CUSTOM',sessions:[]});
 const ctx={state:{courses:[a,course('Physique')]}};vm.createContext(ctx);vm.runInContext(coursesCode,ctx);
 assert.ok(ctx.courseNameProblem('physique','Maths'));assert.equal(ctx.courseNameProblem('Maths','Maths'),'');assert.equal(ctx.courseNameProblem('Chimie'),'');assert.ok(ctx.courseNameProblem(''));
 assert.ok(ctx.sectionNameProblem(a,'td'));assert.ok(ctx.sectionNameProblem(a,'projet'));assert.equal(ctx.sectionNameProblem(a,'Projet','x'),'');assert.equal(ctx.sectionNameProblem(a,'Examen'),'');
});
