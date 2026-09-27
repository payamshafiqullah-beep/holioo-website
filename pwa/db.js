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
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }
  async function put(store,value){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error)})}
  async function get(store,key){const db=await open();return new Promise((res,rej)=>{const r=db.transaction(store,'readonly').objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  async function del(store,key){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
  async function all(store){const db=await open();return new Promise((res,rej)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
  async function patch(store,key,changes){const row=await get(store,key);if(!row)return null;return put(store,{...row,...changes})}
  async function blobUrl(store,key){const row=await get(store,key);return row?.blob?URL.createObjectURL(row.blob):''}
  window.HoliooDB={open,put,get,del,all,patch,blobUrl};
})();
