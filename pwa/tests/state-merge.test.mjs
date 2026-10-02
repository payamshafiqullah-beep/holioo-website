// Cross-device merge of the course structure (features/state-merge.js).
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};
vm.runInNewContext(fs.readFileSync(new URL('../features/state-merge.js',import.meta.url),'utf8')+'\n;this.api={syncStamp,syncMerge,syncFlatten,syncSharedPart,syncHash};',ctx);
const api=ctx.api;const syncStamp=api.syncStamp,syncSharedPart=api.syncSharedPart,syncHash=api.syncHash;
const syncMerge=(...a)=>JSON.parse(JSON.stringify(api.syncMerge(...a)));
const clone=x=>JSON.parse(JSON.stringify(x));
const plain=x=>JSON.parse(JSON.stringify(x));

function base(){
  return{courses:[{id:'c1',name:'Analyse',color:'#506BFF',defaultSectionsSeeded:true,sections:[
    {id:'x1',name:'CM',type:'CM',sortOrder:0,sessions:[{id:'s1',number:1,title:'CM 1',photoIds:['p1','p2'],createdAt:'2026-10-01'}]},
    {id:'x2',name:'TD',type:'TD',sortOrder:1,sessions:[]}]}],inbox:[],sync:{}};
}
// Two devices that start from the same synced state; each edit is saved (stamped) at time t.
function devices(){
  const a=base(),b=clone(a);
  const pa={state:a,flat:syncStamp(a,null,1).flat},pb={state:b,flat:syncStamp(b,null,1).flat};
  const save=(d,t)=>{const r=syncStamp(d.state,d.flat,t);d.flat=r.flat;return r.changed};
  return{a:pa,b:pb,save};
}
const session=(s,id)=>s.courses.flatMap(c=>c.sections).flatMap(x=>x.sessions).find(q=>q.id===id);

test('first save after loading stamps nothing; an edit stamps only what changed',()=>{
  const{a,save}=devices();
  assert.equal(save(a,5),false,'no change');
  session(a.state,'s1').title='CM 1 bis';
  assert.equal(save(a,10),true);
  assert.equal(session(a.state,'s1').updatedAt,10);
  assert.equal(a.state.courses[0].updatedAt,undefined,'parent untouched');
});

test('edits on two devices to different things are both kept',()=>{
  const{a,b,save}=devices();
  session(a.state,'s1').title='Intro';save(a,10);
  b.state.courses[0].color='#FF0000';save(b,20);
  const m=syncMerge(a.state,b.state);
  assert.equal(session(m,'s1').title,'Intro');
  assert.equal(m.courses[0].color,'#FF0000');
});

test('the same field edited on both: the newer edit wins',()=>{
  const{a,b,save}=devices();
  session(a.state,'s1').title='Old';save(a,10);
  session(b.state,'s1').title='New';save(b,20);
  assert.equal(session(syncMerge(a.state,b.state),'s1').title,'New');
  assert.equal(session(syncMerge(b.state,a.state),'s1').title,'New','order of arguments does not matter');
});

test('photos added on both devices to the same séance are all kept, none twice',()=>{
  const{a,b,save}=devices();
  session(a.state,'s1').photoIds.push('pa');save(a,10);
  session(b.state,'s1').photoIds.push('pb');save(b,20);
  assert.deepEqual(plain(session(syncMerge(a.state,b.state),'s1').photoIds),['p1','p2','pb','pa']);
});

test('a deletion wins over an older copy and is not brought back',()=>{
  const{a,b,save}=devices();
  a.state.courses[0].sections[0].sessions=[];save(a,10);
  const m=syncMerge(b.state,a.state);
  assert.equal(session(m,'s1'),undefined);
  assert.ok(m.sync.deleted.s1&&m.sync.deleted.p1,'séance and its photos are tombstoned');
});

test('a deleted photo disappears; reorder on the other device is kept',()=>{
  const{a,b,save}=devices();
  session(a.state,'s1').photoIds=['p2'];save(a,10);
  session(b.state,'s1').photoIds=['p2','p1'];save(b,20);
  assert.deepEqual(plain(session(syncMerge(a.state,b.state),'s1').photoIds),['p2']);
});

test('a séance moved to another section is not duplicated',()=>{
  const{a,b,save}=devices();
  const[cm,td]=a.state.courses[0].sections;td.sessions.push(cm.sessions.pop());save(a,10);
  const m=syncMerge(b.state,a.state);
  assert.equal(m.courses[0].sections[0].sessions.length,0);
  assert.deepEqual(m.courses[0].sections[1].sessions.map(s=>s.id),['s1']);
});

test('a course created on the other device is added, in that device\'s order',()=>{
  const{a,b,save}=devices();
  b.state.courses.unshift({id:'c2',name:'Physique',sections:[]});save(b,20);
  assert.deepEqual(syncMerge(a.state,b.state).courses.map(c=>c.id),['c2','c1']);
});

test('old states without stamps merge without losing anything',()=>{
  const a=base(),b=base();delete a.sync;delete b.sync;
  b.courses.push({id:'c9',name:'Chimie',sections:[]});
  const m=syncMerge(a,b);
  assert.deepEqual(m.courses.map(c=>c.id),['c1','c9']);
  assert.deepEqual(plain(session(m,'s1').photoIds),['p1','p2']);
});

test('first join: untouched starter courses with a name the account already has are dropped',()=>{
  const fresh={courses:[{id:'n1',name:'analyse ',sections:[{id:'n2',name:'CM',sessions:[]}]},{id:'n3',name:'Chimie',sections:[]}],inbox:[]};
  const m=syncMerge(fresh,base(),{firstJoin:true});
  assert.deepEqual(m.courses.map(c=>c.name).sort(),['Analyse','Chimie']);
});

test('merging a state with itself changes nothing (no endless re-upload)',()=>{
  const{a,save}=devices();session(a.state,'s1').title='X';save(a,10);
  const m=syncMerge(a.state,clone(a.state));
  assert.equal(syncHash(JSON.stringify(syncSharedPart(m))),syncHash(JSON.stringify(syncSharedPart(a.state))));
});

test('undo: an id that comes back loses its tombstone',()=>{
  const{a,save}=devices();
  const keep=session(a.state,'s1').photoIds;session(a.state,'s1').photoIds=['p1'];save(a,10);
  assert.ok(a.state.sync.deleted.p2);
  session(a.state,'s1').photoIds=keep;save(a,11);
  assert.equal(a.state.sync.deleted.p2,undefined);
});

test('undo after the deletion already reached the other device: the photo comes back there too',()=>{
  const{a,b,save}=devices();
  const keep=[...session(a.state,'s1').photoIds];
  session(a.state,'s1').photoIds=['p1'];save(a,10);
  b.state=syncMerge(b.state,a.state);b.flat=null;                  // the deletion reached b
  assert.deepEqual(plain(session(b.state,'s1').photoIds),['p1']);
  session(a.state,'s1').photoIds=keep;save(a,12);                  // Annuler on a
  const m=syncMerge(b.state,a.state);
  assert.deepEqual(plain(session(m,'s1').photoIds),['p1','p2']);
  assert.equal(m.sync.deleted.p2,undefined);
});
