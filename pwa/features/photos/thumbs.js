'use strict';
// Small previews for photo grids. A grid of 50 full photos (2000 px each) decodes hundreds of MB,
// which makes iPhones reload the page; each photo instead gets a ~400 px JPEG, made once and
// stored with the photo (`thumb`). The full photo is still used by the viewer, PDF and Drive.

const THUMB_SIDE=400;
let thumbUrls=[];

// Called before each screen is drawn: previews of the previous screen are freed.
function releaseThumbUrls(){for(const u of thumbUrls)URL.revokeObjectURL(u);thumbUrls=[]}
function thumbUrl(blob){const u=URL.createObjectURL(blob);thumbUrls.push(u);return u}

async function decodeImage(blob){
  if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob)}catch{}}
  const url=URL.createObjectURL(blob);
  try{const img=new Image();img.decoding='async';img.src=url;await img.decode();return img}finally{URL.revokeObjectURL(url)}
}

function scaleCanvas(src,w,h,side=THUMB_SIDE){
  const k=Math.min(1,side/Math.max(w,h));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));
  const ctx=c.getContext('2d',{alpha:false});ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,c.width,c.height);
  return c;
}
const canvasToJpeg=(c,q=.8)=>new Promise(r=>c.toBlob(r,'image/jpeg',q));

async function makeThumb(blob){
  const img=await decodeImage(blob);
  try{return await canvasToJpeg(scaleCanvas(img,img.width||img.naturalWidth,img.height||img.naturalHeight))}
  finally{img.close?.()}
}

// The stored photo. One taken on another device of the account is fetched from Drive first (sync/remote-sync.js).
async function photoRow(id){
  let row=await DB.get('photos',id);
  if(!row?.blob&&typeof ensurePhotoLocal==='function'&&await ensurePhotoLocal(id))row=await DB.get('photos',id);
  return row;
}

// Object URL of a photo's preview, made and stored the first time it is needed.
async function photoThumbUrl(id){
  const row=await photoRow(id);if(!row?.blob)return null;
  if(row.thumb)return thumbUrl(row.thumb);
  const src=row.rendered||row.blob;
  try{
    const thumb=await makeThumb(src);if(!thumb)return thumbUrl(src);
    // Stored only if the photo did not change while the preview was being made.
    await DB.patch('photos',id,latest=>latest.blob?.size===row.blob.size&&latest.editedAt===row.editedAt?{thumb}:{});
    return thumbUrl(thumb);
  }catch{return thumbUrl(src)}
}
