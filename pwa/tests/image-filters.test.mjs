// Scanner filters and perspective correction (features/photos/image-pipeline.js, pure pixel functions),
// and the full pipeline per mode: detect → flatten the page → filter. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as S from './helpers/scenes.mjs';

const require=createRequire(import.meta.url);
const ctx={console};ctx.self=ctx;vm.createContext(ctx);
for(const f of ['../features/photos/image-pipeline.js','../features/scanner/scan-core.js','../features/scanner/scan-detect.js'])vm.runInContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const I=ctx.HoliooImage;
let cvP;const opencv=()=>cvP??=new Promise(r=>{const cv=require('@techstark/opencv-js');const d=()=>{if(typeof cv.then==='function')delete cv.then;r(cv)};cv.Mat?d():cv.onRuntimeInitialized=d});

const clone=img=>({data:new Uint8ClampedArray(img.data),width:img.width,height:img.height});
const px=(img,x,y)=>{const i=(Math.round(y)*img.width+Math.round(x))*4;return[img.data[i],img.data[i+1],img.data[i+2]]};
const lum=([r,g,b])=>.299*r+.587*g+.114*b;
// Mean brightness of a region (fractions of the image).
function meanLum(img,x0,y0,x1,y1){let s=0,n=0;for(let y=Math.floor(y0*img.height);y<y1*img.height;y+=2)for(let x=Math.floor(x0*img.width);x<x1*img.width;x+=2){s+=lum(px(img,x,y));n++}return s/n}
function median(img){const v=[];for(let i=0;i<img.data.length;i+=4*13)v.push(lum([img.data[i],img.data[i+1],img.data[i+2]]));v.sort((a,b)=>a-b);return v[v.length>>1]}
const filtered=(img,f)=>{const c=clone(img);I.filterPixels(c.data,c.width,c.height,f);return c};

// A page (paper 238) with a shadow over its right half, dark text lines and one red mark.
function shadowedPage(){
  const img=S.makeImage(400,300,[238,236,230]);
  const q=[[0,0],[400,0],[400,300],[0,300]];
  S.textLines(img,q,[35,35,45],{lines:8,v0:.1,v1:.7});
  S.fillPoly(img,[[40,240],[140,240],[140,270],[40,270]],[200,30,30]);
  S.shade(img,1,.55);S.noise(img,3);
  return img;
}

test('Ombres: the shadow disappears, text stays dark',()=>{
  const out=filtered(shadowedPage(),'shadows');
  const left=meanLum(out,.4,.78,.52,.95),right=meanLum(out,.84,.78,.98,.95);
  assert.ok(Math.abs(left-right)<14,`paper left ${left.toFixed(0)} vs right ${right.toFixed(0)}`);
});

test('Auto: white page, dark text, colours kept',()=>{
  const src=shadowedPage(),out=filtered(src,'auto');
  assert.ok(meanLum(out,.85,.78,.98,.95)>225,'paper in the shadow becomes white');
  let dark=0,n=0;for(let x=40;x<360;x+=3){const v=lum(px(out,x,300*(.1+.6*.5/8)+3));n++;if(v<110)dark++}
  assert.ok(dark/n>.3,'text lines stay dark');
  const [r,g]=px(out,90,255);assert.ok(r>g+60,`red mark stays red (${r},${g})`);
});

test('N&B: pure black and white, no noise on the shaded paper',()=>{
  const out=filtered(shadowedPage(),'bw');
  let other=0,blackInBlank=0,n=0;
  for(let i=0;i<out.data.length;i+=4)if(out.data[i]!==0&&out.data[i]!==255)other++;
  for(let y=225;y<295;y+=2)for(let x=200;x<395;x+=2){n++;if(px(out,x,y)[0]===0)blackInBlank++}
  assert.equal(other,0);
  assert.ok(blackInBlank/n<.01,`${(blackInBlank/n*100).toFixed(1)}% black in blank shaded paper`);
  const line=[...Array(100)].map((_,k)=>px(out,40+k*3,300*(.1+.6*.5/8)+3)[0]);
  assert.ok(line.filter(v=>v===0).length>25,'text is black');
});

test('Gris and Éclaircir',()=>{
  const g=filtered(shadowedPage(),'gray'),[r,gg,b]=px(g,90,255);assert.ok(r===gg&&gg===b);
  const src=shadowedPage();assert.ok(median(filtered(src,'lighten'))>median(src)+10);
});

test('Tableau: board turns white under the reflection, markers stay coloured',()=>{
  const {img,quad}=S.whiteboardScene();
  const W=img.width,H=img.height,qp=quad.map(([x,y])=>[x*W,y*H]);
  const page=I.warpPixels(img.data,W,H,qp,480,300);
  const out=filtered(page,'board');
  assert.ok(meanLum(out,.6,.2,.75,.35)>228,'glare area is white');
  assert.ok(meanLum(out,.05,.93,.3,.98)>228,'shaded board is white');
  // A blue marker stroke: find the darkest pixel in the first text line → it is blue.
  let best=[255,255,255];for(let x=48;x<432;x++){const p=px(out,x,300*(.1+.45*.5/5)+4);if(lum(p)<lum(best))best=p}
  assert.ok(best[2]>best[0]+40&&lum(best)<150,`marker ${best}`);
});

test('Tableau noir: chalk becomes dark writing on white',()=>{
  const {img,quad}=S.blackboardScene();
  const W=img.width,H=img.height,page=I.warpPixels(img.data,W,H,quad.map(([x,y])=>[x*W,y*H]),480,300);
  const out=filtered(page,'board-dark');
  assert.ok(median(out)>225,`background ${median(out)}`);
  let darkest=255;for(let x=48;x<432;x++)darkest=Math.min(darkest,lum(px(out,x,300*(.1+.8*.5/6)+6)));
  assert.ok(darkest<90,`chalk ${darkest}`);
});

test('perspective correction maps the page corners to the output corners',()=>{
  const img=S.makeImage(300,300,[0,0,0]);
  const q=[[40,30],[260,60],[240,270],[60,250]];
  S.fillPoly(img,q,[250,250,250]);
  // Mark the page's top-left corner red.
  S.fillPoly(img,[S.inQuad(q,0,0),S.inQuad(q,.2,0),S.inQuad(q,.2,.2),S.inQuad(q,0,.2)],[255,0,0]);
  const out=I.warpPixels(img.data,300,300,q,200,280);
  assert.equal(out.width,200);assert.equal(out.height,280);
  const tl=px(out,10,10),br=px(out,190,270),mid=px(out,100,140);
  assert.ok(tl[0]>200&&tl[1]<60,'top-left of the output is the red corner');
  assert.ok(br[0]>230&&br[1]>230,'bottom-right is page');
  assert.ok(mid[1]>230,'no black desk inside the page');
});

for(const [scene,mode,filter] of [['documentScene','document','auto'],['whiteboardScene','board','board'],['blackboardScene','board','board-dark'],['bookScene','book','auto'],['idCardScene','id','auto']]){
  test(`full pipeline (${mode}, ${filter}): detected, flattened, cleaned`,async()=>{
    const cv=await opencv(),{img}=S[scene](),W=img.width,H=img.height;
    const r=ctx.scanDetect(cv,img,mode);assert.ok(r.quad);
    const q=r.quad.map(([x,y])=>[x*W,y*H]);
    const page=I.warpPixels(img.data,W,H,q,400,Math.round(400*ctx.ScanCore.pageRatio(r.quad.map(([x,y])=>[x,y*H/W]))));
    const out=filtered(page,filter);
    // Nothing of the desk or wall left at the edges, and a clean background.
    const edge=Math.min(meanLum(out,.01,.3,.04,.7),meanLum(out,.96,.3,.99,.7));
    assert.ok(median(out)>200,`background ${median(out)}`);
    if(mode!=='id')assert.ok(edge>150,`edges ${edge.toFixed(0)}`);
  });
}
