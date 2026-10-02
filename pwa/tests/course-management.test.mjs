import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const coursesCode=read('../pages/CoursesPage.js');
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
test('course, section and séance names must stay unique (they are Drive folder names)',()=>{
 const a=course('Maths');a.sections.push({id:'x',name:'Projet',type:'CUSTOM',sessions:[{id:'q1',title:'Projet 1'},{id:'q2',title:'Révisions'}]});
 const ctx={state:{courses:[a,course('Physique')]}};vm.createContext(ctx);vm.runInContext(read('../features/course-actions.js'),ctx);
 assert.ok(ctx.courseNameProblem(' physique ','Maths'));assert.equal(ctx.courseNameProblem('Maths','Maths'),'');assert.equal(ctx.courseNameProblem('Chimie'),'');assert.ok(ctx.courseNameProblem(''));
 assert.ok(ctx.sectionNameProblem(a,'cm'));assert.ok(ctx.sectionNameProblem(a,'projet'));assert.equal(ctx.sectionNameProblem(a,'Projet','x'),'');assert.equal(ctx.sectionNameProblem(a,'Examen'),'');
 const p=a.sections.find(s=>s.id==='x');
 assert.ok(ctx.sessionTitleProblem(p,'révisions'));assert.equal(ctx.sessionTitleProblem(p,'Révisions','q2'),'');assert.equal(ctx.sessionTitleProblem(p,'Projet 2'),'');
});
