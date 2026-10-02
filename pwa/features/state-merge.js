'use strict';
// Cross-device merge of the course structure (courses → sections → séances → photo ids, and Captures batches).
// Pure functions, no DOM: loaded before core.js so saveState() can stamp from the very first save.
//
// Stamps: saveState() compares the state with the last saved one (syncStamp). A course / section / séance /
// batch whose own fields or child list changed gets `updatedAt` (ms); the order of courses and of Captures
// batches is stamped in state.sync.coursesAt / inboxAt; an id gone from the state gets a tombstone in
// state.sync.deleted. Old states without stamps count as 0, so the other side wins until something is edited.
// Merge (syncMerge): entities matched by id; own fields from the newer side; a child that sits under two
// different parents goes where the newer parent put it; child order from the newer parent, plus what only
// the other side has; tombstones always win.

const SYNC_CHILDREN={course:['sections','section'],section:['sessions','session'],session:['photoIds','photo'],batch:['photoIds','photo']};
const SYNC_ROOTS={courses:'course',inbox:'batch'};
const SYNC_TOMBSTONE_MS=90*864e5;

function syncOwnJson(kind,obj){
  const childKey=SYNC_CHILDREN[kind]?.[0];const own={};
  for(const k of Object.keys(obj).sort())if(k!==childKey&&k!=='updatedAt')own[k]=obj[k];
  return JSON.stringify(own);
}

// {ents: id → {kind, obj, own, parent}, lists: parent key → child ids}. Parent keys: 'root:courses',
// 'root:inbox' or the parent's id. A photo listed twice stays where it was seen last (as Drive sync does).
function syncFlatten(src){
  const ents=new Map(),lists=new Map();
  const walk=(kind,obj,parent)=>{
    if(kind==='photo'){ents.set(obj,{kind,obj,own:'',parent});return}
    if(!obj||typeof obj.id!=='string')return;
    ents.set(obj.id,{kind,obj,own:syncOwnJson(kind,obj),parent});
    const ch=SYNC_CHILDREN[kind];if(!ch)return;
    const items=Array.isArray(obj[ch[0]])?obj[ch[0]]:[];
    lists.set(obj.id,items.map(c=>ch[1]==='photo'?c:c?.id).filter(x=>typeof x==='string'));
    for(const c of items)walk(ch[1],c,obj.id);
  };
  for(const[root,kind]of Object.entries(SYNC_ROOTS)){
    const items=Array.isArray(src?.[root])?src[root]:[];
    lists.set(`root:${root}`,items.map(c=>c?.id).filter(x=>typeof x==='string'));
    for(const c of items)walk(kind,c,`root:${root}`);
  }
  return{ents,lists};
}

// Stamps what changed since `prev` (a syncFlatten of the last save). Returns the new flatten and whether
// anything changed. Without `prev` (first save after loading) nothing is stamped.
function syncStamp(state,prev,t=Date.now()){
  const sync=state.sync=state.sync&&typeof state.sync==='object'?state.sync:{};
  sync.deleted=sync.deleted&&typeof sync.deleted==='object'?sync.deleted:{};
  const cur=syncFlatten(state);let changed=false;
  if(prev){
    for(const[id,e]of cur.ents){
      if(sync.deleted[id]){delete sync.deleted[id];changed=true}   // brought back (Annuler)
      if(e.kind==='photo')continue;
      const p=prev.ents.get(id);
      if(!p||p.own!==e.own){e.obj.updatedAt=t;changed=true}
    }
    for(const[key,ids]of cur.lists){
      const p=prev.lists.get(key);
      if(p&&p.join('|')===ids.join('|'))continue;
      if(!p&&!ids.length)continue;
      if(key.startsWith('root:'))sync[`${key.slice(5)}At`]=t;else cur.ents.get(key).obj.updatedAt=t;
      changed=true;
    }
    for(const id of prev.ents.keys())if(!cur.ents.has(id)){sync.deleted[id]=t;changed=true}
  }
  for(const[id,ts]of Object.entries(sync.deleted))if(!(t-ts<SYNC_TOMBSTONE_MS))delete sync.deleted[id];
  return{flat:cur,changed};
}

// The part of the state shared between devices (written to Drive as state.json), in a stable form.
function syncSharedPart(src){
  const s=src?.sync||{};
  const deleted={};for(const k of Object.keys(s.deleted||{}).sort())deleted[k]=s.deleted[k];
  return{courses:src?.courses||[],inbox:src?.inbox||[],sync:{coursesAt:s.coursesAt||0,inboxAt:s.inboxAt||0,deleted}};
}

// On a device's first merge, its untouched starter courses (no séance) that the account already has by
// the same name are dropped instead of appearing twice.
function syncDropStarterDuplicates(local,remote){
  const names=new Set((remote.courses||[]).map(c=>String(c.name||'').trim().toLowerCase()));
  const remoteIds=new Set((remote.courses||[]).map(c=>c.id));
  return{...local,courses:(local.courses||[]).filter(c=>remoteIds.has(c.id)||!names.has(String(c.name||'').trim().toLowerCase())||(c.sections||[]).some(s=>(s.sessions||[]).length))};
}

// Merges the shared parts of two states. Returns {courses, inbox, sync} (fresh objects).
function syncMerge(localSrc,remoteSrc,{firstJoin=false}={}){
  let local=syncSharedPart(localSrc);const remote=syncSharedPart(remoteSrc);
  if(firstJoin)local=syncDropStarterDuplicates(local,remote);
  const L=syncFlatten(local),R=syncFlatten(remote);
  const deleted={...local.sync.deleted};
  for(const[id,ts]of Object.entries(remote.sync.deleted))deleted[id]=Math.max(deleted[id]||0,ts);
  const listStamp=(F,src,key)=>key.startsWith('root:')?(src.sync[`${key.slice(5)}At`]||0):(F.ents.get(key)?.obj.updatedAt||0);

  const picked=new Map();
  for(const id of new Set([...L.ents.keys(),...R.ents.keys()])){
    if(deleted[id])continue;
    const l=L.ents.get(id),r=R.ents.get(id);
    const src=!r?l:!l?r:((r.obj.updatedAt||0)>(l.obj.updatedAt||0)?r:l);
    let parent=(l||r).parent;
    if(l&&r&&l.parent!==r.parent)parent=listStamp(R,remote,r.parent)>listStamp(L,local,l.parent)?r.parent:l.parent;
    picked.set(id,{kind:src.kind,obj:src.obj,parent});
  }
  const children=new Map();
  for(const key of new Set([...L.lists.keys(),...R.lists.keys()])){
    const remoteFirst=listStamp(R,remote,key)>listStamp(L,local,key);
    const a=(remoteFirst?R:L).lists.get(key)||[],b=(remoteFirst?L:R).lists.get(key)||[];
    const out=[],seen=new Set();
    for(const id of[...a,...b])if(!seen.has(id)&&picked.get(id)?.parent===key){seen.add(id);out.push(id)}
    children.set(key,out);
  }
  const build=id=>{
    const p=picked.get(id);if(p.kind==='photo')return id;
    const obj={...p.obj};const ch=SYNC_CHILDREN[p.kind];
    if(ch)obj[ch[0]]=(children.get(id)||[]).map(build);
    return obj;
  };
  const out={sync:{coursesAt:Math.max(local.sync.coursesAt,remote.sync.coursesAt),inboxAt:Math.max(local.sync.inboxAt,remote.sync.inboxAt),deleted}};
  for(const root of Object.keys(SYNC_ROOTS))out[root]=(children.get(`root:${root}`)||[]).map(build);
  return JSON.parse(JSON.stringify(out));
}

// Small stable hash of a string (what was last written to / read from Drive).
function syncHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)+':'+s.length}
