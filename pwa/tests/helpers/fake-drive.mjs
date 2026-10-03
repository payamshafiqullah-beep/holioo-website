// In-memory Google Drive and IndexedDB used by the Drive sync tests.
// ── A small in-memory Google Drive ──
export function fakeDrive(){
  const files=new Map();let n=0;const calls=[];
  const fail={upload:null,full:false,downloads:0,expire:false};
  const json=(status,body)=>({ok:status<300,status,text:async()=>JSON.stringify(body)});
  const notFound=id=>json(404,{error:{message:`File not found: ${id}`,errors:[{reason:'notFound'}]}});
  const alive=id=>files.has(id)||id==='root';
  async function fetch(url,opts={}){
    const u=new URL(url),method=opts.method||'GET';calls.push(`${method} ${u.pathname}`);
    if(fail.expire){fail.expire=false;return json(401,{error:{message:'Invalid Credentials'}})}
    if(u.pathname==='/drive/v3/files'&&method==='GET'){
      const q=u.searchParams.get('q');const name=/name='((?:[^'\\]|\\.)*)'/.exec(q)[1].replace(/\\'/g,"'");const parent=/'([^']+)' in parents/.exec(q)[1];
      const wantFolder=!q.includes('mimeType!=');
      return json(200,{files:[...files.values()].filter(f=>!!f.folder===wantFolder&&!f.trashed&&f.name===name&&f.parents.includes(parent))});
    }
    if(u.pathname==='/drive/v3/files'&&method==='POST'){
      const b=JSON.parse(opts.body);if(!alive(b.parents[0]))return notFound(b.parents[0]);
      const f={id:`f${++n}`,name:b.name,parents:b.parents,folder:true};files.set(f.id,f);return json(200,f);
    }
    if(u.pathname==='/upload/drive/v3/files'&&method==='POST'){
      const raw=await new Response(opts.body).text();const meta=JSON.parse(/\{.*\}/.exec(raw)[0]);
      if(fail.full)return json(403,{error:{message:'The user\'s Drive storage quota has been exceeded.',errors:[{reason:'storageQuotaExceeded'}]}});
      if(fail.upload&&meta.name.includes(fail.upload))return json(500,{error:{message:'Backend error'}});
      if(!alive(meta.parents[0]))return notFound(meta.parents[0]);
      const text=raw.split('\r\n\r\n').pop().replace(/\r\n--holioo_[^-]*--$/,'');
      const f={id:`p${++n}`,name:meta.name,parents:meta.parents,content:raw.length,text,md5Checksum:`md5-${text.length}-${n}`};files.set(f.id,f);return json(200,f);
    }
    const m=/^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if(m){
      const id=decodeURIComponent(m[2]),f=files.get(id);if(!f)return notFound(id);
      if(method==='GET'&&u.searchParams.get('alt')==='media'){fail.downloads++;return{ok:true,status:200,blob:async()=>new Blob([f.text??''])}}
      if(method==='GET')return json(200,f);
      if(m[1]){f.content=`updated-${opts.body.size}`;f.text=await new Response(opts.body).text();f.updated=(f.updated||0)+1;f.md5Checksum=`md5-${f.text.length}-u${f.updated}`;return json(200,f)}
      const add=u.searchParams.get('addParents');if(add&&!alive(add))return notFound(add);
      const rm=(u.searchParams.get('removeParents')||'').split(',').filter(Boolean);
      f.parents=[...f.parents.filter(p=>!rm.includes(p)),...(add&&!f.parents.includes(add)?[add]:[])];
      const body=JSON.parse(opts.body||'{}');if(body.name)f.name=body.name;if(body.trashed)f.trashed=true;
      return json(200,f);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }
  const photosIn=folderId=>[...files.values()].filter(f=>!f.folder&&f.parents.includes(folderId));
  const folder=name=>[...files.values()].find(f=>f.folder&&f.name===name);
  return{files,fetch,calls,fail,photosIn,folder};
}

export function fakeDb(){
  const stores={photos:new Map(),files:new Map(),kv:new Map()};
  return{stores,
    get:async(s,k)=>stores[s].get(k)&&structuredClone(stores[s].get(k)),
    put:async(s,v)=>{stores[s].set(v.id??v.key,structuredClone(v));return v},
    del:async(s,k)=>{stores[s].delete(k)},
    all:async s=>[...stores[s].values()].map(v=>({...v})),
    patch:async(s,k,ch)=>{const r=stores[s].get(k);if(!r)return null;const next={...r,...(typeof ch==='function'?ch(r):ch)};stores[s].set(k,next);return next}};
}
