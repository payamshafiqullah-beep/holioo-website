// Board-corner model glue (features/scan-ml.js): what the model's output is turned into. The model itself
// is not in the repository (see tools/board-corners/); this checks the contract and that nothing is trusted
// blindly. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={console};ctx.self=ctx;vm.createContext(ctx);
for(const f of ['../features/scan-core.js','../features/scan-ml.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const ML=vm.runInContext('ScanML',ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const board=[.2,.2, .8,.18, .84,.78, .16,.8];   // TL TR BR BL

test('a model output with a board in view becomes four ordered corners',()=>{
  const r=ML.parse([...board,.93]);
  assert.deepEqual(plain(r.quad),[[.2,.2],[.8,.18],[.84,.78],[.16,.8]]);
  assert.equal(r.presence,.93);
});

test('corners in any order are put in reading order',()=>{
  const r=ML.parse([.84,.78, .2,.2, .16,.8, .8,.18, .9]);
  assert.deepEqual(plain(r.quad),[[.2,.2],[.8,.18],[.84,.78],[.16,.8]]);
});

test('no board in view, or a logit instead of a probability, is understood',()=>{
  assert.equal(ML.parse([...board,.2]),null,'presence 0.2 is below the threshold');
  assert.equal(ML.parse([...board,-3]),null,'logit -3 = 5 %');
  assert.ok(ML.parse([...board,3]),'logit 3 = 95 %');
});

test('numbers that cannot be corners are refused',()=>{
  assert.equal(ML.parse([...board.slice(0,7)]),null,'too short');
  assert.equal(ML.parse([1.4,.2, .8,.18, .84,.78, .16,.8, .9]),null,'a corner far outside the frame');
  assert.equal(ML.parse([.2,.2, .8,.2, .5,.3, .2,.8, .9]),null,'a dart (one corner inside the others)');
  assert.equal(ML.parse([.5,.5, .51,.5, .51,.51, .5,.51, .9]),null,'a speck');
  assert.equal(ML.parse(null),null);
});

test('it is off until a model is installed: no model, no work, no crash',async()=>{
  assert.equal(ML.ready(),false);
  assert.equal(await ML.predict({videoWidth:640,videoHeight:360},null),null);
});
