// Geometry of the photo editor (features/image-pipeline.js): crop boxes always stay inside the
// photo, aspect choices follow the photo's orientation, and "no change" is recognised.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx={};ctx.self=ctx;
vm.runInNewContext(fs.readFileSync(new URL('../features/image-pipeline.js',import.meta.url),'utf8'),ctx);
const I=ctx.HoliooImage;
const inside=(quad,ratio)=>quad.every(([x,y])=>x>-1e-6&&x<1+1e-6&&y>-1e-6&&y<ratio+1e-6);
const close=(a,b,e=1e-6)=>Math.abs(a-b)<e;

test('the default edit is recognised as "no change"',()=>{
  assert.equal(I.isIdentity(I.defaultEdit()),true);
  assert.equal(I.isIdentity({...I.defaultEdit(),box:I.fullBox(1.33)}),true,'full-photo box is not a crop');
  assert.equal(I.isIdentity({...I.defaultEdit(),filter:'document'}),false);
  assert.equal(I.isIdentity({...I.defaultEdit(),rot:1}),false);
  assert.equal(I.isIdentity({...I.defaultEdit(),box:{cx:0,cy:0,w:.5,h:.5}}),false);
});

test('straightened crop boxes always stay inside the photo',()=>{
  for(const ratio of [.5625,.75,1,1.333,1.778])for(const angle of [-45,-20,-3.5,0,7,30,45])for(const aspect of ['free','original','a4','4:3','16:9','1:1']){
    const box=I.boxForAspect(ratio,aspect,angle);
    assert.ok(inside(I.boxToQuad(box,angle,ratio),ratio),`${ratio} ${angle}° ${aspect}`);
    const r=I.aspectRatio(aspect,ratio);if(r)assert.ok(close(box.h/box.w,r,1e-9),'keeps the chosen aspect');
  }
});

test('the largest box without rotation is the whole photo',()=>{
  const b=I.fullBox(1.5,0);
  assert.ok(close(b.w,1)&&close(b.h,1.5)&&b.cx===0&&b.cy===0);
});

test('aspect choices follow the photo orientation',()=>{
  assert.ok(close(I.aspectRatio('a4',1.4),Math.SQRT2),'portrait photo → portrait A4');
  assert.ok(close(I.aspectRatio('a4',.7),1/Math.SQRT2),'landscape photo → landscape A4');
  assert.equal(I.aspectRatio('1:1',.7),1);
  assert.equal(I.aspectRatio('free',.7),null);
});

test('corners are put in order TL, TR, BR, BL whatever the input order',()=>{
  const q=[[.9,.1],[.1,.8],[.1,.1],[.9,.8]];
  assert.deepEqual(JSON.parse(JSON.stringify(I.orderQuad(q))),[[.1,.1],[.9,.1],[.9,.8],[.1,.8]]);
});

test('quarter turns swap width and height',()=>{
  assert.deepEqual({...I.orientedSize(4000,3000,1)},{w:3000,h:4000});
  assert.deepEqual({...I.orientedSize(4000,3000,2)},{w:4000,h:3000});
});
