// Notes page, screen: the sheet, items, ink layer, selection frame and action bar drawn from the document.
// ── The screen ──
function canvasBuildDom(rt){
  canvasRevokeUrls(rt);rt.itemEls.clear();rt.inkEls.clear();
  app.innerHTML=`<section class="canvas-screen" id="cvScreen">
    <div class="cv-tools" id="cvTools" role="toolbar" aria-label="Outils de notes"></div>
    <div class="cv-stage" id="cvStage">
      <div class="cv-viewport" id="cvViewport">
        <div class="cv-sheet" id="cvSheet">
          <div class="cv-world" id="cvWorld"><div class="cv-bg"></div><div class="cv-items" id="cvItems"></div><svg class="cv-ink" id="cvInk" aria-hidden="true"></svg></div>
          <div class="cv-overlay" id="cvOverlay"></div>
        </div>
      </div>
      <aside class="cv-tray" id="cvTray" aria-label="Photos de la séance"></aside>
    </div>
  </section>`;
  Object.assign(rt,{root:byId('cvScreen'),tools:byId('cvTools'),viewport:byId('cvViewport'),sheet:byId('cvSheet'),world:byId('cvWorld'),itemsBox:byId('cvItems'),ink:byId('cvInk'),overlay:byId('cvOverlay'),tray:byId('cvTray')});
  canvasRenderTools(rt);canvasLayout(rt);canvasSyncItems(rt);canvasSyncInk(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
}
function canvasRevokeUrls(rt){
  for(const p of rt.urls.values())p.then(u=>u&&URL.revokeObjectURL(u)).catch(()=>{});
  rt.urls.clear();
}

// Page size on screen: the page is CANVAS_W units wide whatever the window, scaled to fit.
function canvasLayout(rt){
  const vp=rt.viewport,avail=Math.max(280,vp.clientWidth-32);
  rt.scale=canvasClamp(avail/CANVAS_W,.3,1.3);
  const{height,bg}=rt.store.page;
  rt.sheet.style.width=`${CANVAS_W*rt.scale}px`;rt.sheet.style.height=`${height*rt.scale}px`;
  rt.world.style.height=`${height}px`;rt.world.style.transform=`scale(${rt.scale})`;
  rt.ink.setAttribute('width',CANVAS_W);rt.ink.setAttribute('height',height);
  rt.world.dataset.bg=bg;
  const stylus=canvasStylusOnly();
  rt.sheet.className=`cv-sheet tool-${rt.tool}${stylus?'':' finger-draw'}`;
}
function canvasSetHeight(rt,h){
  if(h===rt.store.page.height)return;
  rt.store.page.height=h;canvasLayout(rt);canvasDirty(rt);
}

// Photos and text: one element per item, kept in step with the document.
async function canvasPhotoUrl(rt,id){
  if(!rt.urls.has(id))rt.urls.set(id,(async()=>{const row=await photoRow(id),blob=row&&photoBlob(row);return blob?URL.createObjectURL(blob):null})());
  return rt.urls.get(id);
}
function canvasItemList(rt){
  const list=[...rt.store.items.values()].filter(i=>!i.deleted);
  if(rt.editing?.isNew)list.push(rt.editing.item);
  return list;
}
function canvasSyncItems(rt){
  const live=canvasItemList(rt),ids=new Set(live.map(i=>i.id));
  for(const[id,el]of rt.itemEls)if(!ids.has(id)){el.remove();rt.itemEls.delete(id)}
  for(const it of live)canvasUpdateItemEl(rt,it);
}
function canvasUpdateItemEl(rt,it){
  let el=rt.itemEls.get(it.id),fresh=false;
  if(!el){el=document.createElement('div');el.dataset.id=it.id;rt.itemEls.set(it.id,el);rt.itemsBox.appendChild(el);fresh=true}
  el.className=`cv-item cv-${it.type}`;el.style.zIndex=it.z;
  if(it.type==='photo'){
    Object.assign(el.style,{left:`${it.x}px`,top:`${it.y}px`,width:`${it.w}px`,height:`${it.h}px`});
    if(fresh){
      el.innerHTML=`<img alt="" draggable="false" decoding="async"><span class="cv-missing">${icon('image',{size:28})}<span>Photo indisponible</span></span>`;
      canvasPhotoUrl(rt,it.photoId).then(url=>{if(!el.isConnected)return;if(url)el.querySelector('img').src=url;else el.classList.add('is-missing')}).catch(()=>el.classList.add('is-missing'));
    }
  }else if(it.type==='text'){
    const editing=rt.editing?.item.id===it.id,lh=canvasLineHeight(it.size);
    Object.assign(el.style,{left:`${it.x}px`,top:`${it.y}px`,width:`${it.w}px`,height:`${it.h}px`,color:it.color,font:`500 ${it.size}px/${lh}px ${CANVAS_FONT}`,padding:`${CANVAS_TEXT_PAD}px`});
    el.classList.toggle('editing',editing);
    if(editing){
      if(!el.querySelector('textarea')){
        const ta=document.createElement('textarea');ta.className='cv-text-edit';ta.value=rt.editing.item.text;ta.setAttribute('aria-label','Texte');ta.spellcheck=true;
        el.replaceChildren(ta);
      }
    }else{el.replaceChildren();const pre=document.createElement('div');pre.className='cv-text-lines';pre.textContent=it.lines.join('\n');el.appendChild(pre)}
  }
}

// The ink: one path per stroke, above every item.
function canvasStrokePathD(s){return canvasOutlinePath(HoliooPerfectFreehand.getStroke(s.pts,canvasStrokeOptions(s)))}
function canvasInkPath(s){
  const p=document.createElementNS(CANVAS_SVG,'path');
  p.setAttribute('fill',s.color);p.dataset.id=s.id;
  if(s.tool==='highlighter'){p.setAttribute('fill-opacity',CANVAS_HIGHLIGHT_ALPHA);p.setAttribute('class','hl')}
  return p;
}
function canvasSyncInk(rt){
  const live=new Map([...rt.store.strokes].filter(([,s])=>!s.deleted));
  for(const[id,el]of rt.inkEls)if(!live.has(id)){el.remove();rt.inkEls.delete(id)}
  for(const[id,s]of live){
    const el=rt.inkEls.get(id);
    if(!el){const p=canvasInkPath(s);p.setAttribute('d',canvasStrokePathD(s));p._pts=s.pts;rt.ink.appendChild(p);rt.inkEls.set(id,p)}
    else if(el._pts&&el._pts!==s.pts){el.setAttribute('d',canvasStrokePathD(s));el._pts=s.pts}   // an undo / redo of a corrected stroke
  }
}

// Selection frame, resize handle and the little action bar. Drawn at screen size above the page (not scaled with it).
function canvasItemBox(it){
  return{x:it.x,y:it.y,w:it.w,h:it.h};
}
const canvasResizable=it=>it.type==='photo'||it.type==='text';
function canvasRenderOverlay(rt){
  const it=rt.selected&&!rt.editing?canvasItem(rt,rt.selected):null,s=rt.scale,keep=rt.overlay.querySelector('.cv-eraser');
  rt.overlay.replaceChildren(...(keep?[keep]:[]));
  if(!it)return;
  const b=canvasItemBox(it),w=CANVAS_W*s;
  const frame=document.createElement('div');frame.className='cv-sel';
  Object.assign(frame.style,{left:`${b.x*s}px`,top:`${b.y*s}px`,width:`${b.w*s}px`,height:`${b.h*s}px`});
  rt.overlay.appendChild(frame);
  if(canvasResizable(it)){
    const h=document.createElement('span');h.className='cv-handle';h.setAttribute('aria-hidden','true');
    Object.assign(h.style,{left:`${(b.x+b.w)*s}px`,top:`${(b.y+b.h)*s}px`});rt.overlay.appendChild(h);
  }
  const bar=document.createElement('div');bar.className='cv-bar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Actions sur l’élément');
  bar.innerHTML=`<button type="button" data-cv-act="front" title="Mettre au premier plan" aria-label="Mettre au premier plan">${icon('bringFront',{size:18})}</button><button type="button" data-cv-act="duplicate" title="Dupliquer" aria-label="Dupliquer">${icon('copy',{size:18})}</button><button type="button" class="danger" data-cv-act="delete" title="Supprimer" aria-label="Supprimer">${icon('trash',{size:18})}</button>`;
  bar.style.left=`${canvasClamp((b.x+b.w/2)*s,72,Math.max(72,w-72))}px`;
  rt.overlay.appendChild(bar);
  canvasPlaceBar(rt);
}
// The action bar stays inside what is visible: above the item, else below it, else inside its top edge.
function canvasPlaceBar(rt){
  const bar=rt.overlay.querySelector('.cv-bar'),it=canvasItem(rt,rt.selected);if(!bar||!it)return;
  const b=canvasItemBox(it),s=rt.scale,barH=56,sr=rt.sheet.getBoundingClientRect(),vr=rt.viewport.getBoundingClientRect();
  const visTop=vr.top-sr.top,visBottom=vr.bottom-sr.top,top=b.y*s,bottom=(b.y+b.h)*s;
  const above=top-barH-12,below=bottom+12;
  bar.style.top=`${above>=visTop+8?above:below+barH<=visBottom-8?below:canvasClamp(top+12,visTop+8,Math.max(visTop+8,visBottom-barH-8))}px`;
}
