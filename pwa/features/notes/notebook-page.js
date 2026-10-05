'use strict';
// Session notebook, screen: blocks, the toolbar, palm rejection and the notebook runtime.
function addBlankNotebookBlock(doc,afterId=notebookSelectedBlockId){
  const block={id:`blank:${uid()}`,type:'blank',photoId:null,createdAt:Date.now(),updatedAt:Date.now(),deleted:false};
  const blocks=visibleInkBlocks(doc);
  const idx=afterId?blocks.findIndex(b=>b.id===afterId):-1;
  const fullIdx=idx>=0?doc.blocks.findIndex(b=>b.id===blocks[idx].id):-1;
  doc.blocks.splice(fullIdx>=0?fullIdx+1:doc.blocks.length,0,block);
  notebookSelectedBlockId=block.id;
  scheduleNotebookSave(doc);
  return block;
}

function ensureNotebookSelection(doc){
  const blocks=visibleInkBlocks(doc);
  if(!blocks.some(b=>b.id===notebookSelectedBlockId))notebookSelectedBlockId=blocks[0]?.id||null;
}

async function renderSessionNotebook({course,section,session}){
  const prev=notebookRuntime;
  cleanupNotebookRuntime();
  const doc=prev&&prev.doc.sessionId===session.id?(syncNotebookBlocks(prev.doc,session),prev.doc):await loadNotebookDoc(session);
  if(!visibleInkBlocks(doc).length){
    addBlankNotebookBlock(doc,null);
    await saveNotebookDoc(doc);
  }
  ensureNotebookSelection(doc);
  const editable=notebookCanEdit();
  const blocks=visibleInkBlocks(doc);
  const html=[];
  for(const block of blocks){
    let media='';
    if(block.type==='photo'){
      const row=await DB.get('photos',block.photoId||block.id);
      const blob=photoBlob(row);
      const url=blob?thumbUrl(blob):'';
      media=url?`<img src="${url}" alt="Photo de cours" draggable="false" decoding="async">`:`<div class="notebook-missing">${icon('image',{size:28})}<span>Photo indisponible sur cet appareil</span></div>`;
    }else{
      media=`<div class="notebook-blank-label">${icon('pencil',{size:22})}<span>Page blanche</span></div>`;
    }
    const f=clampFrame(frameOf(block));
    html.push(`<article class="notebook-block${block.id===notebookSelectedBlockId?' selected':''} ${block.type==='blank'?'blank':''}" data-block-id="${esc(block.id)}" style="--fx:${f.x};--fy:${f.y};--fw:${f.w};--fr:${frameRatio(f)}">
      <div class="notebook-margin" aria-hidden="true"></div>
      <div class="notebook-photo">${media}<span class="notebook-handle" aria-hidden="true"></span><span class="notebook-delete" aria-hidden="true">${icon('x',{size:16,stroke:2.6})}</span></div>
      <canvas class="notebook-canvas committed" aria-hidden="true"></canvas>
      <canvas class="notebook-canvas live" aria-label="Couche d’écriture manuscrite"></canvas>
    </article>`);
  }
  const host=byId('sessionNotebook');
  if(!host)return;
  host.innerHTML=`${editable?'':Notice('L’écriture manuscrite est disponible sur tablette ou ordinateur.','sky')}${html.join('')}`;
  setupNotebookRuntime(doc,{course,section,session,editable});
}

function cleanupNotebookRuntime(){
  if(!notebookRuntime)return;
  window.removeEventListener('resize',notebookRuntime.resize);
  notebookRuntime.mql?.removeEventListener?.('change',notebookRuntime.onMedia);
  notebookRuntime.guards.forEach(([type,fn,opts])=>document.removeEventListener(type,fn,opts));
  clearTimeout(notebookRuntime.penTimer);
  clearTimeout(notebookRuntime.press?.timer);
  notebookRuntime=null;
}

function setupNotebookRuntime(doc,{course,section,session,editable}){
  const root=byId('sessionNotebook');
  if(!root)return;
  const rt=notebookRuntime={doc,course,section,session,editable,tool:'pen-black',ruler:false,hist:notebookHistoryFor(session.id),drawing:null,drag:null,press:null,editId:null,resize:null,root,mql:phoneQuery(),penUntil:0,penTimer:0,guards:[]};
  rt.resize=()=>requestAnimationFrame(()=>{if(rt.root.isConnected&&notebookCanEdit()!==rt.editable)rt.onMedia();else redrawNotebook(rt)});
  rt.onMedia=()=>{if(rt.root.isConnected&&notebookCanEdit()!==rt.editable)renderSessionNotebook({course,section,session})};
  window.addEventListener('resize',rt.resize);
  rt.mql?.addEventListener?.('change',rt.onMedia);
  root.classList.toggle('finger-draw',!!(editable&&state.settings.drawWithFinger));
  if(editable)setupPalmRejection(rt);
  root.querySelectorAll('.notebook-block').forEach(block=>{
    block.onclick=()=>selectNotebookBlock(block.dataset.blockId);
    const img=block.querySelector('img'),obj=doc.blocks.find(b=>b.id===block.dataset.blockId);
    const learnRatio=()=>{
      if(obj&&img.naturalHeight&&!obj.ratio){obj.ratio=img.naturalWidth/img.naturalHeight;applyFrameVars(block,clampFrame(frameOf(obj)));scheduleNotebookSave(doc)}
      rt.resize();
    };
    if(img)img.complete&&img.naturalWidth?learnRatio():img.addEventListener('load',learnRatio,{once:true});
    const live=block.querySelector('.notebook-canvas.live');
    if(editable){
      live.addEventListener('pointerdown',e=>notebookPointerDown(e,rt,block));
      live.addEventListener('pointermove',e=>notebookPointerMove(e,rt,block));
      live.addEventListener('pointerup',e=>notebookPointerUp(e,rt,block));
      live.addEventListener('pointercancel',e=>notebookPointerCancel(e,rt,block));
    }
  });
  bindNotebookToolbar(rt);
  rt.resize();
}

// Palm rejection: while a pen is at work (hovering or writing) and shortly after, touches must not scroll the page
// or draw. The pen itself never scrolls either. Fingers scroll again once the pen has been away for a moment.
function setupPalmRejection(rt){
  const penBusy=()=>!!rt.drawing||!!rt.drag||performance.now()<rt.penUntil;
  const onPen=e=>{
    if(e.pointerType!=='pen'||!rt.root.isConnected)return;
    rt.penUntil=performance.now()+PEN_HOLD_MS;
    rt.root.classList.add('pen-active');
    clearTimeout(rt.penTimer);
    rt.penTimer=setTimeout(()=>rt.root.classList.remove('pen-active'),PEN_HOLD_MS);
  };
  const onTouch=e=>{
    if(!rt.root.isConnected||!e.cancelable)return;
    if(penBusy()||[...e.changedTouches].some(t=>t.touchType==='stylus'))e.preventDefault();
  };
  const add=(type,fn,opts)=>{document.addEventListener(type,fn,opts);rt.guards.push([type,fn,opts])};
  for(const type of['pointerdown','pointermove','pointerup'])add(type,onPen,true);
  for(const type of['touchstart','touchmove'])add(type,onTouch,{capture:true,passive:false});
}

function selectNotebookBlock(id){
  notebookSelectedBlockId=id;
  document.querySelectorAll('.notebook-block').forEach(b=>b.classList.toggle('selected',b.dataset.blockId===id));
}

function bindNotebookToolbar(rt){
  const bar=byId('notebookToolbar');if(!bar)return;
  const toolButtons=[...bar.querySelectorAll('[data-ink-tool],[data-ink-eraser]')];
  const sizeButtons=[...bar.querySelectorAll('[data-ink-size]')];
  const showSize=()=>sizeButtons.forEach(b=>b.classList.toggle('active',+b.dataset.inkSize===inkSizeIndex(inkKind(rt.tool))));
  const pick=(tool,btn)=>{
    rt.tool=tool;
    toolButtons.forEach(b=>b.classList.toggle('active',b===btn));
    showSize();
    setEditing(rt,null);
  };
  sizeButtons.forEach(btn=>btn.onclick=()=>{setInkSizeIndex(inkKind(rt.tool),+btn.dataset.inkSize);showSize()});
  showSize();
  bar.querySelectorAll('[data-ink-tool]').forEach(btn=>btn.onclick=()=>pick(btn.dataset.inkTool,btn));
  bar.querySelector('[data-ink-eraser]')?.addEventListener('click',e=>pick('eraser',e.currentTarget));
  bar.querySelector('[data-ink-ruler]')?.addEventListener('click',e=>{
    rt.ruler=!rt.ruler;
    e.currentTarget.classList.toggle('active',rt.ruler);
  });
  bar.querySelector('[data-ink-undo]')?.addEventListener('click',()=>undoNotebook(rt));
  bar.querySelector('[data-ink-redo]')?.addEventListener('click',()=>redoNotebook(rt));
  updateUndoRedoButtons(rt);
}
