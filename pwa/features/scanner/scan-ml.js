'use strict';
// Board-corner model (TensorFlow.js, MobileNetV2 regressor): an OPTIONAL first guess for the Tableau mode.
//
// It does nothing until a trained model is published at ./models/board-corners/model.json (the training
// recipe is in tools/board-corners/). While there is none the scanner works exactly as before, on OpenCV
// alone, and this file costs one tiny HEAD request per session. When a model is there:
//   - TensorFlow.js (~1.4 MB) and the model (~1.5 MB) are downloaded once, on the first Tableau use, then
//     kept offline (the service worker keeps the library; the model is saved in IndexedDB);
//   - every few live frames the model proposes the four corners of the board, normalised to the frame;
//   - scanDetect (features/scanner/scan-detect.js) takes that outline as ONE candidate: it is refined to the real
//     edges and ranked against the OpenCV candidates, and dropped when the edges are not there. A wrong
//     guess therefore cannot hurt, and the OpenCV search remains the fallback when the model fails.
//
// Model contract (what tools/board-corners/train.py produces):
//   input   [1, 160, 160, 3]  the whole frame stretched to 160×160, RGB scaled to [-1, 1]
//   output  [1, 9]            x1 y1 x2 y2 x3 y3 x4 y4 present   corners TL, TR, BR, BL in 0..1 of the frame,
//                             `present` = 0..1 that a board is in view (a logit is accepted too)
//
//   ScanML.prepare() → Promise<boolean>   loads once (safe to call every time)
//   ScanML.ready()   → boolean            a model is loaded
//   ScanML.predict(video, region) → Promise<{quad, presence}|null>   region = {x,y,w,h} in video pixels

const ScanML=(()=>{
  const CFG={
    modelUrl:'./models/board-corners/model.json',
    store:'indexeddb://holioo-board-corners',
    tfUrl:'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    size:160,
    minPresence:.5
  };
  const SAVED_FLAG='holioo_board_model';
  let tf=null,model=null,state='idle',loading=null,canvas=null,ctx=null;   // idle | loading | ready | off

  const loadScript=url=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=url;s.async=true;s.crossOrigin='anonymous';
    s.onload=resolve;s.onerror=()=>reject(new Error('script'));document.head.appendChild(s);
  });
  // Cheap check, once per session: is there a model to load at all?
  const published=async()=>{try{return(await fetch(CFG.modelUrl,{method:'HEAD',cache:'no-cache'})).ok}catch{return false}};

  async function load(){
    try{
      // A copy saved on this device works offline; otherwise there must be a published model.
      let source=null;
      const saved=localStorage.getItem(SAVED_FLAG)==='1';
      if(!window.tf){
        if(!saved&&!(await published()))return false;
        await loadScript(CFG.tfUrl);
      }
      tf=window.tf;if(!tf)return false;
      try{await tf.setBackend('webgl')}catch{await tf.setBackend('cpu')}
      await tf.ready();
      try{model=await tf.loadGraphModel(CFG.store);source='saved'}
      catch{
        if(!(await published()))return false;
        model=await tf.loadGraphModel(CFG.modelUrl);source='network';
        try{await model.save(CFG.store);localStorage.setItem(SAVED_FLAG,'1')}catch(e){console.warn('Board model not saved offline',e)}
      }
      // One warm-up run: shaders compile now, not during the first live frame.
      tf.tidy(()=>model.predict(tf.zeros([1,CFG.size,CFG.size,3])));
      canvas=document.createElement('canvas');canvas.width=canvas.height=CFG.size;
      ctx=canvas.getContext('2d',{willReadFrequently:true});
      state='ready';console.info(`Board model ready (${source}, ${tf.getBackend()})`);
      return true;
    }catch(e){console.warn('Board model unavailable',e?.message||e);return false}
  }

  function prepare(){
    if(state==='ready')return Promise.resolve(true);
    if(state==='off')return Promise.resolve(false);
    // Data Saver or a slow connection: no 3 MB download for an optional guess.
    if(navigator.connection?.saveData){state='off';return Promise.resolve(false)}
    state='loading';
    loading??=load().then(ok=>{state=ok?'ready':'off';return ok}).catch(()=>{state='off';return false});
    return loading;
  }

  // Output → {quad, presence}, or null (no board in view, or numbers that cannot be corners).
  function parse(v){
    if(!v||v.length<9)return null;
    const sig=x=>1/(1+Math.exp(-x)),presence=v[8]<0||v[8]>1?sig(v[8]):v[8];
    if(presence<CFG.minPresence)return null;
    const pts=[];
    for(let i=0;i<4;i++){
      const x=v[i*2],y=v[i*2+1];
      if(!(x>-.1&&x<1.1&&y>-.1&&y<1.1))return null;
      pts.push([Math.min(1,Math.max(0,x)),Math.min(1,Math.max(0,y))]);
    }
    const quad=ScanCore.orderQuad(pts);
    return quad&&ScanCore.isConvex(quad)&&ScanCore.area(quad)>.03?{quad,presence}:null;
  }

  async function predict(video,region){
    if(state!=='ready'||!video?.videoWidth)return null;
    const r=region||{x:0,y:0,w:video.videoWidth,h:video.videoHeight};
    ctx.drawImage(video,r.x,r.y,r.w,r.h,0,0,CFG.size,CFG.size);
    const out=tf.tidy(()=>model.predict(tf.browser.fromPixels(canvas).toFloat().div(127.5).sub(1).expandDims(0)));
    try{return parse(await out.data())}
    finally{out.dispose()}
  }

  return{prepare,ready:()=>state==='ready',predict,parse,get state(){return state},CFG};
})();
if(typeof module!=='undefined')module.exports=ScanML;
