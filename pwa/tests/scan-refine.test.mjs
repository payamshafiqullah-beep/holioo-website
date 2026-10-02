// Sub-pixel page-edge refinement (features/scan-refine.js): from a rough outline to straight edges and
// exact corners — under a thumb, in blur and noise, on a full-size photo. No OpenCV needed.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as S from './helpers/scenes.mjs';

const ctx={console};ctx.self=ctx;vm.createContext(ctx);
for(const f of ['../features/scan-core.js','../features/scan-refine.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const R=ctx.ScanRefine;

// Worst corner distance in pixels.
const err=(a,b,W,H)=>Math.max(...a.map((p,i)=>Math.hypot((p[0]-b[i][0])*W,(p[1]-b[i][1])*H)));
// Deterministic "rough outline": every corner pushed off by up to ±amp of the frame.
function rough(quad,amp,seed=3){let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;return quad.map(([x,y])=>[x+(rnd()-.5)*amp,y+(rnd()-.5)*amp])}
const refine=(img,start,opts)=>R.refineQuad(R.toGray(img.data,img.width,img.height),img.width,img.height,start,opts);

for(const scene of ['documentScene','lowContrastScene','shadowScene','clutterScene','woodScene','turnedScene','glareScene','dimScene','blackboardScene','idCardScene']){
  test(`${scene}: a rough outline snaps to the real edges (under 0.3 px)`,()=>{
    const{img,quad}=S[scene]();
    for(let k=0;k<6;k++){
      const start=rough(quad,.02,k+1),r=refine(img,start);
      assert.ok(r.ok,'refined');
      assert.ok(err(start,quad,img.width,img.height)>2,'the start really was off');
      const e=err(r.quad,quad,img.width,img.height);
      assert.ok(e<.3,`corner error ${e.toFixed(2)} px`);
      assert.ok(r.support>.85,`support ${r.support.toFixed(2)}`);
    }
  });
}

test('a hand over a corner and an edge: hidden corners are recovered from the visible edges',()=>{
  const{img,quad}=S.handScene();
  for(let k=0;k<6;k++){
    const r=refine(img,rough(quad,.02,k+1));
    assert.ok(r.ok);
    const e=err(r.quad,quad,img.width,img.height);
    assert.ok(e<.5,`corner error ${e.toFixed(2)} px`);
    assert.ok(r.support<1&&r.support>.7,`support ${r.support.toFixed(2)} (some of the edge is covered)`);
  }
});

test('a blurred photo (5 px wide edges) is still fitted exactly',()=>{
  const{img,quad}=S.documentScene();S.blur(img,2);
  const r=refine(img,rough(quad,.02));
  assert.ok(r.ok);assert.ok(err(r.quad,quad,img.width,img.height)<.5);
});

test('heavy sensor noise and blur together, with a hand',()=>{
  const{img,quad}=S.handScene();S.blur(img,2);S.noise(img,22,9);
  const r=refine(img,rough(quad,.02));
  assert.ok(r.ok);assert.ok(err(r.quad,quad,img.width,img.height)<.8);
});

test('a printed frame inside the paper is not mistaken for the paper edge',()=>{
  const{img,quad}=S.framedScene();
  for(let k=0;k<6;k++){
    const r=refine(img,rough(quad,.024,k+1));
    assert.ok(r.ok);assert.ok(err(r.quad,quad,img.width,img.height)<.5);
  }
});

test('full-size photo: the same outline at 3× the resolution is exact to a fraction of a pixel',()=>{
  const W=1536,H=1152,img=S.makeImage(W,H,[96,80,68]);S.noise(img,8,5);
  const q=[[360,150],[1200,216],[1308,1008],[270,966]];
  S.fillPoly(img,q,[242,239,230]);S.textLines(img,q,[40,40,56],{lines:14,seed:3});S.noise(img,4,7);
  const truth=q.map(([x,y])=>[x/W,y/H]);
  const r=refine(img,rough(truth,.02));
  assert.ok(r.ok);assert.ok(err(r.quad,truth,W,H)<.5,`error ${err(r.quad,truth,W,H).toFixed(2)} px`);
});

test('no edge in the picture: nothing is invented, the outline is returned untouched',()=>{
  const img=S.makeImage(512,384,[120,110,100]);S.noise(img,12);
  const start=[[.2,.2],[.8,.2],[.8,.8],[.2,.8]];
  const r=refine(img,start);
  assert.equal(r.ok,false);assert.deepEqual(r.quad,start);assert.ok(r.support<.2);
});

test('an outline far from any page stays put instead of snapping to something else',()=>{
  const{img}=S.documentScene();
  const start=[[.02,.02],[.2,.02],[.2,.2],[.02,.2]]; // a patch of desk
  const r=refine(img,start);
  assert.equal(r.ok,false);
});

test('sides that are not page edges (the fold of a book half) are left as they are',()=>{
  const{img,quad}=S.bookScene();
  // Left half of the spread: its right side is the fold, not an edge.
  const fold=.52,top=[quad[0][0]+(quad[1][0]-quad[0][0])*fold,quad[0][1]+(quad[1][1]-quad[0][1])*fold],bottom=[quad[3][0]+(quad[2][0]-quad[3][0])*fold,quad[3][1]+(quad[2][1]-quad[3][1])*fold];
  const half=[quad[0],top,bottom,quad[3]];
  const r=refine(img,rough(half,.012),{fixed:[false,true,false,false]});
  assert.ok(r.ok);
  // The three outer sides are exact: the outer corners TL and BL match the truth.
  assert.ok(Math.hypot((r.quad[0][0]-half[0][0])*512,(r.quad[0][1]-half[0][1])*384)<.5);
  assert.ok(Math.hypot((r.quad[3][0]-half[3][0])*512,(r.quad[3][1]-half[3][1])*384)<.5);
});

test('polarity: a dark board on a light wall and a white page on a dark desk both work',()=>{
  for(const scene of['blackboardScene','documentScene']){
    const{img,quad}=S[scene](),r=refine(img,rough(quad,.02));
    assert.ok(r.ok);
    assert.equal(Math.sign(r.contrast),scene==='documentScene'?1:-1);
  }
});

test('a refinement is quick enough to run on every live frame',()=>{
  const{img,quad}=S.documentScene(),g=R.toGray(img.data,512,384),start=rough(quad,.02);
  for(let i=0;i<10;i++)R.refineQuad(g,512,384,start);
  const t=performance.now();for(let i=0;i<30;i++)R.refineQuad(g,512,384,start);
  const ms=(performance.now()-t)/30;
  assert.ok(ms<40,`${ms.toFixed(1)} ms per outline`);
});
