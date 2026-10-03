// Notes on a tablet or computer (window ≥ 768 px, ui/desk-shell.js): one free page per séance, OneNote-style.
// Second toolbar: select, pen, highlighter, stroke eraser, text box, arrow, rectangle | 4 colours | 3 sizes |
// background | stylus only | add space. Undo / redo and "Enregistrement… / Enregistré" are in the top bar (the spacer
// of ui/desk-shell.js). A floating, collapsible tray on the left holds the séance's photos: drag one onto the page
// (a tap places it in the middle of what is visible); new ones carry a badge, placed ones a check mark.
// The ink is a layer above the photos. Pointer events: pen pressure; with "stylus only" the finger scrolls.
//
// Document model, history, merge: features/canvas-doc.js. Storage / Drive / other devices: features/canvas-sync.js.
// PDF: features/canvas-export.js (drawn by features/canvas-render.js). Phones never get here (they keep the Carnet).

let canvasRuntime=null;      // the page being edited; it survives a redraw of the screen, so nothing in progress is lost
let canvasCleanup=null;      // called by app.js before the screen is drawn again
const canvasHistories=new Map();   // séance id → undo / redo, kept while the app is open (as the Carnet's)
const CANVAS_PEN_HOLD=800;         // ms after the last pen event during which a touch is a resting palm
const CANVAS_MIN_STEP=.8;          // page units between two points of a stroke
const CANVAS_SVG='http://www.w3.org/2000/svg';
const CANVAS_TOOL_UI={
  select:['pointer','Sélection : déplacer, redimensionner'],pen:['penLine','Stylo'],highlighter:['highlighter','Surligneur'],
  eraser:['eraser','Gomme : efface le trait entier'],text:['type','Zone de texte : touchez la page, double-cliquez pour modifier'],
  arrow:['arrowUpRight','Flèche : glissez'],rect:['square','Rectangle : glissez']
};
const CANVAS_COLOR_NAMES={pen:['Noir','Bleu','Rouge','Vert'],highlighter:['Jaune','Vert','Rose','Bleu']};
const canvasMeasureCtx=document.createElement('canvas').getContext('2d');
const canvasMeasure=size=>t=>{canvasMeasureCtx.font=canvasFontCss(size);return canvasMeasureCtx.measureText(t).width};

// Tool, colour and size are remembered on the device.
const canvasPrefs=()=>state.settings.canvasPrefs??={tool:'pen',ci:{pen:0,highlighter:0},size:1};
const canvasStylusOnly=()=>state.settings.canvasPrefs?.stylusOnly??(navigator.maxTouchPoints>0);
const canvasPaletteKind=tool=>tool==='highlighter'?'highlighter':'pen';
const canvasColor=(tool=canvasRuntime?.tool)=>{const k=canvasPaletteKind(tool);return CANVAS_COLORS[k][canvasPrefs().ci[k]??0]};

// Called by the toolbar / pages / camera / presence.
const canvasSessionId=()=>canvasRuntime?.root?.isConnected?canvasRuntime.session.id:null;
const canvasBusy=()=>{const rt=canvasRuntime;return!!rt&&!!rt.root?.isConnected&&!!(rt.drawing||rt.drag||rt.editing||rt.erasing||rt.trayDrag||rt.shape||rt.exporting)};
function canvasCameraDestination(){const rt=canvasRuntime;return rt?{courseId:rt.course.id,sectionId:rt.section.id,sessionId:rt.session.id}:null}

// ── Which séance ──
// Asked for (currentSessionId, valid), else — from the toolbar, `fresh` — the one of the course and filter on screen:
// the open one if it fits the filter, else today's of that section, else the latest.
function canvasPickSession({fresh=false}={}){
  const cur=currentSessionId&&findSessionContext(currentSessionId);
  if(!fresh)return cur||canvasPickSession({fresh:true});
  const course=galleryCourse();if(!course)return null;
  const filter=galleryFilter();
  if(cur&&cur.course.id===course.id&&gallerySectionMatches(cur.section,filter))return cur;
  const section=galleryCaptureSection(course,filter,null);
  const today=section&&todaySession(section);
  if(today)return{course,section,session:today};
  const latest=galleryLatestSession(course,filter);
  return latest?{course,section:latest.section,session:latest.session}:null;
}
// Toolbar "Notes" (ui/desk-shell.js).
function deskNotes(){
  const q=canvasPickSession({fresh:true});
  if(!q)currentSessionId=null;
  navigate('notes',q?{courseId:q.course.id,sectionId:q.section.id,sessionId:q.session.id}:{});
}

async function renderNotesCanvas(){
  if(!isDesk()){navigate('home');return}
  setChrome(false);
  const found=canvasPickSession();
  if(!found){canvasRenderEmpty();return}
  const{course,section,session}=found;
  currentCourseId=course.id;currentSectionId=section.id;currentSessionId=session.id;
  let rt=canvasRuntime;
  if(!rt||rt.session.id!==session.id){
    if(rt)await canvasSave(rt);
    rt=await canvasCreateRuntime(course,section,session);
  }else{rt.course=course;rt.section=section;rt.session=session}
  canvasRuntime=rt;
  canvasBuildDom(rt);
  canvasBind(rt);
  canvasCleanup=()=>canvasLeave(rt);
}
function canvasRenderEmpty(){
  const course=galleryCourse();
  app.innerHTML=`<section class="canvas-screen cv-empty">${EmptyState({iconName:'penLine',title:course?`Aucune séance dans ${course.name}`:'Aucun cours',text:course?'Les notes se rangent par séance : créez-en une, ou prenez une photo, et la page libre s’ouvre ici.':'Ajoutez d’abord un cours dans la Galerie.',action:course?ActionButton({label:'Créer une séance',id:'cvNewSession',iconName:'plus',full:false}):ActionButton({label:'Ouvrir la Galerie',attrs:'data-nav="gallery"',full:false})})}</section>`;
  byId('cvNewSession')?.addEventListener('click',()=>{
    const section=galleryCaptureSection(course,galleryFilter(),null);
    if(!section){showToast('Ce cours n’a pas de section');return}
    const num=(section.sessions.at(-1)?.number||0)+1,q={id:uid(),number:num,title:`${section.name} ${num}`,photoIds:[],createdAt:now(),visibility:'private'};
    section.sessions.push(q);saveState();queueSync();
    navigate('notes',{courseId:course.id,sectionId:section.id,sessionId:q.id});
  });
}

async function canvasCreateRuntime(course,section,session){
  let doc=await canvasLoadStored(session.id);
  if(!doc){doc=emptyCanvasDoc(session.id);doc.known=[...session.photoIds]}   // photos already there are not "new"
  if(!canvasHistories.has(session.id))canvasHistories.set(session.id,canvasHistory());
  const rt={course,section,session,store:canvasStore(doc),hist:canvasHistories.get(session.id),docStamp:doc.updatedAt,
    tool:CANVAS_TOOLS.includes(canvasPrefs().tool)?canvasPrefs().tool:'pen',selected:null,editing:null,drawing:null,drag:null,erasing:null,shape:null,trayDrag:null,
    touches:new Map(),pan:null,penUntil:0,lastTap:null,dirty:false,saveState:'saved',saveTimer:0,syncTimer:0,scale:1,
    itemEls:new Map(),inkEls:new Map(),urls:new Map(),arrivals:new Set(),guards:[],unsub:[],stale:false,exporting:false};
  return rt;
}
function canvasDiscardRuntime(){
  const rt=canvasRuntime;if(!rt)return;
  clearTimeout(rt.saveTimer);clearTimeout(rt.syncTimer);canvasRevokeUrls(rt);
  canvasHistories.delete(rt.session.id);canvasRuntime=null;
}

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

// Photos, text and shapes: one element per item, kept in step with the document.
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
  }else{
    // Arrow, rectangle: an SVG over the item's box (a margin for the arrow head and the stroke), in page units.
    const pad=40,box=it.type==='arrow'?canvasArrowBox(it.p):it,d=it.type==='arrow'?canvasArrowPath(it.p,it.size):canvasRectPath(it);
    Object.assign(el.style,{left:`${box.x-pad}px`,top:`${box.y-pad}px`,width:`${box.w+2*pad}px`,height:`${box.h+2*pad}px`});
    el.innerHTML=`<svg width="${box.w+2*pad}" height="${box.h+2*pad}" viewBox="${box.x-pad} ${box.y-pad} ${box.w+2*pad} ${box.h+2*pad}" aria-hidden="true"><path d="${d}" fill="none" stroke="${it.color}" stroke-width="${it.size}" stroke-linecap="round" stroke-linejoin="round"/><path class="hit" d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(22,it.size+16)}" stroke-linecap="round"/></svg>`;
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
  for(const[id,s]of live)if(!rt.inkEls.has(id)){const p=canvasInkPath(s);p.setAttribute('d',canvasStrokePathD(s));rt.ink.appendChild(p);rt.inkEls.set(id,p)}
}

// Selection frame, resize handle and the little action bar. Drawn at screen size above the page (not scaled with it).
function canvasItemBox(it){
  if(it.type==='arrow'){const b=canvasArrowBox(it.p),m=Math.max(10,it.size*2.5);return{x:b.x-m,y:b.y-m,w:b.w+2*m,h:b.h+2*m}}
  return{x:it.x,y:it.y,w:it.w,h:it.h};
}
const canvasResizable=it=>it.type==='photo'||it.type==='rect'||it.type==='text';
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

// ── Second toolbar ──
function canvasToolsHtml(rt){
  const p=canvasPrefs(),pk=canvasPaletteKind(rt.tool),palette=CANVAS_COLORS[pk],ci=p.ci[pk]??0,stylus=canvasStylusOnly();
  const btn=(attrs,label,inner,active,cls='')=>`<button class="cv-btn${cls?` ${cls}`:''}${active?' active':''}" type="button" ${attrs} title="${esc(label)}" aria-label="${esc(label)}"${active===undefined?'':` aria-pressed="${!!active}"`}>${inner}</button>`;
  const sessions=rt.course.sections.map(s=>`<optgroup label="${esc(s.name)}">${s.sessions.map(q=>`<option value="${q.id}"${q.id===rt.session.id?' selected':''}>${esc(q.title)}</option>`).join('')}</optgroup>`).join('');
  return`<label class="cv-session" title="Séance">${icon('layers',{size:16})}<select id="cvSession" aria-label="Séance">${sessions}</select></label>
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Outils">${CANVAS_TOOLS.map(t=>btn(`data-cv-tool="${t}"`,CANVAS_TOOL_UI[t][1],icon(CANVAS_TOOL_UI[t][0],{size:20}),rt.tool===t)).join('')}</div>
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Couleur">${palette.map((c,i)=>`<button class="cv-color${i===ci?' active':''}" type="button" data-cv-color="${i}" style="--c:${c}" title="${CANVAS_COLOR_NAMES[pk][i]}" aria-label="${CANVAS_COLOR_NAMES[pk][i]}" aria-pressed="${i===ci}"></button>`).join('')}</div>
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Épaisseur">${['Fin','Moyen','Épais'].map((l,i)=>btn(`data-cv-size="${i}"`,`Épaisseur : ${l.toLowerCase()}`,`<i class="cv-dot" style="--d:${5+i*5}px"></i>`,i===p.size)).join('')}</div>
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Fond de page">${[['lines','rows','Lignes'],['grid','grid','Quadrillage'],['blank','square','Page blanche']].map(([v,ic,l])=>btn(`data-cv-bg="${v}"`,l,icon(ic,{size:19}),rt.store.page.bg===v)).join('')}</div>
    <span class="cv-sep"></span>
    ${btn('data-cv-stylus',stylus?'Stylet seul : le stylet dessine, le doigt fait défiler (cliquez pour dessiner aussi au doigt)':'Dessin au doigt activé (cliquez pour réserver le dessin au stylet)',icon('stylus',{size:20}),stylus)}
    ${btn('data-cv-space','Ajouter de l’espace en bas de la page',icon('addSpace',{size:20}),undefined)}`;
}
function canvasRenderTools(rt){
  const keep=document.activeElement?.id==='cvSession';
  rt.tools.innerHTML=canvasToolsHtml(rt);
  if(keep)byId('cvSession')?.focus();
}
// Undo / redo / "Enregistré" live in the desk toolbar (ui/desk-shell.js asks for the HTML after every render).
function canvasTopBarHtml(){
  const rt=canvasRuntime,live=!!rt&&!!rt.root?.isConnected;
  const label={saved:'Enregistré',saving:'Enregistrement…',error:'Non enregistré'}[live?rt.saveState:'saved'];
  return`<button class="desk-tool" type="button" id="cvUndo" data-cv-undo title="Annuler (Ctrl+Z)" aria-label="Annuler"${live&&rt.hist.undo.length?'':' disabled'}>${icon('undo',{size:20})}</button>
    <button class="desk-tool" type="button" id="cvRedo" data-cv-redo title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"${live&&rt.hist.redo.length?'':' disabled'}>${icon('redo',{size:20})}</button>
    <span class="cv-status ${live?rt.saveState:'saved'}" id="cvStatus" role="status" aria-live="polite">${icon('check',{size:14,stroke:2.6})}<span>${label}</span></span>`;
}
function canvasRefreshTopBar(){
  const rt=canvasRuntime,live=!!rt&&!!rt.root?.isConnected;
  const u=byId('cvUndo'),r=byId('cvRedo'),s=byId('cvStatus');
  if(u)u.disabled=!(live&&rt.hist.undo.length);if(r)r.disabled=!(live&&rt.hist.redo.length);
  if(s){const st=live?rt.saveState:'saved';s.className=`cv-status ${st}`;s.lastElementChild.textContent={saved:'Enregistré',saving:'Enregistrement…',error:'Non enregistré'}[st]}
}
document.addEventListener('holioo:desk',canvasRefreshTopBar);
document.addEventListener('click',e=>{
  const rt=canvasRuntime;if(!rt?.root?.isConnected)return;
  if(e.target.closest('[data-cv-undo]'))canvasUndoAction(rt);
  else if(e.target.closest('[data-cv-redo]'))canvasRedoAction(rt);
});

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
  if(rt.erasing){for(const s of rt.erasing.before)rt.store.strokes.set(s.id,s);rt.erasing=null;canvasSyncInk(rt)}
  if(rt.shape){rt.shape.el.remove();rt.shape=null}
}

function canvasPlacePhotoAt(rt,photoId,center){
  return(async()=>{
    const row=await photoRow(photoId),blob=row&&photoBlob(row);
    if(!blob){showToast('Photo indisponible sur cet appareil');return}
    const bmp=await createImageBitmap(blob),ratio=bmp.width/bmp.height;bmp.close?.();
    const{w,h}=canvasPhotoSize(ratio),c=center||canvasVisibleCenter(rt);
    let x=canvasClamp(c.x-w/2,0,CANVAS_W-w),y=Math.max(0,c.y-h/2);
    const same=()=>canvasItemList(rt).some(i=>i.type==='photo'&&Math.abs(i.x-x)<6&&Math.abs(i.y-y)<6);
    for(let n=0;n<8&&same();n++){x=Math.min(CANVAS_W-w,x+28);y+=28}
    const it={id:uid(),type:'photo',photoId,x:canvasRound(x),y:canvasRound(y),w,h,z:canvasNextZ([...rt.store.items.values()]),updatedAt:Date.now()};
    canvasGrowFor(rt,it.y+it.h);
    rt.store.items.set(it.id,it);rt.store.known.add(photoId);
    canvasCommit(rt,[canvasChangeCreate('i',it)]);
    rt.selected=it.id;canvasSyncItems(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
  })().catch(e=>{console.warn(e);showToast('Photo non placée')});
}
function canvasVisibleCenter(rt){
  const v=rt.viewport.getBoundingClientRect(),s=rt.sheet.getBoundingClientRect();
  return{x:canvasClamp((v.left+v.width/2-s.left)/rt.scale,0,CANVAS_W),y:Math.max(0,(v.top+v.height/2-s.top)/rt.scale)};
}

function canvasSelectedChange(rt,make){
  const it=canvasItem(rt,rt.selected);if(!it)return;
  const next=make({...it,p:it.p?[...it.p]:undefined});if(!next)return;
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
  if(it.p){dup.p=it.p.map((v,i)=>v+(i%2?30:Math.max(0,dx)));Object.assign(dup,canvasArrowBox(dup.p))}
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

// ── Pointer tools ──
const canvasPoint=(rt,e)=>{const r=rt.sheet.getBoundingClientRect();return{x:(e.clientX-r.left)/rt.scale,y:(e.clientY-r.top)/rt.scale}};
const canvasTol=rt=>16/rt.scale;   // 16 screen px, in page units
const canvasPressure=e=>e.pointerType==='pen'?canvasRound(e.pressure||.5,2):.5;
// The pen and the mouse draw; a finger only when "stylus only" is off (and not while a pen is at work: that is a palm).
function canvasIsInk(rt,e){
  if(e.pointerType==='touch')return!canvasStylusOnly()&&performance.now()>=rt.penUntil;
  return true;
}
function canvasBind(rt){
  const sheet=rt.sheet,add=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);rt.guards.push([target,type,fn,opts])};
  add(sheet,'pointerdown',e=>canvasDown(rt,e));
  add(sheet,'pointermove',e=>canvasMove(rt,e));
  add(sheet,'pointerup',e=>canvasUp(rt,e));
  add(sheet,'pointercancel',e=>canvasCancel(rt,e));
  add(sheet,'pointerleave',()=>{const c=rt.overlay.querySelector('.cv-eraser');if(c)c.style.display='none'});
  add(sheet,'dblclick',e=>{
    if(rt.editing||e.target.closest('.cv-bar'))return;
    const hit=canvasHitItem([...rt.store.items.values()],...Object.values(canvasPoint(rt,e)),canvasTol(rt));
    if(hit?.type==='text')canvasEditText(rt,hit,false);
  });
  add(rt.viewport,'scroll',()=>canvasPlaceBar(rt),{passive:true});
  add(rt.overlay,'click',e=>{
    const act=e.target.closest('[data-cv-act]')?.dataset.cvAct;if(!act)return;
    if(act==='delete')canvasDeleteSelected(rt);else if(act==='duplicate')canvasDuplicateSelected(rt);else canvasFrontSelected(rt);
  });
  // Palm rejection: while the pen is at work (and just after), touches neither scroll nor draw. The pen itself never scrolls.
  const penBusy=()=>!!rt.drawing||!!rt.drag||performance.now()<rt.penUntil;
  add(document,'pointerdown',e=>{if(e.pointerType==='pen')rt.penUntil=performance.now()+CANVAS_PEN_HOLD},true);
  add(document,'pointermove',e=>{if(e.pointerType==='pen')rt.penUntil=performance.now()+CANVAS_PEN_HOLD},true);
  for(const type of['touchstart','touchmove'])add(document,type,e=>{
    if(!rt.root.isConnected||!e.cancelable||!rt.sheet.contains(e.target))return;
    if(penBusy()||[...e.changedTouches].some(t=>t.touchType==='stylus'))e.preventDefault();
  },{capture:true,passive:false});
  add(document,'keydown',e=>canvasOnKey(rt,e));
  // Toolbar
  add(rt.tools,'click',e=>canvasToolsClick(rt,e));
  add(rt.tools,'change',e=>{
    if(e.target.id!=='cvSession')return;
    const sid=e.target.value,s=rt.course.sections.find(x=>x.sessions.some(q=>q.id===sid));
    canvasCommitText(rt);canvasSave(rt).then(()=>navigate('notes',{courseId:rt.course.id,sectionId:s?.id,sessionId:sid}));
  });
  // Tray
  add(rt.tray,'click',e=>{
    if(e.target.closest('[data-cv-tray-toggle]')){canvasPrefs().tray=canvasPrefs().tray==='closed'?'open':'closed';saveState();canvasRenderTray(rt);return}
  });
  add(rt.tray,'pointerdown',e=>canvasTrayDown(rt,e));
  add(document,'pointermove',e=>canvasTrayMove(rt,e));
  add(document,'pointerup',e=>canvasTrayUp(rt,e));
  add(document,'pointercancel',()=>canvasTrayEnd(rt));
  const ro=new ResizeObserver(()=>{if(rt.root.isConnected&&Math.abs(rt.viewport.clientWidth-rt.lastW)>1){rt.lastW=rt.viewport.clientWidth;canvasLayout(rt);canvasRenderOverlay(rt)}});
  rt.lastW=rt.viewport.clientWidth;ro.observe(rt.viewport);rt.guards.push({disconnect:()=>ro.disconnect()});
  // Photos the phone sends arrive in the tray at once.
  if(typeof onRemoteSignal==='function')rt.unsub.push(onRemoteSignal((sig,got)=>canvasOnSignal(rt,sig,got)));
  if(typeof pullSessionCanvas==='function')pullSessionCanvas(rt.session.id).catch(e=>console.warn('Canvas pull',e));
}
function canvasLeave(rt){
  canvasCommitText(rt);canvasCancelGesture(rt);
  for(const g of rt.guards){if(Array.isArray(g))g[0].removeEventListener(g[1],g[2],g[3]);else g.disconnect?.()}
  rt.guards=[];for(const u of rt.unsub)u();rt.unsub=[];
  if(currentView!=='notes'){for(const id of canvasTrayIds(rt))rt.store.known.add(id);rt.dirty=true}   // seen: no longer "new"
  rt.root=null;
  canvasSave(rt);
}

function canvasToolsClick(rt,e){
  const t=e.target.closest('[data-cv-tool],[data-cv-color],[data-cv-size],[data-cv-bg],[data-cv-stylus],[data-cv-space]');if(!t)return;
  const d=t.dataset,prefs=canvasPrefs();
  if(d.cvTool){
    canvasCommitText(rt);rt.tool=d.cvTool;prefs.tool=d.cvTool;
    if(rt.tool!=='select')rt.selected=null;
    saveState();canvasRenderOverlay(rt);canvasLayout(rt);canvasRenderTools(rt);return;
  }
  if(d.cvColor!==undefined){
    const k=canvasPaletteKind(rt.tool),i=+d.cvColor;prefs.ci[k]=i;saveState();
    const color=CANVAS_COLORS[k][i];
    if(rt.editing&&rt.editing.item.type==='text'){rt.editing.item.color=color;const el=rt.itemEls.get(rt.editing.item.id);if(el)el.style.color=color}
    else if(rt.selected)canvasSelectedChange(rt,o=>o.type==='photo'?null:{...o,color});
    canvasRenderTools(rt);return;
  }
  if(d.cvSize!==undefined){
    const i=+d.cvSize;prefs.size=i;saveState();
    const sel=rt.editing?.item||canvasItem(rt,rt.selected);
    if(sel?.type==='text'){
      const size=CANVAS_SIZES.text[i];
      if(rt.editing){rt.editing.item.size=size;rt.editing.item.h=canvasTextHeight(1,size);canvasUpdateItemEl(rt,rt.editing.item)}
      else canvasSelectedChange(rt,o=>{const lines=canvasLayoutText(o.text,o.w-2*CANVAS_TEXT_PAD,canvasMeasure(size));return{...o,size,lines,h:canvasTextHeight(lines.length,size)}});
    }else if(sel&&(sel.type==='arrow'||sel.type==='rect'))canvasSelectedChange(rt,o=>({...o,size:CANVAS_SIZES.shape[i]}));
    canvasRenderTools(rt);return;
  }
  if(d.cvBg){
    if(rt.store.page.bg===d.cvBg)return;
    const before={bg:rt.store.page.bg},after={bg:d.cvBg};
    rt.store.page.bg=d.cvBg;rt.store.page.bgAt=Date.now();
    canvasCommit(rt,[canvasChangePage(before,after)]);
    canvasLayout(rt);canvasRenderTools(rt);return;
  }
  if(d.cvStylus!==undefined){prefs.stylusOnly=!canvasStylusOnly();saveState();canvasLayout(rt);canvasRenderTools(rt);showToast(canvasStylusOnly()?'Stylet seul : le doigt fait défiler':'Le doigt dessine aussi (deux doigts pour défiler)');return}
  if(d.cvSpace!==undefined){
    const before={height:rt.store.page.height},h=Math.min(CANVAS_MAX_H,rt.store.page.height+CANVAS_ADD_SPACE);
    if(h===before.height){showToast('La page a atteint sa longueur maximale');return}
    rt.store.page.height=h;canvasCommit(rt,[canvasChangePage(before,{height:h})]);
    canvasLayout(rt);canvasRenderOverlay(rt);
    rt.viewport.scrollBy({top:Math.min(CANVAS_ADD_SPACE*rt.scale,rt.viewport.clientHeight*.6),behavior:'smooth'});
  }
}

function canvasOnKey(rt,e){
  if(!rt.root?.isConnected||currentView!=='notes')return;
  const typing=e.target.matches?.('input,textarea,select,[contenteditable="true"]');
  const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&k==='z'&&!typing){e.preventDefault();e.shiftKey?canvasRedoAction(rt):canvasUndoAction(rt);return}
  if(mod&&k==='y'&&!typing){e.preventDefault();canvasRedoAction(rt);return}
  if(typing||rt.editing)return;
  if((e.key==='Delete'||e.key==='Backspace')&&rt.selected){e.preventDefault();canvasDeleteSelected(rt)}
  else if(e.key==='Escape'&&rt.selected){rt.selected=null;canvasRenderOverlay(rt)}
}

function canvasDown(rt,e){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(e.target.closest('.cv-text-edit,.cv-bar'))return;
  if(rt.editing)canvasCommitText(rt);
  if(e.pointerType==='touch'){
    rt.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    // Two fingers scroll the page (when a finger may draw): the stroke in progress is dropped.
    if(rt.touches.size>=2&&!canvasStylusOnly()){
      if(rt.drawing){rt.drawing.path.remove();rt.drawing=null}
      rt.pan={x:avg(rt.touches,'x'),y:avg(rt.touches,'y')};e.preventDefault();return;
    }
    if(performance.now()<rt.penUntil)return;
  }
  const p=canvasPoint(rt,e);
  if(rt.tool==='select')return canvasSelectDown(rt,e,p);
  if(!canvasIsInk(rt,e))return;
  if(rt.tool==='pen'||rt.tool==='highlighter')return canvasInkDown(rt,e,p);
  if(rt.tool==='eraser'){rt.erasing={pointerId:e.pointerId,before:[]};rt.sheet.setPointerCapture(e.pointerId);canvasEraseAt(rt,p,e);e.preventDefault();return}
  if(rt.tool==='text'){rt.pendingText={id:e.pointerId,x:e.clientX,y:e.clientY,p,hit:canvasHitItem([...rt.store.items.values()],p.x,p.y,canvasTol(rt))};return}
  if(rt.tool==='arrow'||rt.tool==='rect')return canvasShapeDown(rt,e,p);
}
function avg(map,k){let s=0;for(const v of map.values())s+=v[k];return s/map.size}

function canvasMove(rt,e){
  if(e.pointerType==='touch'&&rt.touches.has(e.pointerId)){
    rt.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(rt.pan&&rt.touches.size>=2){
      const x=avg(rt.touches,'x'),y=avg(rt.touches,'y');
      rt.viewport.scrollBy(rt.pan.x-x,rt.pan.y-y);rt.pan={x,y};e.preventDefault();return;
    }
  }
  if(rt.tool==='eraser'&&e.pointerType!=='touch')canvasEraserCursor(rt,e);
  const p=canvasPoint(rt,e);
  if(rt.pendingText&&rt.pendingText.id===e.pointerId&&Math.hypot(e.clientX-rt.pendingText.x,e.clientY-rt.pendingText.y)>8)rt.pendingText=null;
  if(rt.pendingDeselect&&rt.pendingDeselect.id===e.pointerId&&Math.hypot(e.clientX-rt.pendingDeselect.x,e.clientY-rt.pendingDeselect.y)>8)rt.pendingDeselect=null;
  if(rt.drag&&rt.drag.pointerId===e.pointerId){canvasDragMove(rt,e,p);e.preventDefault();return}
  const d=rt.drawing;
  if(d&&d.pointerId===e.pointerId){
    const events=e.getCoalescedEvents?.(),list=events?.length?events:[e];
    for(const ev of list){
      const q=canvasPoint(rt,ev),last=d.pts.at(-1);
      if(Math.hypot(q.x-last[0],q.y-last[1])>=CANVAS_MIN_STEP)d.pts.push([canvasRound(q.x),canvasRound(q.y),canvasPressure(ev)]);
    }
    canvasGrowFor(rt,d.pts.at(-1)[1]);
    if(!d.raf)d.raf=requestAnimationFrame(()=>{d.raf=0;canvasDrawLive(d)});
    e.preventDefault();return;
  }
  if(rt.erasing&&rt.erasing.pointerId===e.pointerId){canvasEraseAt(rt,p,e);e.preventDefault();return}
  if(rt.shape&&rt.shape.pointerId===e.pointerId){canvasShapeMove(rt,p);e.preventDefault()}
}
function canvasUp(rt,e){
  rt.touches.delete(e.pointerId);
  if(rt.pan&&rt.touches.size<2)rt.pan=null;
  const p=canvasPoint(rt,e);
  if(rt.drag&&rt.drag.pointerId===e.pointerId){canvasDragEnd(rt,e,p);return}
  const d=rt.drawing;
  if(d&&d.pointerId===e.pointerId){canvasInkEnd(rt,d);e.preventDefault();return}
  if(rt.erasing&&rt.erasing.pointerId===e.pointerId){canvasEraseEnd(rt);return}
  if(rt.shape&&rt.shape.pointerId===e.pointerId){canvasShapeEnd(rt,p);return}
  if(rt.pendingText&&rt.pendingText.id===e.pointerId){
    const pt=rt.pendingText;rt.pendingText=null;
    if(pt.hit?.type==='text')canvasEditText(rt,pt.hit,false);else canvasNewText(rt,pt.p);
    return;
  }
  if(rt.pendingDeselect&&rt.pendingDeselect.id===e.pointerId){rt.pendingDeselect=null;if(rt.selected){rt.selected=null;canvasRenderOverlay(rt)}}
}
function canvasCancel(rt,e){
  rt.touches.delete(e.pointerId);if(rt.touches.size<2)rt.pan=null;
  rt.pendingText=null;rt.pendingDeselect=null;
  if(rt.drawing&&rt.drawing.pointerId===e.pointerId){rt.drawing.path.remove();rt.drawing=null}
  if(rt.drag&&rt.drag.pointerId===e.pointerId){const g=rt.drag;rt.store.items.set(g.id,g.orig);rt.drag=null;canvasSyncItems(rt);canvasRenderOverlay(rt)}
  if(rt.erasing&&rt.erasing.pointerId===e.pointerId)canvasEraseEnd(rt);
  if(rt.shape&&rt.shape.pointerId===e.pointerId){rt.shape.el.remove();rt.shape=null}
}

// Select: move an item by dragging it, resize from the corner (a photo keeps its proportions).
function canvasHandleHit(rt,it,e){
  if(!canvasResizable(it))return false;
  const r=rt.sheet.getBoundingClientRect();
  return Math.hypot(e.clientX-(r.left+(it.x+it.w)*rt.scale),e.clientY-(r.top+(it.y+it.h)*rt.scale))<=24;
}
function canvasSelectDown(rt,e,p){
  const sel=canvasItem(rt,rt.selected);
  let it=null,mode='move';
  if(sel&&canvasHandleHit(rt,sel,e)){it=sel;mode='resize'}
  else it=canvasHitItem([...rt.store.items.values()],p.x,p.y,canvasTol(rt));
  if(!it){rt.pendingDeselect={id:e.pointerId,x:e.clientX,y:e.clientY};return}
  rt.selected=it.id;
  rt.drag={mode,id:it.id,pointerId:e.pointerId,sx:p.x,sy:p.y,cx:e.clientX,cy:e.clientY,orig:{...it,p:it.p?[...it.p]:undefined},moved:false,tap:rt.lastTap};
  canvasRenderOverlay(rt);
  rt.sheet.setPointerCapture(e.pointerId);e.preventDefault();
}
function canvasDragMove(rt,e,p){
  const g=rt.drag;
  if(!g.moved&&Math.hypot(e.clientX-g.cx,e.clientY-g.cy)<4)return;
  g.moved=true;
  const o=g.orig,dx=p.x-g.sx,dy=p.y-g.sy,it={...o,p:o.p?[...o.p]:undefined};
  if(g.mode==='move'){
    const box=o.p?canvasArrowBox(o.p):o,nx=canvasClamp(box.x+dx,0,Math.max(0,CANVAS_W-box.w)),ny=Math.max(0,box.y+dy),mx=nx-box.x,my=ny-box.y;
    if(o.p){it.p=o.p.map((v,i)=>v+(i%2?my:mx));Object.assign(it,canvasArrowBox(it.p))}else{it.x=canvasRound(nx);it.y=canvasRound(ny)}
  }else if(o.type==='photo'){
    const ratio=o.w/o.h,w=canvasClamp(o.w+dx,CANVAS_PHOTO_MIN_W,CANVAS_W-o.x);it.w=canvasRound(w);it.h=canvasRound(w/ratio);
  }else if(o.type==='rect'){
    it.w=canvasRound(canvasClamp(o.w+dx,20,CANVAS_W-o.x));it.h=canvasRound(Math.max(20,o.h+dy));
  }else if(o.type==='text'){
    it.w=canvasRound(canvasClamp(o.w+dx,120,CANVAS_W-o.x));
    it.lines=canvasLayoutText(it.text,it.w-2*CANVAS_TEXT_PAD,canvasMeasure(it.size));it.h=canvasTextHeight(it.lines.length,it.size);
  }
  rt.store.items.set(it.id,it);
  canvasGrowFor(rt,(it.p?canvasArrowBox(it.p).y+canvasArrowBox(it.p).h:it.y+it.h));
  canvasUpdateItemEl(rt,it);canvasRenderOverlay(rt);
}
function canvasDragEnd(rt,e,p){
  const g=rt.drag;rt.drag=null;
  try{rt.sheet.releasePointerCapture(e.pointerId)}catch{}
  if(g.moved){
    const after={...rt.store.items.get(g.id)};
    canvasCommit(rt,[canvasChangeUpdate('i',g.orig,after)]);
    canvasSyncItems(rt);canvasRenderOverlay(rt);
    rt.lastTap=null;
  }else{
    // A tap, not a drag: two taps on a text box edit it (the mouse's double-click does the same).
    const now=performance.now(),it=canvasItem(rt,g.id);
    if(it?.type==='text'&&g.tap&&g.tap.id===it.id&&now-g.tap.t<400){rt.lastTap=null;canvasEditText(rt,it,false);return}
    rt.lastTap={id:g.id,t:now};
    canvasRenderOverlay(rt);
  }
}

// Pen and highlighter.
function canvasInkDown(rt,e,p){
  const tool=rt.tool,size=CANVAS_SIZES[tool][canvasPrefs().size],color=canvasColor(tool);
  rt.selected=null;canvasRenderOverlay(rt);
  const path=canvasInkPath({id:'live',color,tool});
  rt.ink.appendChild(path);
  rt.drawing={pointerId:e.pointerId,tool,color,size,sp:e.pointerType==='pen'?0:1,pts:[[canvasRound(p.x),canvasRound(p.y),canvasPressure(e)]],path,raf:0};
  canvasDrawLive(rt.drawing);
  rt.sheet.setPointerCapture(e.pointerId);e.preventDefault();
}
function canvasDrawLive(d){d.path.setAttribute('d',canvasOutlinePath(HoliooPerfectFreehand.getStroke(d.pts,{...canvasStrokeOptions(d),last:false})))}
function canvasInkEnd(rt,d){
  rt.drawing=null;cancelAnimationFrame(d.raf);
  try{rt.sheet.releasePointerCapture(d.pointerId)}catch{}
  const s={id:uid(),tool:d.tool,color:d.color,size:d.size,pts:d.pts,sp:d.sp,at:Date.now(),updatedAt:Date.now()};
  canvasGrowFor(rt,d.pts.at(-1)[1]);
  d.path.dataset.id=s.id;d.path.setAttribute('d',canvasStrokePathD(s));rt.inkEls.set(s.id,d.path);
  rt.store.strokes.set(s.id,s);
  canvasCommit(rt,[canvasChangeCreate('s',s)]);
  canvasAfterGesture(rt);
}

// Stroke eraser: a stroke touched is removed whole.
function canvasEraseAt(rt,p,e){
  const r=CANVAS_SIZES.eraser[canvasPrefs().size];
  canvasEraserCursor(rt,e);
  for(const s of rt.store.strokes.values()){
    if(s.deleted||!canvasStrokeHit(s,p.x,p.y,r))continue;
    rt.erasing.before.push(s);rt.store.strokes.set(s.id,{...s,deleted:true});
    const el=rt.inkEls.get(s.id);if(el){el.remove();rt.inkEls.delete(s.id)}
  }
}
function canvasEraseEnd(rt){
  const er=rt.erasing;rt.erasing=null;
  const c=rt.overlay.querySelector('.cv-eraser');if(c)c.style.display='none';
  if(!er?.before.length)return;
  canvasCommit(rt,er.before.map(s=>canvasChangeRemove('s',s)));
  canvasAfterGesture(rt);
}
function canvasEraserCursor(rt,e){
  let c=rt.overlay.querySelector('.cv-eraser');
  if(!c){c=document.createElement('div');c.className='cv-eraser';rt.overlay.appendChild(c)}
  const r=CANVAS_SIZES.eraser[canvasPrefs().size]*rt.scale,s=rt.sheet.getBoundingClientRect();
  Object.assign(c.style,{display:'block',width:`${r*2}px`,height:`${r*2}px`,left:`${e.clientX-s.left}px`,top:`${e.clientY-s.top}px`});
}

// Arrow and rectangle: drag; a preview while dragging.
function canvasShapeDown(rt,e,p){
  rt.selected=null;canvasRenderOverlay(rt);
  const el=document.createElementNS(CANVAS_SVG,'svg');el.setAttribute('class','cv-preview');el.setAttribute('width',CANVAS_W*rt.scale);el.setAttribute('height',rt.store.page.height*rt.scale);el.setAttribute('viewBox',`0 0 ${CANVAS_W} ${rt.store.page.height}`);
  const path=document.createElementNS(CANVAS_SVG,'path');
  const size=CANVAS_SIZES.shape[canvasPrefs().size],color=canvasColor('pen');
  for(const[k,v]of Object.entries({fill:'none',stroke:color,'stroke-width':size,'stroke-linecap':'round','stroke-linejoin':'round'}))path.setAttribute(k,v);
  el.appendChild(path);rt.overlay.appendChild(el);
  rt.shape={pointerId:e.pointerId,type:rt.tool,start:p,end:p,el,path,size,color};
  rt.sheet.setPointerCapture(e.pointerId);e.preventDefault();
}
const canvasShapeOf=sh=>sh.type==='arrow'?{p:[sh.start.x,sh.start.y,sh.end.x,sh.end.y]}:{x:Math.min(sh.start.x,sh.end.x),y:Math.min(sh.start.y,sh.end.y),w:Math.abs(sh.end.x-sh.start.x),h:Math.abs(sh.end.y-sh.start.y)};
function canvasShapeMove(rt,p){
  const sh=rt.shape;sh.end={x:canvasClamp(p.x,0,CANVAS_W),y:Math.max(0,p.y)};
  const g=canvasShapeOf(sh);
  sh.path.setAttribute('d',sh.type==='arrow'?canvasArrowPath(g.p,sh.size):canvasRectPath(g));
  canvasGrowFor(rt,sh.end.y);
}
function canvasShapeEnd(rt,p){
  const sh=rt.shape;rt.shape=null;sh.el.remove();
  try{rt.sheet.releasePointerCapture(sh.pointerId)}catch{}
  sh.end={x:canvasClamp(p.x,0,CANVAS_W),y:Math.max(0,p.y)};
  const g=canvasShapeOf(sh);
  if(Math.hypot(sh.end.x-sh.start.x,sh.end.y-sh.start.y)<12)return;     // a tap, not a drag
  const base={id:uid(),type:sh.type,z:canvasNextZ([...rt.store.items.values()]),color:sh.color,size:sh.size,updatedAt:Date.now()};
  const it=sh.type==='arrow'?{...base,...canvasArrowBox(g.p),p:g.p.map(v=>canvasRound(v))}:{...base,x:canvasRound(g.x),y:canvasRound(g.y),w:canvasRound(g.w),h:canvasRound(g.h)};
  rt.store.items.set(it.id,it);canvasCommit(rt,[canvasChangeCreate('i',it)]);
  canvasSyncItems(rt);canvasAfterGesture(rt);
}
// A remote change that arrived mid-gesture is drawn once the gesture is over.
function canvasAfterGesture(rt){
  if(!rt.stale||canvasBusy())return;
  rt.stale=false;canvasLayout(rt);canvasSyncItems(rt);canvasSyncInk(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);
}
// Another device changed this page (features/canvas-sync.js).
function canvasApplyRemote(rt,merged){
  rt.store=canvasStore(merged);rt.docStamp=merged.updatedAt;
  if(rt.selected&&!canvasItem(rt,rt.selected))rt.selected=null;
  if(rt.root?.isConnected&&!canvasBusy()){canvasLayout(rt);canvasSyncItems(rt);canvasSyncInk(rt);canvasRenderOverlay(rt);canvasRenderTray(rt);canvasRenderTools(rt)}
  else rt.stale=true;
  rt.dirty=true;rt.saveState='saving';clearTimeout(rt.saveTimer);rt.saveTimer=setTimeout(()=>canvasSave(rt),600);
  canvasRefreshTopBar();
}

// ── Photo tray ──
function canvasTrayIds(rt){
  const ids=[...rt.session.photoIds];
  for(const id of rt.arrivals)if(!ids.includes(id))ids.push(id);
  return ids;
}
function canvasRenderTray(rt,{flash=null}={}){
  if(!rt.tray||rt.trayDrag?.started)return;
  const ids=canvasTrayIds(rt),placed=new Set([...rt.store.items.values()].filter(i=>!i.deleted&&i.type==='photo').map(i=>i.photoId));
  const fresh=new Set(ids.filter(id=>!rt.store.known.has(id)&&!placed.has(id)));
  const open=canvasPrefs().tray!=='closed';
  rt.tray.className=`cv-tray ${open?'open':'closed'}`;
  if(!open){
    rt.tray.innerHTML=`<button class="cv-tray-fab" type="button" data-cv-tray-toggle aria-expanded="false" title="Afficher les photos de la séance" aria-label="Afficher les photos de la séance : ${plural(ids.length,'photo')}${fresh.size?`, ${fresh.size} nouvelle${fresh.size>1?'s':''}`:''}">${icon('images',{size:20})}<b>${ids.length}</b>${fresh.size?'<i class="cv-dot-new" aria-hidden="true"></i>':''}</button>`;
    return;
  }
  rt.tray.innerHTML=`<div class="cv-tray-panel">
    <header><strong>Photos</strong><span class="cv-tray-n">${ids.length}</span><button class="cv-tray-close" type="button" data-cv-tray-toggle aria-expanded="true" title="Réduire" aria-label="Réduire les photos">${icon('chevronLeft',{size:18})}</button></header>
    ${ids.length?`<ul class="cv-tray-list">${ids.map((id,i)=>`<li><button class="cv-thumb${placed.has(id)?' placed':''}${fresh.has(id)?' is-new':''}" type="button" data-photo-id="${id}" aria-label="Photo ${i+1}${fresh.has(id)?', nouvelle':''}${placed.has(id)?', déjà placée':''} : toucher pour placer sur la page, ou glisser"><img alt="" draggable="false"><span class="cv-skel"></span>${fresh.has(id)?'<span class="cv-badge new">Nouveau</span>':placed.has(id)?`<span class="cv-badge check" aria-hidden="true">${icon('check',{size:13,stroke:3})}</span>`:''}</button></li>`).join('')}</ul>
    <p class="cv-tray-hint">Touchez une photo pour la placer, ou glissez-la sur la page.</p>`
      :`<p class="cv-tray-empty">Aucune photo dans cette séance. Prenez-en avec le téléphone : elles arrivent ici.</p>`}
  </div>`;
  rt.tray.querySelectorAll('.cv-thumb').forEach(b=>{
    const id=b.dataset.photoId,img=b.querySelector('img');
    photoThumbUrl(id).then(url=>{if(url&&img.isConnected){img.src=url;b.classList.add('loaded')}}).catch(()=>{});
    if(id===flash){b.classList.add('flash');b.scrollIntoView({block:'nearest',behavior:'smooth'})}
  });
}
function canvasOnSignal(rt,sig,got){
  if(!rt.root?.isConnected||sig.kind!=='photo'||!sig.refId)return;
  if(sig.sessionId&&sig.sessionId!==rt.session.id){got?.then(ok=>{if(ok)showToast('Nouvelle photo du téléphone dans une autre séance')});return}
  rt.arrivals.add(sig.refId);
  canvasRenderTray(rt,{flash:sig.refId});
  got?.then(ok=>{
    if(!rt.root?.isConnected)return;
    if(!ok){showToast('Photo reçue, téléchargement impossible pour le moment');return}
    canvasRenderTray(rt,{flash:sig.refId});showToast('Nouvelle photo du téléphone');
  });
}
// Dragging a thumbnail onto the page (a tap places it in the middle of what is visible). A vertical swipe on touch
// scrolls the list instead.
function canvasTrayDown(rt,e){
  const b=e.target.closest('.cv-thumb');if(!b||(e.pointerType==='mouse'&&e.button!==0))return;
  rt.trayDrag={id:b.dataset.photoId,pointerId:e.pointerId,x:e.clientX,y:e.clientY,type:e.pointerType,started:false,ghost:null,t:performance.now()};
}
function canvasTrayMove(rt,e){
  const d=rt.trayDrag;if(!d||d.pointerId!==e.pointerId)return;
  if(!d.started){
    const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(Math.hypot(dx,dy)<8)return;
    if(d.type!=='mouse'&&Math.abs(dy)>Math.abs(dx)){rt.trayDrag=null;return}   // scrolling the list
    d.started=true;
    const src=rt.tray.querySelector(`.cv-thumb[data-photo-id="${CSS.escape(d.id)}"] img`),g=document.createElement('div');
    g.className='cv-ghost';g.innerHTML=`<img alt="" src="${src?.src||''}">`;document.body.appendChild(g);d.ghost=g;
    rt.tray.querySelector(`.cv-thumb[data-photo-id="${CSS.escape(d.id)}"]`)?.classList.add('dragging');
  }
  d.ghost.style.transform=`translate(${e.clientX-48}px,${e.clientY-36}px)`;
  const over=canvasOverPage(rt,e);
  d.ghost.classList.toggle('on-page',over);
  e.preventDefault();
}
const canvasOverPage=(rt,e)=>{
  const v=rt.viewport.getBoundingClientRect(),t=rt.tray.getBoundingClientRect();
  const inView=e.clientX>=v.left&&e.clientX<=v.right&&e.clientY>=v.top&&e.clientY<=v.bottom;
  return inView&&!(e.clientX>=t.left&&e.clientX<=t.right&&e.clientY>=t.top&&e.clientY<=t.bottom);
};
function canvasTrayUp(rt,e){
  const d=rt.trayDrag;if(!d||d.pointerId!==e.pointerId)return;
  if(d.started){
    if(canvasOverPage(rt,e))canvasPlacePhotoAt(rt,d.id,canvasPoint(rt,e));
  }else if(performance.now()-d.t<900)canvasPlacePhotoAt(rt,d.id,null);
  canvasTrayEnd(rt);
}
function canvasTrayEnd(rt){
  const d=rt.trayDrag;if(!d)return;
  d.ghost?.remove();rt.trayDrag=null;
  rt.tray?.querySelectorAll('.cv-thumb.dragging').forEach(b=>b.classList.remove('dragging'));
  canvasRenderTray(rt);
}
