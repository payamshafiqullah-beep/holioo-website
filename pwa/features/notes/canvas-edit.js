// Notes page, editing: saving, the history of changes, selection actions, photos and text boxes.
// ── Saving: 600 ms after the last edit, and when leaving. Drive follows a few seconds later. ──
function canvasDirty(rt){
  rt.dirty=true;rt.docStamp=Date.now();rt.saveState='saving';canvasRefreshTopBar();
  clearTimeout(rt.saveTimer);rt.saveTimer=setTimeout(()=>canvasSave(rt),600);
}
async function canvasSave(rt){
  clearTimeout(rt.saveTimer);
  if(!rt.dirty)return;
  rt.dirty=false;
  const doc=canvasPrune(canvasSerialize(rt.store,rt.docStamp));
  try{
    await DB.put('kv',{key:canvasKey(rt.session.id),doc});
    rt.saveState=rt.dirty?'saving':'saved';
    clearTimeout(rt.syncTimer);rt.syncTimer=setTimeout(()=>{if(state.settings.autoDriveSync)queueSync('canvas')},3000);
  }catch(e){
    console.warn(e);rt.dirty=true;rt.saveState='error';showToast('Page non enregistrée : stockage de l’appareil plein ?');
  }
  canvasRefreshTopBar();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&canvasRuntime){canvasCommitText(canvasRuntime);canvasSave(canvasRuntime)}});

// ── Editing: every change is one list of changes in the history (undo / redo) ──
function canvasItem(rt,id){const it=rt.store.items.get(id);return it&&!it.deleted?it:null}
function canvasCommit(rt,changes){
  if(!changes.length)return;
  const stamp=Date.now();
  for(const ch of changes){
    if(ch.k==='p')continue;
    ch.after.updatedAt=stamp;
    (ch.k==='s'?rt.store.strokes:rt.store.items).set(ch.id,ch.after);
  }
  canvasHistoryPush(rt.hist,changes);
  canvasDirty(rt);
}
function canvasAfterHistory(rt){
  canvasLayout(rt);canvasSyncItems(rt);canvasSyncInk(rt);
  if(rt.selected&&!canvasItem(rt,rt.selected))rt.selected=null;
  canvasRenderOverlay(rt);canvasRenderTools(rt);canvasRenderTray(rt);canvasDirty(rt);
}
function canvasUndoAction(rt){
  canvasCancelGesture(rt);
  if(canvasUndo(rt.hist,rt.store,Date.now()))canvasAfterHistory(rt);
}
function canvasRedoAction(rt){
  canvasCancelGesture(rt);
  if(canvasRedo(rt.hist,rt.store,Date.now()))canvasAfterHistory(rt);
}
// Something that fell outside the page's bottom edge makes the page longer.
function canvasGrowFor(rt,y){const h=canvasGrownHeight(rt.store.page.height,y);if(h)canvasSetHeight(rt,h)}
function canvasCancelGesture(rt){
  canvasCommitText(rt);
  if(rt.drawing){rt.drawing.path.remove();rt.drawing=null}
  if(rt.drag){rt.store.items.set(rt.drag.id,rt.drag.orig);rt.drag=null;canvasSyncItems(rt)}
  if(rt.erasing){for(const id of rt.erasing.created?.keys()||[])rt.store.strokes.delete(id);for(const s of rt.erasing.before)rt.store.strokes.set(s.id,s);rt.erasing=null;canvasSyncInk(rt)}
}

function canvasPlacePhotoAt(rt,photoId,center){
  return(async()=>{
    const row=await photoRow(photoId),blob=row&&photoBlob(row);
    if(!blob){showToast('Photo indisponible sur cet appareil');return}
    const bmp=await createImageBitmap(blob),ratio=bmp.width/bmp.height;bmp.close?.();
    const{w,h}=canvasPhotoSize(ratio),c=center||canvasVisibleCenter(rt);
    const maxH=CANVAS_PAGE_H-2*CANVAS_SHEET_PAD,k=h>maxH?maxH/h:1,pw=w*k,ph=h*k;   // never taller than a sheet
    let x=canvasClamp(c.x-pw/2,0,CANVAS_W-pw),y=canvasFitSheet(Math.max(0,c.y-ph/2),ph);
    const same=()=>canvasItemList(rt).some(i=>i.type==='photo'&&Math.abs(i.x-x)<6&&Math.abs(i.y-y)<6);
    for(let n=0;n<8&&same();n++){x=Math.min(CANVAS_W-pw,x+28);y=canvasFitSheet(y+28,ph)}
    const it={id:uid(),type:'photo',photoId,x:canvasRound(x),y:canvasRound(y),w:canvasRound(pw),h:canvasRound(ph),z:canvasNextZ([...rt.store.items.values()]),updatedAt:Date.now()};
    canvasGrowFor(rt,it.y+it.h);
    rt.store.items.set(it.id,it);rt.store.known.add(photoId);
    canvasCommit(rt,[canvasChangeCreate('i',it)]);
    rt.selected=it.id;
    if(rt.tool!=='select'){rt.tool='select';canvasPrefs().tool='select';saveState();canvasLayout(rt);canvasRenderTools(rt)}   // a placed photo is moved with the pointer: the Sélection tool takes over from Main
    canvasSyncItems(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
  })().catch(e=>{console.warn(e);showToast('Photo non placée')});
}
function canvasVisibleCenter(rt){
  const v=rt.viewport.getBoundingClientRect(),s=rt.sheet.getBoundingClientRect();
  return{x:canvasClamp((v.left+v.width/2-s.left)/rt.scale,0,CANVAS_W),y:Math.max(0,(v.top+v.height/2-s.top)/rt.scale)};
}

function canvasSelectedChange(rt,make){
  const it=canvasItem(rt,rt.selected);if(!it)return;
  const next=make({...it});if(!next)return;
  rt.store.items.set(it.id,next);
  canvasCommit(rt,[canvasChangeUpdate('i',it,next)]);
  canvasSyncItems(rt);canvasRenderOverlay(rt);
}
function canvasDeleteSelected(rt){
  const it=canvasItem(rt,rt.selected);if(!it)return;
  rt.store.items.set(it.id,{...it,deleted:true});
  canvasCommit(rt,[canvasChangeRemove('i',it)]);
  rt.selected=null;canvasSyncItems(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
}
function canvasDuplicateSelected(rt){
  const it=canvasItem(rt,rt.selected);if(!it)return;
  const dx=Math.min(30,CANVAS_W-(it.x+it.w)),dup={...it,id:uid(),x:it.x+Math.max(0,dx),y:it.y+30,z:canvasNextZ([...rt.store.items.values()])};
  delete dup.deleted;
  canvasGrowFor(rt,dup.y+dup.h);
  rt.store.items.set(dup.id,dup);canvasCommit(rt,[canvasChangeCreate('i',dup)]);
  rt.selected=dup.id;canvasSyncItems(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
}
function canvasFrontSelected(rt){
  const it=canvasItem(rt,rt.selected);if(!it)return;
  const z=canvasNextZ([...rt.store.items.values()]);if(it.z===z-1)return;
  canvasSelectedChange(rt,o=>({...o,z}));
}

// ── Text boxes ──
function canvasNewText(rt,p){
  const prefs=canvasPrefs(),size=CANVAS_SIZES.text[prefs.size],w=Math.min(CANVAS_TEXT_W,CANVAS_W-8);
  const it={id:uid(),type:'text',x:canvasRound(canvasClamp(p.x,0,CANVAS_W-w)),y:canvasRound(Math.max(0,p.y-size)),w,h:canvasTextHeight(1,size),z:canvasNextZ([...rt.store.items.values()]),text:'',lines:[''],color:canvasColor('pen'),size,updatedAt:Date.now()};
  canvasEditText(rt,it,true);
}
function canvasEditText(rt,it,isNew){
  canvasCommitText(rt);
  rt.selected=null;rt.editing={item:isNew?it:{...it},isNew,before:isNew?null:{...it}};
  canvasRenderOverlay(rt);canvasSyncItems(rt);
  const el=rt.itemEls.get(it.id),ta=el?.querySelector('textarea');if(!ta)return;
  // The box grows with what is typed: the text area (no padding of its own) is as high as its text.
  const fit=()=>{
    const ed=rt.editing.item;ta.style.height='auto';
    const content=Math.max(canvasLineHeight(ed.size),ta.scrollHeight);
    ta.style.height=`${content}px`;ed.h=content+2*CANVAS_TEXT_PAD;el.style.height=`${ed.h}px`;canvasGrowFor(rt,ed.y+ed.h);
  };
  ta.addEventListener('input',fit);
  ta.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();canvasCommitText(rt)}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();canvasCommitText(rt)}e.stopPropagation()});
  ta.addEventListener('blur',()=>setTimeout(()=>{if(rt.editing&&rt.editing.item.id===it.id)canvasCommitText(rt)},0));
  ta.focus({preventScroll:true});ta.setSelectionRange(ta.value.length,ta.value.length);fit();
}
// Ends editing: an empty box disappears; otherwise the text is wrapped once and kept (so every device breaks the lines alike).
function canvasCommitText(rt){
  const ed=rt.editing;if(!ed)return;
  const el=rt.itemEls.get(ed.item.id),ta=el?.querySelector('textarea'),text=ta?ta.value:ed.item.text;
  rt.editing=null;
  const it=ed.item;
  if(!text.trim()){
    if(ed.isNew){el?.remove();rt.itemEls.delete(it.id)}
    else{rt.store.items.set(it.id,{...ed.before,deleted:true});canvasCommit(rt,[canvasChangeRemove('i',ed.before)])}
    canvasSyncItems(rt);canvasRenderOverlay(rt);canvasRenderTools(rt);return;
  }
  const lines=canvasLayoutText(text,it.w-2*CANVAS_TEXT_PAD,canvasMeasure(it.size)),next={...it,text,lines,h:canvasTextHeight(lines.length,it.size)};
  if(ed.isNew){rt.store.items.set(next.id,next);canvasCommit(rt,[canvasChangeCreate('i',next)])}
  else if(text!==ed.before.text||next.color!==ed.before.color||next.size!==ed.before.size){rt.store.items.set(next.id,next);canvasCommit(rt,[canvasChangeUpdate('i',ed.before,next)])}
  rt.selected=next.id;canvasGrowFor(rt,next.y+next.h);
  canvasSyncItems(rt);canvasRenderOverlay(rt);
}
