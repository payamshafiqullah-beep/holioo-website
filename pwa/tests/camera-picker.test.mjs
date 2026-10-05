// Destination chip and sheet (features/camera/camera-picker.js): what the two lines of the chip say.
// The DOM part is checked in the browser; the wording is logic. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={console,matchMedia:()=>({matches:false})};ctx.self=ctx;vm.createContext(ctx);
for(const f of ['../features/camera/camera-i18n.js','../features/camera/camera-picker.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);

run(`
  var state={courses:[
    {id:'c1',name:'VHDL',color:'#8B5CF6',sections:[{id:'s1',name:'CM',sessions:[{id:'x1',number:1,title:'CM 1',photoIds:['a','b','c']},{id:'x2',number:2,title:'Révision',photoIds:[]}]},{id:'s2',name:'TD',sessions:[]}]},
    {id:'c2',name:'Maths',sections:[{id:'s3',name:'TP',sessions:[]}]}
  ]};
  var nextSessionNumber=sec=>sec.sessions.length+1;
`);
const parts=d=>JSON.parse(JSON.stringify(run(`cameraDestinationParts(${JSON.stringify(d)})`)));

test('chip: the session title that already starts with the section is not repeated ("CM 1", not "CM · CM 1")',()=>{
  const p=parts({courseId:'c1',sectionId:'s1',sessionId:'x1'});
  assert.equal(p.course,'VHDL');assert.equal(p.detail,'CM 1');assert.equal(p.isNew,false);assert.equal(p.photos,3);
});

test('chip: a custom session title keeps its section in front',()=>{
  assert.equal(parts({courseId:'c1',sectionId:'s1',sessionId:'x2'}).detail,'CM · Révision');
});

test('chip: a session still to be created says so, with its number',()=>{
  const p=parts({courseId:'c1',sectionId:'s2',sessionId:null});
  assert.equal(p.detail,'TD · Nouvelle séance (1)');assert.equal(p.isNew,true);
});

test('chip: the course colour is used, with a default for a course without one',()=>{
  assert.equal(parts({courseId:'c1',sectionId:'s1',sessionId:null}).color,'#8B5CF6');
  assert.equal(parts({courseId:'c2',sectionId:'s3',sessionId:null}).color,'#5B67F1');
});

test('chip: a destination whose course or section is gone gives nothing (the chip shows "Choisir la destination")',()=>{
  assert.equal(run(`cameraDestinationParts({courseId:'zz',sectionId:'s1'})`),null);
  assert.equal(run(`cameraDestinationParts({courseId:'c1',sectionId:'zz'})`),null);
  assert.equal(run(`cameraDestinationParts(null)`),null);
  assert.equal(run(`cameraDestinationLabel(null)`),'Choisir la destination');
});

test('the one-line label used by toasts and the review screen is unchanged',()=>{
  assert.equal(run(`cameraDestinationLabel({courseId:'c1',sectionId:'s1',sessionId:'x1'})`),'VHDL · CM · CM 1');
});
