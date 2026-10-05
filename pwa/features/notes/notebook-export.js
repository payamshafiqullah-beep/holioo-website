'use strict';
// Session notebook, export: pages as images for the PDF and the copy kept in Google Drive.
// ---------- PDF export ----------

// One page of the notebook as a JPEG: ruled A4 sheet, photo at its frame, then the ink.
async function renderNotebookPageBlob(doc,block,photo){
  const W=1240,H=Math.round(W*NOTEBOOK_PAGE_RATIO);
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#E3E6F1';ctx.lineWidth=1;
  const step=W*.0355;   // the ruling of the on-screen page
  for(let y=step;y<H;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  if(block.type==='photo'&&photo){
    const bmp=await createImageBitmap(photo),f=clampFrame({...frameOf(block),r:block.ratio||bmp.width/bmp.height});
    ctx.drawImage(bmp,f.x*W,f.y*H,f.w*W,f.w*W/frameRatio(f));
    bmp.close?.();
  }
  const strokes=visibleInkStrokes(doc).filter(s=>s.blockId===block.id);
  for(const stroke of strokes.filter(s=>s.tool==='highlighter'))drawStroke(ctx,stroke,W,H);
  for(const stroke of strokes.filter(s=>s.tool!=='highlighter'))drawStroke(ctx,stroke,W,H);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
}

// Pages of a session that differ from the plain photo (handwriting, a moved photo, written blank pages), in notebook
// order: [{blockId, photoId|null, blob}]. Empty when the session has no notebook content.
// The notebook of a session as it is now: the open one, else the saved one (null when it was never opened).
async function notebookDocFor(session){
  if(notebookRuntime?.doc.sessionId===session.id)return notebookRuntime.doc;
  let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
  if(!row?.doc)return null;
  const doc={...DEFAULT_INK_DOC(),...row.doc,sessionId:session.id};
  doc.blocks=Array.isArray(doc.blocks)?doc.blocks:[];doc.strokes=Array.isArray(doc.strokes)?doc.strokes:[];
  syncNotebookBlocks(doc,session);
  return doc;
}

// Pages worth exporting: written pages, and photos whose frame was moved or resized (photo still on this device).
async function notebookExportablePages(doc){
  const out=[];
  for(const block of visibleInkBlocks(doc)){
    const strokes=visibleInkStrokes(doc).filter(s=>s.blockId===block.id);
    if(block.type==='blank'?!strokes.length:!strokes.length&&!block.frame)continue;
    let photo=null,row=null;
    if(block.type==='photo'){
      row=await DB.get('photos',block.photoId||block.id);
      photo=row?photoBlob(row):null;
      if(!photo)continue;
    }
    out.push({block,strokes,row,photo});
  }
  return out;
}

async function notebookExportPages(session){
  const doc=await notebookDocFor(session);if(!doc)return[];
  const out=[];
  for(const{block,photo}of await notebookExportablePages(doc))out.push({blockId:block.id,photoId:block.type==='photo'?(block.photoId||block.id):null,blob:await renderNotebookPageBlob(doc,block,photo)});
  return out;
}

// Google Drive copy (drive.js syncAll / pendingCount): in the session's folder, one image per page
// (Carnet-01.jpg…) and Carnet.json, the strokes themselves. A page is sent again only when what it shows changed.
const notebookHash=str=>{let h=0x811c9dc5;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),0x01000193);return(h>>>0).toString(36)};
async function notebookDriveDocuments(appState){
  const out=[];
  for(const course of appState.courses||[])for(const section of course.sections||[])for(const session of section.sessions||[]){
    let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
    if(!row?.doc)continue;
    const live=notebookRuntime?.doc.sessionId===session.id?notebookRuntime.doc:row.doc;
    out.push({id:inkKey(session.id),version:row.doc.updatedAt||0,empty:!(live.strokes||[]).some(s=>!s.deleted),folder:[course.name,section.name,session.title],parts:()=>notebookDriveParts({course,section,session})});
  }
  return out;
}
async function notebookDriveParts({course,section,session}){
  const doc=await notebookDocFor(session);
  if(!doc||!visibleInkStrokes(doc).length)return[];
  const pages=await notebookExportablePages(doc);
  const parts=pages.map(({block,strokes,row,photo},i)=>({
    name:`Carnet-${String(i+1).padStart(2,'0')}.jpg`,
    sig:notebookHash([block.type,row?.id||'',row?.editedAt||'',JSON.stringify(block.frame||null),block.ratio||'',strokes.map(st=>st.id).join(',')].join('|')),
    blob:()=>renderNotebookPageBlob(doc,block,photo)
  }));
  // Only what is drawn (no timestamps), so the same notebook always gives the same file.
  const data={app:'Holioo',kind:'notebook',version:1,course:course.name,section:section.name,session:session.title,
    pages:visibleInkBlocks(doc).map(({id,type,photoId,frame,ratio})=>({id,type,photoId,frame,ratio})),
    strokes:visibleInkStrokes(doc).map(({id,blockId,tool,size,points})=>({id,blockId,tool,size,points}))};
  const json=JSON.stringify(data);
  parts.push({name:'Carnet.json',sig:notebookHash(json),blob:()=>new Blob([json],{type:'application/json'})});
  return parts;
}

// Does the session hold handwriting? (the PDF builder lists such sessions even without photos)
async function sessionHasNotebookInk(session){
  let row=null;try{row=await DB.get('kv',inkKey(session.id))}catch{}
  return!!row?.doc?.strokes?.some(s=>!s.deleted);
}
