import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=fs.readFileSync(new URL('../features/notes/notebook-ink.js',import.meta.url),'utf8');
const load=()=>Function(
  'DB','state','uid','photoBlob','thumbUrl','Notice','icon','byId','matchMedia','window','document','requestAnimationFrame','HoliooPerfectFreehand',
  `${source}; return {syncNotebookBlocks,snapRulerPoints,eraseNotebookStrokes,visibleInkBlocks,visibleInkStrokes,strokeTouchesPath};`
)(
  {get:async()=>null,put:async()=>{}},
  {settings:{drawWithFinger:false}},
  ()=>'test-id',
  row=>row?.blob,
  ()=>'blob:url',
  text=>text,
  name=>name,
  ()=>null,
  ()=>({matches:false}),
  {addEventListener(){},removeEventListener(){},devicePixelRatio:1},
  {querySelectorAll:()=>[]},
  fn=>fn(),
  {getStroke:points=>points}
);

test('syncNotebookBlocks keeps photo order and preserves blank pages',()=>{
  const {syncNotebookBlocks,visibleInkBlocks}=load();
  const doc={blocks:[
    {id:'p2',type:'photo',photoId:'p2',deleted:false},
    {id:'blank:1',type:'blank',deleted:false},
    {id:'old',type:'photo',photoId:'old',deleted:false}
  ],strokes:[]};
  syncNotebookBlocks(doc,{photoIds:['p1','p2']});
  assert.deepEqual(visibleInkBlocks(doc).map(b=>b.id),['p1','p2','blank:1']);
  assert.equal(doc.blocks.find(b=>b.id==='old').deleted,true);
});

test('snapRulerPoints snaps near horizontal, vertical and diagonal angles',()=>{
  const {snapRulerPoints}=load();
  const horizontal=snapRulerPoints([[.1,.1,.5],[.8,.13,.5]]);
  assert.equal(horizontal[1][1],.1);
  const vertical=snapRulerPoints([[.4,.2,.5],[.43,.9,.5]]);
  assert.ok(Math.abs(vertical[1][0]-.4)<.0001);
  const diagonal=snapRulerPoints([[.1,.1,.5],[.5,.48,.5]]);
  assert.ok(Math.abs((diagonal[1][0]-.1)-(diagonal[1][1]-.1))<.0001);
});

test('eraseNotebookStrokes soft deletes any touched stroke',()=>{
  const {eraseNotebookStrokes}=load();
  const doc={strokes:[
    {id:'a',blockId:'p1',points:[[.1,.1,.5],[.9,.9,.5]],deleted:false},
    {id:'b',blockId:'p1',points:[[.1,.9,.5],[.2,.9,.5]],deleted:false},
    {id:'c',blockId:'p2',points:[[.1,.1,.5],[.9,.9,.5]],deleted:false}
  ]};
  const deleted=eraseNotebookStrokes(doc,'p1',[[.45,.55,.5],[.55,.45,.5]]);
  assert.deepEqual(deleted,['a']);
  assert.equal(doc.strokes[0].deleted,true);
  assert.equal(doc.strokes[1].deleted,false);
  assert.equal(doc.strokes[2].deleted,false);
});
