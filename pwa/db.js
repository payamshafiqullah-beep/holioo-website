(function(){
  'use strict';
  const DB_NAME='holioo-local-v3';
  const DB_VERSION=3;
  let dbPromise;
  function open(){
    if(dbPromise) return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('photos')) db.createObjectStore('photos',{keyPath:'id'});
        if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
        if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv',{keyPath:'key'});
      };
      req.onsuccess=()=>{
        const db=req.result;
        // Another tab upgrading the database, or the browser closing it: reopen on next use.
        db.onversionchange=()=>{db.close();dbPromise=null};
        db.onclose=()=>{dbPromise=null};
        resolve(db);
      };
      // A failed open is retried next time instead of failing forever.
      req.onerror=()=>{dbPromise=null;reject(req.error)};
      req.onblocked=()=>console.warn('IndexedDB upgrade blocked by another Holioo tab');
    });
    return dbPromise;
  }
  // A write fails with an error or is aborted (e.g. storage full): both reject.
  const done=(tx,value)=>new Promise((res,rej)=>{tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new DOMException('Transaction aborted','AbortError'))});
  const request=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  async function put(store,value){const db=await open();const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);return done(tx,value)}
  async function get(store,key){const db=await open();return request(db.transaction(store,'readonly').objectStore(store).get(key))}
  async function del(store,key){const db=await open();const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);return done(tx)}
  async function all(store){const db=await open();return(await request(db.transaction(store,'readonly').objectStore(store).getAll()))||[]}
  // Only the ids, without reading any photo.
  async function keys(store){const db=await open();return(await request(db.transaction(store,'readonly').objectStore(store).getAllKeys()))||[]}
  // Read-modify-write in a single transaction, so a write made meanwhile elsewhere is never lost.
  // `changes` is an object, or a function (row) → object of changed fields.
  async function patch(store,key,changes){
    const db=await open();const tx=db.transaction(store,'readwrite');const os=tx.objectStore(store);
    let next=null;
    const r=os.get(key);
    r.onsuccess=()=>{if(!r.result)return;next={...r.result,...(typeof changes==='function'?changes(r.result):changes)};os.put(next)};
    await done(tx);return next;
  }
  async function blobUrl(store,key){const row=await get(store,key);return row?.blob?URL.createObjectURL(row.blob):''}
  window.HoliooDB={open,put,get,del,all,keys,patch,blobUrl};
})();
