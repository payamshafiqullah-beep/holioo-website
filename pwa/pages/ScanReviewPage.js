// Revue des pages — after the camera: reorder, retake, delete (with undo), add pages, re-crop,
// change the filter of a page (live preview, swipe) or of all pages. Pages are already saved in
// their session: every change here is applied to them directly, nothing can be lost.
let scanReview={index:null,pendingDelete:null,previewUrl:'',previewToken:0};

const SCAN_FILTER_LABELS={original:'Original',auto:'Auto',gray:'Gris',bw:'N&B',lighten:'Éclaircir',shadows:'Ombres',board:'Tableau','board-dark':'Tableau noir',document:'Document',whiteboard:'Tableau',contrast:'Contraste'};

function scanReviewIds(){
  const ctx=camDest?.sessionId&&findSessionContext(camDest.sessionId);
  const inSession=new Set(ctx?.session.photoIds||[]);
  return camShots.filter(id=>inSession.has(id)||cameraQueue.pending());
}

async function renderScanReview(){
  setChrome(true);
  const ctx=camDest?.sessionId&&findSessionContext(camDest.sessionId);
  const ids=scanReviewIds();
  if(!ctx||!ids.length){camShots=[];navigate(ctx?'session':'home');return}
  if(scanReview.index!=null)return renderScanReviewPage();
  app.innerHTML=`<div class="srv">
    <header class="srv-top">
      <button class="srv-text-btn" id="srvCamera">${icon('chevronLeft',{size:20})}${esc(camT('reviewAdd'))}</button>
      <div class="srv-title"><b>${esc(camT('reviewPages',{n:ids.length}))}</b><small>${esc(cameraDestinationLabel(camDest))}</small></div>
      <button class="srv-done" id="srvDone">${esc(camT('done'))}</button>
    </header>
    <div class="srv-grid" id="srvGrid"></div>
    <p class="srv-hint">${esc(camT('reviewHint'))}</p>
    <footer class="srv-bar">
      <button class="srv-bar-btn" id="srvAdd">${icon('plus',{size:20})}<small>${esc(camT('reviewAddPages'))}</small></button>
      <button class="srv-bar-btn" id="srvFilterAll">${icon('sparkles',{size:20})}<small>${esc(camT('reviewFilterAll'))}</small></button>
      <button class="srv-bar-btn" id="srvPdf">${icon('fileText',{size:20})}<small>${esc(camT('reviewPdf'))}</small></button>
    </footer>
  </div>`;
  byId('srvCamera').onclick=byId('srvAdd').onclick=()=>{flushScanDelete();camKeepBatch=true;navigate('capture')};
  byId('srvDone').onclick=()=>finishScanReview('session');
  byId('srvPdf').onclick=()=>finishScanReview('pdfBuilder');
  byId('srvFilterAll').onclick=()=>chooseFilterForAll(ids);
  const grid=byId('srvGrid');
  for(let i=0;i<ids.length;i++){
    const id=ids[i],row=await DB.get('photos',id);if(!grid.isConnected)return;
    const card=document.createElement('div');card.className='srv-page';card.dataset.photoId=id;card.setAttribute('role','button');card.tabIndex=0;
    card.innerHTML=`<img alt="Page ${i+1}" draggable="false" decoding="async"><span class="num">${i+1}</span>${row?.edit&&!row.rendered?`<span class="srv-busy" aria-label="${esc(camT('reviewProcessing'))}"></span>`:''}`;
    card.onclick=()=>{scanReview.index=scanReviewIds().indexOf(id);render()};
    card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click()}};
    grid.appendChild(card);
    photoThumbUrl(id).then(u=>{if(u)card.querySelector('img').src=u});
  }
  makeReorderable(grid,{onChange:order=>reorderScanPages(order)});
}

// New order of this capture's pages, inside their session (other photos keep their places).
function reorderScanPages(order){
  const ctx=findSessionContext(camDest.sessionId);if(!ctx)return;
  const list=ctx.session.photoIds,slots=list.map((id,i)=>order.includes(id)?i:-1).filter(i=>i>=0);
  slots.forEach((slot,k)=>{list[slot]=order[k]});
  camShots=[...order,...camShots.filter(id=>!order.includes(id))];
  saveState();queueSync();showToast(camT('reviewOrder'));
}

function finishScanReview(to){
  flushScanDelete();
  const ctx=findSessionContext(camDest?.sessionId);
  scanReview.index=null;camShots=[];camKeepBatch=false;
  if(!ctx){navigate('home');return}
  showToast(camT('savedTo',{dest:cameraDestinationLabel(camDest)}));
  navigate(to,{courseId:ctx.course.id,sectionId:ctx.section.id,sessionId:ctx.session.id});
}

// ---------- one page ----------
async function renderScanReviewPage(){
  const ids=scanReviewIds();
  if(!ids.length){scanReview.index=null;return renderScanReview()}
  scanReview.index=Math.max(0,Math.min(scanReview.index,ids.length-1));
  const id=ids[scanReview.index],row=await DB.get('photos',id);
  if(!row){scanReview.index=null;return renderScanReview()}
  const filter=row.edit?.filter||'original';
  app.innerHTML=`<div class="srv srv-one">
    <header class="srv-top">
      <button class="srv-text-btn" id="srvBack">${icon('chevronLeft',{size:20})}${esc(camT('reviewAll'))}</button>
      <div class="srv-title"><b>${esc(camT('reviewPageN',{i:scanReview.index+1,n:ids.length}))}</b></div>
      <div class="srv-nav"><button class="srv-icon" id="srvPrev" aria-label="${esc(camT('reviewPrev'))}" ${scanReview.index?'':'disabled'}>${icon('chevronLeft',{size:22})}</button><button class="srv-icon" id="srvNext" aria-label="${esc(camT('reviewNext'))}" ${scanReview.index<ids.length-1?'':'disabled'}>${icon('chevronRight',{size:22})}</button></div>
    </header>
    <div class="srv-stage" id="srvStage"><img id="srvImg" alt="Page ${scanReview.index+1}"><span class="srv-busy big hidden" id="srvBusy"></span><span class="srv-filter-name" id="srvFilterName">${esc(SCAN_FILTER_LABELS[filter]||filter)}</span></div>
    <div class="srv-filters" id="srvFilters" role="radiogroup" aria-label="${esc(camT('reviewFilters'))}">${SCAN_FILTERS.map(f=>`<button role="radio" aria-checked="${f===filter}" class="srv-filter${f===filter?' active':''}" data-filter="${f}"><canvas width="112" height="140"></canvas><small>${esc(SCAN_FILTER_LABELS[f])}</small></button>`).join('')}</div>
    <footer class="srv-bar">
      <button class="srv-bar-btn" id="srvCrop">${icon('crop',{size:20})}<small>${esc(camT('reviewCrop'))}</small></button>
      <button class="srv-bar-btn" id="srvRotate">${icon('rotateCw',{size:20})}<small>${esc(camT('reviewRotate'))}</small></button>
      <button class="srv-bar-btn" id="srvRetake">${icon('camera',{size:20})}<small>${esc(camT('reviewRetake'))}</small></button>
      <button class="srv-bar-btn" id="srvApplyAll">${icon('layers',{size:20})}<small>${esc(camT('reviewApplyAll'))}</small></button>
      <button class="srv-bar-btn danger" id="srvDelete">${icon('trash',{size:20})}<small>${esc(camT('reviewDelete'))}</small></button>
    </footer>
  </div>`;
  showScanPreview(id);
  paintScanFilterThumbs(id,row);
  byId('srvBack').onclick=()=>{scanReview.index=null;render()};
  byId('srvPrev').onclick=()=>{scanReview.index--;render()};
  byId('srvNext').onclick=()=>{scanReview.index++;render()};
  byId('srvFilters').querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>setScanPageFilter(id,b.dataset.filter));
  byId('srvCrop').onclick=()=>openPhotoEditor({ids:[id],fromEl:byId('srvImg'),onSaved:()=>{if(currentView==='scanReview')render()}});
  byId('srvRotate').onclick=async()=>{const r=await DB.get('photos',id),e={...HoliooImage.defaultEdit(),...(r.edit||{})};e.rot=(e.rot+1)%4;
    // A perspective crop turns with the photo.
    if(e.mode==='quad'&&e.quad){const bmp=await createImageBitmap(r.blob),ratio=(e.rot%2?bmp.width/bmp.height:bmp.height/bmp.width);bmp.close?.();const prev=1/ratio;e.quad=HoliooImage.orderQuad(e.quad.map(([x,y])=>[1-y/prev,x/prev]))}
    else e.box=null;
    await applyScanEdit(id,e)};
  byId('srvRetake').onclick=()=>{flushScanDelete();camRetakeId=id;camKeepBatch=true;scanReview.index=null;navigate('capture')};
  // The filter shown now (it may have changed since the page was drawn).
  byId('srvApplyAll').onclick=()=>applyFilterToAll(ids,byId('srvFilters')?.querySelector('.active')?.dataset.filter||filter);
  byId('srvDelete').onclick=()=>deleteScanPage(id);
  // Swipe on the page: next / previous filter, with a live preview.
  let sx=null;const stage=byId('srvStage');
  stage.addEventListener('touchstart',e=>{sx=e.touches.length===1?e.touches[0].clientX:null},{passive:true});
  stage.addEventListener('touchend',e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)<50)return;
    const cur=byId('srvFilters').querySelector('.active')?.dataset.filter||'original',i=SCAN_FILTERS.indexOf(cur);
    const next=SCAN_FILTERS[Math.max(0,Math.min(SCAN_FILTERS.length-1,i+(dx<0?1:-1)))];if(next!==cur)setScanPageFilter(id,next)},{passive:true});
}

async function showScanPreview(id){
  const row=await DB.get('photos',id),img=byId('srvImg');if(!row||!img)return;
  if(scanReview.previewUrl)URL.revokeObjectURL(scanReview.previewUrl);
  scanReview.previewUrl=URL.createObjectURL(photoBlob(row));img.src=scanReview.previewUrl;
  byId('srvBusy')?.classList.toggle('hidden',!(row.edit&&!row.rendered));
}
// Called when the background rendering of a page finishes.
function refreshScanReviewPage(id){
  const ids=scanReviewIds();
  if(scanReview.index!=null){if(ids[scanReview.index]===id)showScanPreview(id);return}
  const card=document.querySelector(`.srv-page[data-photo-id="${CSS.escape(id)}"]`);
  if(card){card.querySelector('.srv-busy')?.remove();photoThumbUrl(id).then(u=>{if(u)card.querySelector('img').src=u})}
}

async function paintScanFilterThumbs(id,row){
  const key=`${id}:${row.blob.size}`,base={...HoliooImage.defaultEdit(),...(row.edit||{})};
  for(const f of SCAN_FILTERS){
    const c=document.querySelector(`#srvFilters [data-filter="${f}"] canvas`);if(!c)return;
    try{
      const {bitmap}=await imageJob('preview',{key,blob:row.blob,edit:{...base,filter:f},maxSide:200,crop:true});
      const cc=document.querySelector(`#srvFilters [data-filter="${f}"] canvas`);if(!cc)return;
      const x=cc.getContext('2d'),s=Math.max(cc.width/bitmap.width,cc.height/bitmap.height);
      x.drawImage(bitmap,(cc.width-bitmap.width*s)/2,(cc.height-bitmap.height*s)/2,bitmap.width*s,bitmap.height*s);
    }catch{}
  }
}

async function setScanPageFilter(id,filter){
  const row=await DB.get('photos',id);if(!row)return;
  const e={...HoliooImage.defaultEdit(),...(row.edit||{}),filter};
  byId('srvFilters')?.querySelectorAll('[data-filter]').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-checked',String(on));if(on)b.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'})});
  const name=byId('srvFilterName');if(name){name.textContent=SCAN_FILTER_LABELS[filter];name.classList.remove('show');void name.offsetWidth;name.classList.add('show')}
  // Live preview first (small, fast), then the full-size page is saved in the background.
  const token=++scanReview.previewToken;
  byId('srvBusy')?.classList.remove('hidden');
  try{
    const {bitmap}=await imageJob('preview',{key:`${id}:${row.blob.size}`,blob:row.blob,edit:e,maxSide:1100,crop:true});
    if(token===scanReview.previewToken&&byId('srvImg')){const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);c.toBlob(b=>{if(b&&token===scanReview.previewToken&&byId('srvImg')){if(scanReview.previewUrl)URL.revokeObjectURL(scanReview.previewUrl);scanReview.previewUrl=URL.createObjectURL(b);byId('srvImg').src=scanReview.previewUrl}},'image/jpeg',.85)}
  }catch{}
  rememberScanFilter(row.scanMode||camMode,filter);
  await applyScanEdit(id,e,{quiet:true});
  if(token===scanReview.previewToken)byId('srvBusy')?.classList.add('hidden');
}

async function applyScanEdit(id,edit,{quiet=false}={}){
  try{await savePhotoEdit(id,edit);if(typeof Ocr!=='undefined')Ocr.enqueue(id);queueSync()}
  catch(e){console.error(e);showToast(camT('reviewSaveError'));return}
  if(!quiet&&currentView==='scanReview')render();
}

async function applyFilterToAll(ids,filter){
  showToast(camT('reviewApplying',{n:ids.length}));
  for(const id of ids){const r=await DB.get('photos',id);if(!r)continue;if((r.edit?.filter||'original')===filter)continue;await applyScanEdit(id,{...HoliooImage.defaultEdit(),...(r.edit||{}),filter},{quiet:true})}
  showToast(camT('reviewApplied'));
  if(currentView==='scanReview')render();
}
function chooseFilterForAll(ids){
  openSheet({title:camT('reviewFilterAll'),body:`<div class="sheet-list">${SCAN_FILTERS.map(f=>`<button class="sheet-row" data-all-filter="${f}">${esc(SCAN_FILTER_LABELS[f])}</button>`).join('')}</div>`,confirmText:camT('cancel'),secondaryText:''});
  document.querySelectorAll('[data-all-filter]').forEach(b=>b.onclick=()=>{sheetRoot.innerHTML='';applyFilterToAll(ids,b.dataset.allFilter)});
}

// Delete with undo: remove page from gallery at once, commit after 6 seconds.
function deleteScanPage(id){
  flushScanDelete();
  const ctx=findSessionContext(camDest.sessionId);if(!ctx)return;
  const pos=ctx.session.photoIds.indexOf(id),shot=camShots.indexOf(id);
  ctx.session.photoIds=ctx.session.photoIds.filter(x=>x!==id);camShots=camShots.filter(x=>x!==id);saveState();
  const timer=setTimeout(flushScanDelete,6000);
  scanReview.pendingDelete={id,pos,shot,sessionId:ctx.session.id,timer};
  showUndo(camT('reviewDeleted'),()=>{
    const p=scanReview.pendingDelete;if(!p||p.id!==id)return;clearTimeout(p.timer);scanReview.pendingDelete=null;
    const c=findSessionContext(p.sessionId);if(c)c.session.photoIds.splice(Math.max(0,p.pos),0,id);
    camShots.splice(Math.max(0,p.shot),0,id);saveState();render();
  });
  removeDeletedScanPageTile(id);
}
// The grid keeps its scroll: only the deleted page's card goes, the others are renumbered. One page at a time
// (or nothing left): the screen is redrawn, which shows the next page (or leaves an empty review).
function removeDeletedScanPageTile(id){
  const tile=scanReview.index==null&&document.querySelector(`.srv-page[data-photo-id="${CSS.escape(id)}"]`);
  const left=scanReviewIds().length;
  if(!tile||!left)return render();
  tile.remove();
  document.querySelectorAll('.srv-page').forEach((c,i)=>{const n=c.querySelector('.num');if(n)n.textContent=i+1;c.querySelector('img')?.setAttribute('alt',`Page ${i+1}`)});
  const t=document.querySelector('.srv-title b');if(t)t.textContent=camT('reviewPages',{n:left});
}
function flushScanDelete(){
  const p=scanReview.pendingDelete;if(!p)return;scanReview.pendingDelete=null;clearTimeout(p.timer);
  removeLocalPhoto(p.id).catch(e=>console.warn(e));
  document.querySelector('.undo-bar')?.remove();
}
function showUndo(text,onUndo){
  document.querySelector('.undo-bar')?.remove();
  const bar=document.createElement('div');bar.className='undo-bar';bar.setAttribute('role','status');
  bar.innerHTML=`<span>${esc(text)}</span><button>${esc(camT('reviewUndo'))}</button>`;
  bar.querySelector('button').onclick=()=>{bar.remove();onUndo()};
  document.body.appendChild(bar);setTimeout(()=>bar.remove(),6000);
}
