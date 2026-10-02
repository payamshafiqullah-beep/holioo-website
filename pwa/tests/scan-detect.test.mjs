// Scanner detection (features/scan-detect.js) with the same OpenCV.js build as the app: one synthetic photo
// per mode, then the hard cases (white on white, a hand on the page, a mat, a shadow, a printed frame…).
// Corners must land within a pixel or two (frame 512 px wide). Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as S from './helpers/scenes.mjs';

const require=createRequire(import.meta.url);
const ctx={console};ctx.self=ctx;
vm.createContext(ctx);
for(const f of ['../features/scan-core.js','../features/scan-refine.js','../features/scan-detect.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);

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
  ['sheet on a desk','documentScene','document',.004],
  ['whiteboard seen from a seat, with glare','whiteboardScene','board',.006],
  ['low-contrast framed classroom board','boardFrameOnlyScene','board',.018],
  ['blackboard','blackboardScene','board',.004],
  // boards of every colour, wall, light and angle (frames are cropped at the board's edge or at the frame's)
  ['black board on a black wall (16 grey levels)','blackOnBlackBoardScene','board',.02],
  ['green chalkboard with a wooden frame','greenBoardScene','board',.02],
  ['green board on a purple wall of the same brightness','greenBoardOnColoredWallScene','board',.006],
  ['brown board on a brown wall','brownBoardScene','board',.006],
  ['glossy board with window reflections','glossyBoardScene','board',.02],
  ['board filling the picture (close-up)','closeUpBoardScene','board',.006],
  ['the big board of two boards in the picture','multiBoardScene','board',.02],
  ['board seen from the side (45°)','angledBoardScene','board',.02],
  ['white board in a dark classroom','poorLightBoardScene','board',.006],
  ['white board in the sun, with a hard window shadow across it','sunnyBoardScene','board',.02],
  ['faint black board lit from one side','faintBlackBoardScene','board',.006],
  ['board lit from one side (light 1.1 to 0.45)','gradientBoardScene','board',.006],
  ['open book (whole spread)','bookScene','book',.004],
  ['ID card','idCardScene','id',.004],
  // hard cases
  ['white paper on a light table (low contrast)','lowContrastScene','document',.004],
  ['white paper on a white table (14 grey levels)','whiteOnWhiteScene','document',.006],
  ['sheet half in shadow','shadowScene','document',.004],
  ['sheet held in a hand (thumb on a corner)','handScene','document',.004],
  ['sheet beside a laptop, a pen and a table edge','clutterScene','document',.004],
  ['sheet in a dim room','dimScene','document',.004],
  ['sheet turned 35° in perspective','turnedScene','document',.004],
  ['sheet on a wooden desk with strong grain','woodScene','document',.004],
  ['sheet with a window reflection','glareScene','document',.004],
  ['form with a thick printed frame','framedScene','document',.004],
  ['sheet on a bigger dark desk mat (not the mat)','matScene','document',.004]
]){
  test(`detects the ${name}`,async()=>{
    const cv=await opencv(),{img,quad}=S[scene]();
    const r=ctx.scanDetect(cv,img,mode);
    assert.ok(r.quad,'a quad is found');
    const err=maxErr(r.quad,quad);
    assert.ok(err<tol,`corner error ${err.toFixed(4)} (max ${tol})`);
    assert.equal(r.far,false);assert.equal(r.cutoff,false);
  });
}

test('confidence: a sure detection is high, a doubtful one is lower, nothing found is zero',async()=>{
  const cv=await opencv();
  const sure=ctx.scanDetect(cv,S.greenBoardScene().img,'board'),shaky=ctx.scanDetect(cv,S.faintBlackBoardScene().img,'board'),none=ctx.scanDetect(cv,S.makeImage(512,384,[120,120,120]),'board');
  assert.ok(sure.confidence>=.9,`green board ${sure.confidence}`);
  assert.ok(shaky.confidence<sure.confidence,`faint board ${shaky.confidence} below ${sure.confidence}`);
  assert.equal(none.quad,null);assert.equal(none.confidence,0);
});

test('a model outline is only a candidate: a wrong one changes nothing, a right one is used',async()=>{
  const cv=await opencv(),{img,quad}=S.blackboardScene();
  const plain=ctx.scanDetect(cv,img,'board');
  const wrong=ctx.scanDetect(cv,img,'board',{hint:[[.02,.02],[.3,.03],[.3,.3],[.02,.3]]});
  assert.ok(maxErr(wrong.quad,plain.quad)<1e-6,'a hint on empty wall is dropped: same outline as without it');
  const rough=quad.map(([x,y],i)=>[x+(i%2?.012:-.012),y+(i<2?-.012:.012)]);
  const right=ctx.scanDetect(cv,img,'board',{hint:rough});
  assert.ok(maxErr(right.quad,quad)<.004,'a rough but right hint ends on the real edges');
});

test('a sheet far away is still outlined, but flagged "too far" (never auto-captured)',async()=>{
  const cv=await opencv(),{img,quad}=S.farScene(),r=ctx.scanDetect(cv,img,'document');
  assert.ok(r.quad&&maxErr(r.quad,quad)<.004);
  assert.equal(r.far,true);
  assert.equal(ctx.ScanCore.judgeFrame(r,'document').ok,false);
  assert.equal(ctx.ScanCore.judgeFrame(r,'document').warn,'far');
});

test('a sheet bigger than the picture: no outline, but the camera is told the page runs off the frame',async()=>{
  const cv=await opencv(),{img}=S.cutoffScene(),r=ctx.scanDetect(cv,img,'document');
  assert.equal(r.quad,null);
  assert.equal(r.cutoff,true);
});

test('a window reflection on the sheet is reported',async()=>{
  const cv=await opencv();
  assert.equal(ctx.scanDetect(cv,S.glareScene().img,'document').glare,true);
  assert.equal(ctx.scanDetect(cv,S.documentScene().img,'document').glare,false);
  const j=ctx.ScanCore.judgeFrame(ctx.scanDetect(cv,S.glareScene().img,'document'),'document');
  assert.equal(j.warn,'glare');assert.equal(j.ok,true,'a reflection is only a hint');
});

test('tracking: the previous outline is re-fitted without a new search, and gives up when the page moved',async()=>{
  const cv=await opencv(),{img,quad}=S.documentScene();
  const first=ctx.scanDetect(cv,img,'document');
  const prior=first.quad.map(([x,y])=>[x+.004,y-.003]);
  const t=ctx.scanDetect(cv,img,'document',{prior});
  assert.equal(t.source,'track');assert.ok(maxErr(t.quad,quad)<.004);
  // The page jumped: the old outline no longer sits on edges → full search finds the page again.
  const wrong=[[.05,.05],[.3,.05],[.3,.3],[.05,.3]];
  const f=ctx.scanDetect(cv,img,'document',{prior:wrong});
  assert.notEqual(f.source,'track');assert.ok(maxErr(f.quad,quad)<.004);
});

test('corner accuracy is far better than the old contour approximation (under 1 px on a hand-held sheet)',async()=>{
  const cv=await opencv(),{img,quad}=S.handScene(),r=ctx.scanDetect(cv,img,'document');
  assert.ok(maxErr(r.quad,quad)*512<1,`${(maxErr(r.quad,quad)*512).toFixed(2)} px`);
  assert.ok(r.support>.7);
});

test('no phantom page: a dark laptop alone, or text filling the whole frame, is not a sheet',async()=>{
  const cv=await opencv();
  const desk=S.makeImage(512,384,[176,150,118]);S.noise(desk,8,5);
  S.fillPoly(desk,[[200,120],[330,126],[336,210],[196,204]],[30,32,38]);          // laptop, ~8 % of the frame
  assert.equal(ctx.scanDetect(cv,desk,'document').quad,null,'dark object: not paper');
  const paper=S.makeImage(512,384,[236,233,224]);S.noise(paper,5,9);
  S.textLines(paper,[[0,0],[512,0],[512,384],[0,384]],[40,40,56],{u0:.08,u1:.92,v0:.06,v1:.94,lines:16,seed:4});
  assert.equal(ctx.scanDetect(cv,paper,'document').quad,null,'text only: no edge of a page');
});

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
