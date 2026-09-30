// Scanner detection (features/scan-detect.js) with the same OpenCV.js build as the app, on one
// synthetic photo per mode. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as S from './helpers/scenes.mjs';

const require=createRequire(import.meta.url);
const ctx={console};ctx.self=ctx;
vm.createContext(ctx);
for(const f of ['../features/scan-core.js','../features/scan-detect.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);

let cvPromise;
function opencv(){
  cvPromise??=new Promise(resolve=>{
    const cv=require('@techstark/opencv-js');
    const done=()=>{if(typeof cv.then==='function')delete cv.then;resolve(cv)};
    if(cv.Mat)done();else cv.onRuntimeInitialized=done;
  });
  return cvPromise;
}
const maxErr=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])));

for(const [name,scene,mode,tol] of [
  ['sheet on a desk','documentScene','document',.03],
  ['whiteboard seen from a seat, with glare','whiteboardScene','board',.04],
  ['blackboard','blackboardScene','board',.035],
  ['open book (whole spread)','bookScene','book',.03],
  ['ID card','idCardScene','id',.03]
]){
  test(`detects the ${name}`,async()=>{
    const cv=await opencv(),{img,quad}=S[scene]();
    const r=ctx.scanDetect(cv,img,mode);
    assert.ok(r.quad,'a quad is found');
    const err=maxErr(r.quad,quad);
    assert.ok(err<tol,`corner error ${err.toFixed(3)} (max ${tol})`);
  });
}

test('book: the fold is found and the spread is split into two pages',async()=>{
  const cv=await opencv(),{img,quad,gutter}=S.bookScene();
  const r=ctx.scanDetect(cv,img,'book');
  const t=ctx.ScanCore.findGutter(r.quad,ctx.scanLumSampler(img));
  assert.ok(Math.abs(t-gutter)<.03,`fold at ${t.toFixed(3)}, expected ${gutter}`);
  const [left,right]=ctx.ScanCore.splitSpread(r.quad,t);
  assert.ok(left[1][0]<right[1][0]&&Math.abs(left[1][0]-right[0][0])<1e-9,'pages share the fold line');
});

test('no page in an empty scene',async()=>{
  const cv=await opencv(),img=S.makeImage(512,384,[120,110,100]);S.noise(img,12);
  assert.equal(ctx.scanDetect(cv,img,'document').quad,null);
});

test('sharpness drops on a shaky photo and brightness on a dark one',async()=>{
  const cv=await opencv();
  const sharp=S.documentScene().img,shaky=S.documentScene().img;S.blur(shaky,3);
  const a=ctx.scanDetect(cv,sharp,'document'),b=ctx.scanDetect(cv,shaky,'document');
  assert.ok(b.sharpness<a.sharpness/3,`${b.sharpness.toFixed(0)} vs ${a.sharpness.toFixed(0)}`);
  assert.equal(ctx.ScanCore.judgeFrame(a,'document').ok,true);
  assert.equal(ctx.ScanCore.judgeFrame(b,'document').warn,'blur');
  const dark=S.documentScene().img;for(let i=0;i<dark.data.length;i+=4){dark.data[i]*=.2;dark.data[i+1]*=.2;dark.data[i+2]*=.2}
  assert.equal(ctx.ScanCore.judgeFrame(ctx.scanDetect(cv,dark,'document'),'document').warn,'dark');
});

test('QR code is decoded (jsQR, as in the scanner worker)',async()=>{
  const QRCode=require('qrcode'),jsQR=require('jsqr');
  const text='https://www.holioo.fr/app/';
  const qr=QRCode.create(text,{errorCorrectionLevel:'M'}),n=qr.modules.size;
  const matrix=Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>qr.modules.get(y,x)));
  const {img}=S.qrScene(matrix);
  const r=jsQR(img.data,img.width,img.height);
  assert.equal(r?.data,text);
});
