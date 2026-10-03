'use strict';
// Scanner worker: live page detection with OpenCV.js and QR decoding, off the main thread.
// Messages in:  {id, type:'init', opencvUrl}                       → progress… then {ready:true}
//               {id, type:'detect', image:{data,width,height}, mode, prior?, hint?}
//                                                   → {quad, support, far, cutoff, glare, sharpness, brightness, gutter?…}
//               {id, type:'refine', image, quad, mode, fixed?}    → {quad, ok, support}   (no OpenCV needed)
//               {id, type:'qr', image, jsqrUrl}                      → {text|null}
// Out: {id, ok, ...result} | {id, ok:false, error} | {type:'progress', value}
const V=self.location.search;
importScripts(`../features/scan-core.js${V}`,`../features/scan-refine.js${V}`,`../features/scan-detect.js${V}`);

let cvPromise=null,jsQRReady=false;

// OpenCV is ~10 MB: fetched once with progress (the service worker keeps it), then evaluated here.
function loadOpenCV(url){
  cvPromise??=(async()=>{
    const res=await fetch(url);if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const total=+res.headers.get('content-length')||10.4e6,reader=res.body.getReader(),chunks=[];let got=0,last=0;
    for(;;){const{done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;if(got-last>250e3){last=got;self.postMessage({type:'progress',value:Math.min(.97,got/total)})}}
    const blobUrl=URL.createObjectURL(new Blob(chunks,{type:'text/javascript'}));
    try{importScripts(blobUrl)}finally{URL.revokeObjectURL(blobUrl)}
    const cv=self.cv;if(!cv)throw new Error('OpenCV missing');
    // The module is a thenable that resolves to itself: wait for readiness explicitly, then drop `then`
    // (awaiting it, or returning it from an async function, would never finish).
    if(!cv.Mat)await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error('OpenCV init timeout')),40000);
      const poll=setInterval(()=>{if(cv.Mat){clearTimeout(t);clearInterval(poll);resolve()}},50);
    });
    if(typeof cv.then==='function'){try{delete cv.then}catch{}if(typeof cv.then==='function')cv.then=undefined}
    self.postMessage({type:'progress',value:1});
    return cv;
  })();
  cvPromise.catch(()=>{cvPromise=null});
  return cvPromise;
}

const asImage=m=>({data:new Uint8ClampedArray(m.image.data),width:m.image.width,height:m.image.height});

self.onmessage=async({data:m})=>{
  try{
    if(m.type==='init'){await loadOpenCV(m.opencvUrl);self.postMessage({id:m.id,ok:true,ready:true});return}
    if(m.type==='detect'){
      const cv=await cvPromise;if(!cv)throw new Error('OpenCV not loaded');
      const img=asImage(m),r=scanDetect(cv,img,m.mode,{prior:m.prior||null,hint:m.hint||null});
      if(m.mode==='book'&&r.quad)r.gutter=ScanCore.findGutter(r.quad,scanLumSampler(img));
      self.postMessage({id:m.id,ok:true,...r});return;
    }
    if(m.type==='refine'){
      // Sub-pixel edges on a full-size still, starting from the outline found live.
      const img=asImage(m),r=ScanRefine.refineQuad(ScanRefine.toGray(img.data,img.width,img.height),img.width,img.height,m.quad,{fixed:m.fixed||undefined,range:m.range||undefined,minStrength:m.minStrength||undefined});
      self.postMessage({id:m.id,ok:true,quad:r.quad,refined:r.ok,support:r.support});return;
    }
    if(m.type==='qr'){
      if(!jsQRReady){importScripts(m.jsqrUrl);jsQRReady=true}
      const img=asImage(m),r=self.jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
      self.postMessage({id:m.id,ok:true,text:r?.data??null,corners:r?[r.location.topLeftCorner,r.location.topRightCorner,r.location.bottomRightCorner,r.location.bottomLeftCorner].map(p=>[p.x/img.width,p.y/img.height]):null});
      return;
    }
    throw new Error(`Unknown message ${m.type}`);
  }catch(e){self.postMessage({id:m.id,ok:false,error:String(e?.message||e)})}
};
