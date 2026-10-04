'use strict';
// Background save queue for the camera.
// The shutter only grabs the frame; encoding, the IndexedDB write and filing the photo into its
// session happen here, one photo at a time and in shutter order, so rapid taps never race.
// A photo stays in memory until it is stored; a failed write is retried and never dropped.

const cameraQueue=(()=>{
  const items=[];            // {id, blob: Promise<Blob>, thumb?: Promise<Blob>, edit?, extra?, replace?, onStored?, dest, tries}
  const listeners=new Set();
  let running=false,failing=false,storageFull=false,retryTimer=null;

  const snapshot=()=>({pending:items.length,failing,storageFull});
  const emit=()=>{const s=snapshot();for(const fn of listeners)try{fn(s)}catch{}};

  function add(item){items.push({...item,tries:0});emit();run()}

  // The photo row is written first; only then is its id added to the session, so a session
  // never points at a photo that isn't stored.
  function fileIntoSession(id,dest){
    const ctx=dest&&findSessionContext(dest.sessionId);
    if(ctx){ctx.session.photoIds.push(id);state.cameraShot={sessionId:dest.sessionId};return}
    // No destination (plain camera) or the session was deleted while the photo was saving: it waits in Captures to be filed later.
    // Photos without a destination: one Captures entry per camera visit (dest.batchId), so a new visit opens a new entry.
    const bid=dest?.batchId||CAMERA_ORPHAN_BATCH;
    let batch=state.inbox.find(b=>b.id===bid);
    if(!batch){
      const t=now(),label=(()=>{try{return new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return''}})();
      batch={id:bid,title:dest?.batchId?`Capture ${label}`.trim():'Capture',photoIds:[],createdAt:t};state.inbox.unshift(batch)
    }
    batch.photoIds.push(id);
  }

  async function run(){
    if(running)return;running=true;
    clearTimeout(retryTimer);retryTimer=null;
    while(items.length){
      const it=items[0];
      try{
        const blob=await it.blob;
        if(!blob)throw new Error('encode');
        const thumb=await Promise.resolve(it.thumb).catch(()=>null);
        const fields={blob,...(thumb?{thumb}:{}),...(it.edit?{edit:it.edit}:{}),...(it.extra||{})};
        if(it.replace){
          // Retake: new content for the same photo (same place in its session, same Drive file).
          const old=await DB.get('photos',it.id);
          const{rendered:_r,thumb:_t,edit:_e,...keep}=old||{};
          await DB.put('photos',{...keep,id:it.id,...fields,createdAt:keep.createdAt||it.createdAt,editedAt:now(),syncState:'pending',driveNeedsUpdate:!!keep.driveFileId});
        }else{
          await DB.put('photos',{id:it.id,...fields,createdAt:it.createdAt,syncState:'pending'});
          fileIntoSession(it.id,it.dest);
        }
        saveState();
        items.shift();
        failing=false;storageFull=false;
        try{it.onStored?.(it.id)}catch(e){console.warn(e)}
        // A tablet on Live Capture: this photo goes to Drive now (features/remote-sync.js); otherwise nothing changes.
        try{if(typeof onPhotoStoredForLive==='function')onPhotoStoredForLive(it.id)}catch(e){console.warn(e)}
        emit();
      }catch(e){
        it.tries++;
        failing=true;
        storageFull=e?.name==='QuotaExceededError'||/quota/i.test(String(e?.message||''));
        emit();
        // A frame that could not be encoded cannot be retried; everything else waits and tries again.
        if(String(e?.message)==='encode'&&it.tries>2){items.shift();continue}
        const wait=Math.min(15000,1000*2**Math.min(it.tries,4));
        running=false;retryTimer=setTimeout(run,wait);
        return;
      }
    }
    running=false;
  }

  // Leaving the page with photos still in memory would lose them: ask the browser to warn.
  window.addEventListener('beforeunload',e=>{if(items.length){e.preventDefault();e.returnValue=''}});

  return{
    add,
    retryNow:run,
    pending:()=>items.length,
    state:snapshot,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
  };
})();
const CAMERA_ORPHAN_BATCH='camera-unfiled';
