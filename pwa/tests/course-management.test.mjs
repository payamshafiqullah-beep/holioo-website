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
test('long press reorders courses without navigation; a quick tap or delete button does not drag',()=>{
 const listeners=new Map(), timers=[];let target,order;
 const classes=()=>({add(){},remove(){}});
 const host={children:[],classList:classes(),addEventListener:(n,fn)=>listeners.set(`host-${n}`,fn),insertBefore(card,next){this.children=this.children.filter(x=>x!==card);const i=this.children.indexOf(next);this.children.splice(i<0?this.children.length:i,0,card)}};
 function card(id){const c={dataset:{course:id},parentElement:host,classList:classes(),style:{},getBoundingClientRect:()=>({left:0,top:100,width:300,height:120}),querySelector:()=>null,closest:s=>s==='[data-course]'?c:null,cloneNode:()=>({classList:classes(),style:{},querySelector:()=>null,remove(){}})};return c}
 const a=card('a'),hidden=card('hidden'),b=card('b');hidden.hidden=true;host.children=[a,hidden,b];
 const ctx={document:{addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n),elementFromPoint:()=>target,body:{appendChild(){}}},window:{scrollBy(){}},innerHeight:900,navigator:{},requestAnimationFrame:fn=>fn(),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:i=>{timers[i-1]=()=>{}}};
 vm.createContext(ctx);vm.runInContext(read('../ui/reorder.js'),ctx);ctx.makeReorderable(host,{itemSelector:'[data-course]',idAttribute:'course',onChange:ids=>order=Array.from(ids)});
 const down=t=>listeners.get('host-pointerdown')({target:t,pointerId:1,clientX:10,clientY:130,pointerType:'touch'});
 down(a);listeners.get('pointerup')();assert.equal(order,undefined);
 const del={closest:s=>s==='button'?del:a};down(del);assert.equal(listeners.has('pointermove'),false);
 down(a);timers.at(-1)();target=b;listeners.get('pointermove')({pointerId:1,clientX:10,clientY:300,preventDefault(){}});listeners.get('pointerup')();
 assert.deepEqual(order,['hidden','b','a']);let prevented=false;listeners.get('host-click')({preventDefault(){prevented=true},stopPropagation(){}});assert.equal(prevented,true);
});
