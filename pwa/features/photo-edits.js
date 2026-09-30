'use strict';
// Non-destructive photo edits.
// A photo row keeps its original in `blob` forever. Editing stores:
//   edit      the parameters (see features/image-pipeline.js)
//   rendered  the edited full-size JPEG, used by the viewer, PDF, Drive and publishing
//   thumb     a small JPEG for grids
//   editedAt  timestamp; driveNeedsUpdate tells Drive sync to replace the existing file
// Photos cropped with the old editor simply have their current image as the original.

// The image to show or export for a photo, and the lighter one for grids.
const photoBlob=row=>row?.rendered||row?.blob||null;
const photoThumbBlob=row=>row?.thumb||row?.rendered||row?.blob||null;

// ---- Image jobs: in a worker when the browser can draw off the main thread ----
// Same ?v= as this script, so a new release never mixes old and new worker code.
const IMAGE_WORKER_URL=`./workers/image-worker.js${document.currentScript?new URL(document.currentScript.src).search:''}`;
let imageWorker=null,imageJobId=0;
const imageJobs=new Map();
const workerDrawing=typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&'transferToImageBitmap' in OffscreenCanvas.prototype;

function imageJob(type,payload){
  if(workerDrawing){
    try{
      if(!imageWorker){
        imageWorker=new Worker(IMAGE_WORKER_URL);
        imageWorker.onmessage=({data})=>{const j=imageJobs.get(data.id);if(!j)return;imageJobs.delete(data.id);data.ok?j.resolve(data):j.reject(new Error(data.error))};
        imageWorker.onerror=e=>{console.warn('Image worker failed, using main thread',e);imageWorker=null;for(const[,j] of imageJobs)j.retry();imageJobs.clear()};
      }
      return new Promise((resolve,reject)=>{
        const id=++imageJobId;
        imageJobs.set(id,{resolve,reject,retry:()=>imageJobInline(type,payload).then(resolve,reject)});
        imageWorker.postMessage({id,type,...payload});
      });
    }catch(e){console.warn(e)}
  }
  return imageJobInline(type,payload);
}

// Same work on the main thread (older iPhones without OffscreenCanvas in workers).
async function imageJobInline(type,{blob,edit,maxSide,quality,thumbSide,crop,front,back}){
  await new Promise(r=>setTimeout(r)); // let the UI paint first
  if(type==='idcard'){
    const side=async s=>HoliooImage.renderEdited(await createImageBitmap(s.blob),s.edit,{maxSide:1400});
    const page=HoliooImage.composeIdPage(await side(front),await side(back));
    return{page:await HoliooImage.toBlob(page,'image/jpeg',.9),thumb:await HoliooImage.toBlob(HoliooImage.scaleTo(page,480),'image/jpeg',.82)};
  }
  const src=await createImageBitmap(blob);
  if(type==='encode'){const c=HoliooImage.scaleTo(src,maxSide||2400);return{blob:await HoliooImage.toBlob(c,'image/jpeg',quality||.85),width:c.width,height:c.height}}
  const toBitmap=c=>createImageBitmap(c);
  if(type==='proxy')return{bitmap:await toBitmap(HoliooImage.scaleTo(src,maxSide||1600)),width:src.width,height:src.height};
  if(type==='preview')return{bitmap:await toBitmap(HoliooImage.renderEdited(src,edit,{maxSide:maxSide||1400,crop:!!crop}))};
  const c=HoliooImage.renderEdited(src,edit,{maxSide:maxSide||3200});
  return{rendered:await HoliooImage.toBlob(c,'image/jpeg',quality||.9),thumb:await HoliooImage.toBlob(HoliooImage.scaleTo(c,thumbSide||480),'image/jpeg',.82),width:c.width,height:c.height};
}

// Save an edit for one photo. Re-reads the row right before writing so nothing written
// meanwhile (e.g. by Drive sync) is lost.
async function savePhotoEdit(id,edit){
  const row=await DB.get('photos',id);if(!row?.blob)return false;
  if(HoliooImage.isIdentity(edit)){
    const latest=await DB.get('photos',id)||row;
    const{rendered,thumb,edit:_,...rest}=latest;
    await DB.put('photos',{...rest,editedAt:now(),syncState:'pending',driveNeedsUpdate:!!latest.driveFileId});
    return true;
  }
  const out=await imageJob('render',{key:`${id}:${row.blob.size}`,blob:row.blob,edit,maxSide:3200,quality:.9,thumbSide:480});
  const latest=await DB.get('photos',id)||row;
  await DB.put('photos',{...latest,edit,rendered:out.rendered,thumb:out.thumb,editedAt:now(),syncState:'pending',driveNeedsUpdate:!!latest.driveFileId});
  return true;
}
