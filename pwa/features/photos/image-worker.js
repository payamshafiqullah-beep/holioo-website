'use strict';
// Image work off the main thread: decoding, previews and full-size renders of edited photos.
// Messages: {id, type, blob, edit, maxSide, quality, thumbSide} → {id, ok, ...result} | {id, ok:false, error}
importScripts(`./image-pipeline.js${self.location.search}`); // same release as this worker

const cache=new Map(); // blob → decoded bitmap, so previews of the same photo don't decode again
async function decode(key,blob){
  if(key&&cache.has(key))return cache.get(key);
  const bmp=await createImageBitmap(blob);
  if(key){if(cache.size>4){const first=cache.keys().next().value;cache.get(first).close?.();cache.delete(first)}cache.set(key,bmp)}
  return bmp;
}

self.onmessage=async({data:m})=>{
  try{
    const src=m.blob?await decode(m.key,m.blob):null;
    if(m.type==='proxy'){
      // Downscaled, unedited original for the editor to display and transform at 60fps.
      const c=HoliooImage.scaleTo(src,m.maxSide||1600);
      const bmp=c.transferToImageBitmap?c.transferToImageBitmap():await createImageBitmap(c);
      self.postMessage({id:m.id,ok:true,bitmap:bmp,width:src.width,height:src.height},[bmp]);
    }else if(m.type==='preview'){
      // Oriented + filtered, optionally cropped: what the editor shows under the crop box.
      const c=HoliooImage.renderEdited(src,m.edit,{maxSide:m.maxSide||1400,crop:!!m.crop});
      const bmp=c.transferToImageBitmap?c.transferToImageBitmap():await createImageBitmap(c);
      self.postMessage({id:m.id,ok:true,bitmap:bmp},[bmp]);
    }else if(m.type==='idcard'){
      // ID card: both sides cropped and cleaned, then placed on one A4 page at true size.
      const side=async s=>HoliooImage.renderEdited(await createImageBitmap(s.blob),s.edit,{maxSide:1400});
      const page=HoliooImage.composeIdPage(await side(m.front),await side(m.back));
      const out=await HoliooImage.toBlob(page,'image/jpeg',.9),thumb=await HoliooImage.toBlob(HoliooImage.scaleTo(page,480),'image/jpeg',.82);
      self.postMessage({id:m.id,ok:true,page:out,thumb});
    }else if(m.type==='encode'){
      // Re-encoded copy for export (PDF quality settings).
      const c=HoliooImage.scaleTo(src,m.maxSide||2400);
      self.postMessage({id:m.id,ok:true,blob:await HoliooImage.toBlob(c,'image/jpeg',m.quality||.85),width:c.width,height:c.height});
    }else if(m.type==='render'){
      // Final image + thumbnail, stored next to the untouched original.
      const c=HoliooImage.renderEdited(src,m.edit,{maxSide:m.maxSide||3200});
      const rendered=await HoliooImage.toBlob(c,'image/jpeg',m.quality||.9);
      const thumb=await HoliooImage.toBlob(HoliooImage.scaleTo(c,m.thumbSide||480),'image/jpeg',.82);
      self.postMessage({id:m.id,ok:true,rendered,thumb,width:c.width,height:c.height});
    }
  }catch(e){self.postMessage({id:m.id,ok:false,error:String(e?.message||e)})}
};
