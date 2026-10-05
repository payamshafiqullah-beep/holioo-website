'use strict';
// Session notebook: vector ink anchored to photo/blank blocks.
// Data lives in IndexedDB `kv` as ink:<session id>; a copy goes to Google Drive (notebookDriveDocuments).

let notebookSelectedBlockId=null;
let notebookRuntime=null;

const INK_TOOLS={
  'pen-black':{label:'Noir',color:'#111827',size:4,opacity:1,kind:'pen'},
  'pen-blue':{label:'Bleu',color:'#2563EB',size:4,opacity:1,kind:'pen'},
  'pen-red':{label:'Rouge',color:'#E5484D',size:4,opacity:1,kind:'pen'},
  highlighter:{label:'Surligneur',color:'#FACC15',size:15,opacity:.35,kind:'highlighter'}
};

const DEFAULT_INK_DOC=()=>({version:1,sessionId:'',blocks:[],strokes:[],updatedAt:Date.now()});
const inkKey=sessionId=>`ink:${sessionId}`;
const visibleInkBlocks=doc=>(doc.blocks||[]).filter(b=>!b.deleted);
const visibleInkStrokes=doc=>(doc.strokes||[]).filter(s=>!s.deleted);

// Layout only (narrow / wide page): keep in sync with the 720px notebook/shell media queries in styles.css.
const NOTEBOOK_BREAKPOINT=720;
// Writing depends on the device, not on the window: a tablet or a computer (shortest side of its screen at least
// 600 px) writes even in a narrow window (iPad Split View); a phone never does, even turned sideways.
const NOTEBOOK_WRITE_MIN_SIDE=600;
const notebookHistory=new Map();
const notebookHistoryFor=id=>{let h=notebookHistory.get(id);if(!h)notebookHistory.set(id,h={undo:[],redo:[]});return h};
// A page is an A4 sheet whatever the screen, so strokes (stored 0..1) land in the same place on every device.
const NOTEBOOK_PAGE_RATIO=297/210;   // page height / width
const INK_REF_WIDTH=900;             // page width (px) at which a stroke size is expressed
const FRAME_MIN_W=.12;
const PEN_HOLD_MS=800;               // after the last pen event, touches are still treated as a resting palm
const defaultFrame=()=>({x:.04,y:.03,w:.5});
const frameOf=b=>({...(b.frame||defaultFrame()),r:b.ratio||null});   // photo frame on its page, fractions of the page; r = photo width / height
const frameRatio=f=>f.r||.75;
function clampFrame(f){
  const r=frameRatio(f),w=Math.max(FRAME_MIN_W,Math.min(f.w,1,r*NOTEBOOK_PAGE_RATIO)),h=w/(r*NOTEBOOK_PAGE_RATIO);
  return{x:Math.max(0,Math.min(f.x,1-w)),y:Math.max(0,Math.min(f.y,1-h)),w,r:f.r};
}
function applyFrameVars(el,f){
  el.style.setProperty('--fx',f.x);el.style.setProperty('--fy',f.y);el.style.setProperty('--fw',f.w);el.style.setProperty('--fr',frameRatio(f));
}
const phoneQuery=()=>matchMedia(`(max-width: ${NOTEBOOK_BREAKPOINT-1}px)`);
function notebookCanEdit(){return Math.min(screen.width,screen.height)>=NOTEBOOK_WRITE_MIN_SIDE}
function normalizePoint(x,y,rect){return[Math.max(0,Math.min(1,x/rect.width)),Math.max(0,Math.min(1,y/rect.height))]}
function strokeColor(tool){return INK_TOOLS[tool]?.color||INK_TOOLS['pen-black'].color}
function strokeSize(tool){return INK_TOOLS[tool]?.size||INK_TOOLS['pen-black'].size}

// Three widths (thin / medium / thick) per kind of tool, in px on a 900px-wide page. The choice is remembered on the
// device (state.settings.inkSizes) and stored in each stroke, so changing it never alters what is already written.
const INK_SIZES={pen:[2.5,4,7],highlighter:[10,15,24],eraser:[10,18,32]};
const ERASER_TOLERANCE_PER_PX=1/720;   // eraser reach (0..1 of the page) per px of eraser size: 18px = .025
const inkKind=tool=>tool==='eraser'?'eraser':INK_TOOLS[tool]?.kind||'pen';
const inkSizeIndex=kind=>{const i=state.settings.inkSizes?.[kind];return i>=0&&i<INK_SIZES[kind].length?i:1};
const inkSize=tool=>INK_SIZES[inkKind(tool)][inkSizeIndex(inkKind(tool))];
function setInkSizeIndex(kind,i){state.settings.inkSizes={...state.settings.inkSizes,[kind]:i};saveState()}
function strokeOpacity(tool){return INK_TOOLS[tool]?.opacity??1}

async function loadNotebookDoc(session){
  let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
  const doc={...DEFAULT_INK_DOC(),...(row?.doc||{}),sessionId:session.id};
  doc.blocks=Array.isArray(doc.blocks)?doc.blocks:[];
  doc.strokes=Array.isArray(doc.strokes)?doc.strokes:[];
  syncNotebookBlocks(doc,session);
  return doc;
}

function syncNotebookBlocks(doc,session){
  const byId=new Map(doc.blocks.map(b=>[b.id,b]));
  const photoIds=Array.isArray(session.photoIds)?session.photoIds:[];
  for(const block of doc.blocks){
    if(block.type==='photo'&&!block.deleted&&!photoIds.includes(block.photoId||block.id)&&(doc.strokes||[]).some(st=>!st.deleted&&st.blockId===block.id)){
      Object.assign(block,{type:'blank',photoId:null,frame:undefined,ratio:undefined,updatedAt:Date.now()});   // keep the writing
    }
  }
  const next=[];
  for(const photoId of photoIds){
    const found=byId.get(photoId);
    next.push(found?{...found,type:'photo',photoId,deleted:false}:{id:photoId,type:'photo',photoId,createdAt:Date.now(),updatedAt:Date.now(),deleted:false});
  }
  for(const block of doc.blocks){
    if(block.type==='blank'&&!block.deleted)next.push(block);
  }
  for(const block of doc.blocks){
    if(block.deleted||block.type==='photo'&&!photoIds.includes(block.photoId||block.id)){
      if(!next.some(b=>b.id===block.id))next.push({...block,deleted:true,updatedAt:block.updatedAt||Date.now()});
    }
  }
  doc.blocks=next;
}

let notebookDriveDirty=false;   // handwriting saved since the last Drive sync was asked for
async function saveNotebookDoc(doc){
  doc.updatedAt=Date.now();
  await DB.put('kv',{key:inkKey(doc.sessionId),doc});
  notebookDriveDirty=true;
}

function scheduleNotebookSave(doc){
  clearTimeout(scheduleNotebookSave.t);
  scheduleNotebookSave.doc=doc;
  scheduleNotebookSave.t=setTimeout(()=>{scheduleNotebookSave.doc=null;saveNotebookDoc(doc).catch(console.warn)},350);
}

// Leaving the session screen or the app: the last strokes are saved now, then copied to Drive.
async function flushNotebook(){
  const doc=scheduleNotebookSave.doc;
  if(doc){clearTimeout(scheduleNotebookSave.t);scheduleNotebookSave.doc=null;await saveNotebookDoc(doc).catch(console.warn)}
  if(notebookDriveDirty){notebookDriveDirty=false;queueSync('notebook')}
}

// Removes the ink of deleted sessions; the undo history is dropped only once the records are gone.
// Their copy in Google Drive stays there, like their photos.
async function purgeSessionInk(sessionIds){
  if(sessionIds.includes(scheduleNotebookSave.doc?.sessionId)){clearTimeout(scheduleNotebookSave.t);scheduleNotebookSave.doc=null}
  if(sessionIds.includes(notebookRuntime?.doc.sessionId))cleanupNotebookRuntime();
  await Promise.all(sessionIds.flatMap(id=>[DB.del('kv',inkKey(id)),DB.del('kv',`drive:${inkKey(id)}`)]));
  sessionIds.forEach(id=>notebookHistory.delete(id));
  if(typeof purgeSessionCanvas==='function')await purgeSessionCanvas(sessionIds);   // the Notes page (features/notes/canvas-sync.js) goes with it
}
