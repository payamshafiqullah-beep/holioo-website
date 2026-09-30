'use strict';
// PhotoEditor — the one photo editor of the app (crop, straighten, perspective, filters).
//
//   openPhotoEditor({ids, index, fromEl, onSaved(changedIds)})
//
// Full-screen and dark. The photo is shown from a downscaled proxy and transformed with the
// GPU at 60fps; the real pixels are rendered off the main thread only on "Terminé"
// (features/photo-edits.js). Edits never touch the original image.

const PE_FILTERS=[['original','Original'],['auto','Auto'],['gray','Gris'],['bw','N&B'],['lighten','Éclaircir'],['shadows','Ombres'],['board','Tableau'],['board-dark','Tableau noir']];
const PE_ASPECTS=[['free','Libre'],['original','Original'],['a4','A4'],['4:3','4:3'],['16:9','16:9'],['1:1','Carré']];
const PE_DRAFT_KEY='holioo_editor_draft';
let peOpen=null;

function haptic(el){navigator.vibrate?.(8);if(el){el.classList.remove('pe-pulse');void el.offsetWidth;el.classList.add('pe-pulse')}}
const peClone=e=>JSON.parse(JSON.stringify(e));

async function openPhotoEditor({ids,index=0,fromEl=null,onSaved=null}){
  if(peOpen||!ids?.length)return;
  const rows=await Promise.all(ids.map(id=>DB.get('photos',id)));
  const list=ids.filter((id,i)=>rows[i]?.blob);if(!list.length){showToast('Photo introuvable');return}
  const items=new Map(list.map(id=>{const r=rows[ids.indexOf(id)];const edit={...HoliooImage.defaultEdit(),...(r.edit||{})};return[id,{id,row:r,edit,saved:peClone(edit),history:[],future:[],proxy:null,display:null,oriented:null,filterThumbs:{}}]}));
  // Restore unsaved edits if the app was closed or killed while editing these photos.
  try{const draft=JSON.parse(localStorage.getItem(PE_DRAFT_KEY)||'null');if(draft?.edits){let n=0;for(const[id,e] of Object.entries(draft.edits))if(items.has(id)){items.get(id).edit=e;n++}if(n)setTimeout(()=>showToast('Modifications non enregistrées restaurées'),400)}}catch{}

  const ed=peOpen={items,ids:list,index:Math.max(0,Math.min(list.indexOf(ids[index])>=0?list.indexOf(ids[index]):index,list.length-1)),tool:'crop',view:null,gesture:null,showOriginal:false,quadView:'adjust',detected:null,onSaved};
  const root=document.createElement('div');root.className='pe';root.setAttribute('role','dialog');root.setAttribute('aria-label','Éditeur de photo');
  root.innerHTML=`
    <header class="pe-top">
      <button class="pe-text-btn" data-act="cancel">Annuler</button>
      <div class="pe-top-mid">
        <button class="pe-icon-btn" data-act="undo" aria-label="Annuler l’action">${icon('undo',{size:20})}</button>
        <span class="pe-counter"></span>
        <button class="pe-icon-btn" data-act="redo" aria-label="Rétablir">${icon('redo',{size:20})}</button>
      </div>
      <button class="pe-done" data-act="done">Terminé</button>
    </header>
    <div class="pe-body">
      <div class="pe-stage">
        <canvas class="pe-canvas"></canvas>
        <div class="pe-overlay"></div>
        <canvas class="pe-loupe" width="240" height="240" hidden></canvas>
        <div class="pe-busy" hidden><span></span><small></small></div>
        <div class="pe-hint" hidden></div>
      </div>
      <aside class="pe-side">
        <div class="pe-panel"></div>
        <nav class="pe-tools" role="tablist">
          <button data-tool="crop">${icon('crop',{size:20})}<small>Recadrer</small></button>
          <button data-tool="straighten">${icon('ruler',{size:20})}<small>Redresser</small></button>
          <button data-tool="auto">${icon('wand',{size:20})}<small>Auto</small></button>
          <button data-tool="filter">${icon('blend',{size:20})}<small>Filtres</small></button>
        </nav>
        <div class="pe-strip" ${list.length<2?'hidden':''}></div>
      </aside>
    </div>`;
  document.body.appendChild(root);document.body.classList.add('pe-lock');
  const $=s=>root.querySelector(s);
  const stage=$('.pe-stage'),canvas=$('.pe-canvas'),overlay=$('.pe-overlay'),loupe=$('.pe-loupe'),busy=$('.pe-busy');
  const cur=()=>items.get(list[ed.index]);

  // ---------- loading ----------
  async function loadItem(it){
    if(!it.proxy){
      const r=await imageJob('proxy',{key:`${it.id}:${it.row.blob.size}`,blob:it.row.blob,maxSide:1800});
      it.proxy={bitmap:r.bitmap,w:r.width,h:r.height};
    }
    refreshOriented(it);
    // The filtered preview arrives in the background: tools are usable right away.
    refreshDisplay(it);
  }
  function refreshOriented(it){
    it.oriented=HoliooImage.drawOriented(it.proxy.bitmap,it.edit.rot,it.edit.flip);
    it.ratio=it.oriented.height/it.oriented.width;
    if(it.edit.mode==='rect'&&!it.edit.box){
      it.edit.box=HoliooImage.boxForAspect(it.ratio,it.edit.aspect,it.edit.angle);
      // Filling in the default box is not a change: mirror it into the saved state.
      const{box:_a,...e}=it.edit,{box:_b,...sv}=it.saved;
      if(!it.saved.box&&JSON.stringify(e)===JSON.stringify(sv))it.saved.box={...it.edit.box};
    }
  }
  async function refreshDisplay(it){
    if(it.edit.filter==='original'){it.display=it.oriented;draw();return}
    it.display=it.display||it.oriented;draw();
    setBusy(true,'');
    const token=it.displayToken=Math.random();
    try{
      const r=await imageJob('preview',{key:`${it.id}:${it.row.blob.size}`,blob:it.row.blob,edit:{...it.edit,box:null,quad:null,mode:'rect',angle:0,aspect:'free'},maxSide:1800,crop:false});
      if(token===it.displayToken){it.display=r.bitmap;draw()}
    }catch(e){console.warn(e)}finally{if(token===it.displayToken)setBusy(false)}
  }
  function setBusy(on,text=''){busy.hidden=!on;busy.querySelector('small').textContent=text}

  // ---------- history ----------
  const dirty=it=>JSON.stringify(it.edit)!==JSON.stringify(it.saved);
  function commit(it=cur(),before){
    const b=before||it.lastCommitted||it.saved;
    if(JSON.stringify(b)===JSON.stringify(it.edit))return;
    it.history.push(peClone(b));it.future=[];it.lastCommitted=peClone(it.edit);
    saveDraft();updateChrome();
  }
  function applyEdit(it,edit){
    const geo=edit.rot!==it.edit.rot||edit.flip!==it.edit.flip,filt=edit.filter!==it.edit.filter;
    it.edit=peClone(edit);it.lastCommitted=peClone(edit);
    if(geo)refreshOriented(it);
    // A state without a crop box (reset, or undo back to a photo never cropped) means the whole photo.
    if(it.edit.mode==='rect'&&!it.edit.box)it.edit.box=HoliooImage.boxForAspect(it.ratio,it.edit.aspect,it.edit.angle);
    if(it.edit.mode==='quad'&&!it.edit.quad){it.edit.mode='rect';it.edit.box=HoliooImage.boxForAspect(it.ratio,it.edit.aspect,it.edit.angle)}
    if(geo||filt)refreshDisplay(it);else draw();
    fitView(false);saveDraft();updateChrome();renderPanel();
  }
  function saveDraft(){
    const edits={};for(const[id,it] of items)if(dirty(it))edits[id]=it.edit;
    try{Object.keys(edits).length?localStorage.setItem(PE_DRAFT_KEY,JSON.stringify({edits,at:Date.now()})):localStorage.removeItem(PE_DRAFT_KEY)}catch{}
  }

  // ---------- view: display frame (image centre = origin, straightened) → stage px ----------
  const stageSize=()=>({w:stage.clientWidth,h:stage.clientHeight});
  const margin=()=>Math.max(28,Math.min(48,stageSize().w*.07));
  function targetView(it){
    const{w,h}=stageSize(),m=margin();
    if(it.edit.mode==='quad'){const k=Math.min((w-2*m)/1,(h-2*m)/it.ratio);return{k,ox:w/2,oy:h/2}}
    const b=it.edit.box,k=Math.min((w-2*m)/b.w,(h-2*m)/b.h);
    return{k,ox:w/2-b.cx*k,oy:h/2-b.cy*k};
  }
  function fitView(animate=true){
    const it=cur();if(!it?.oriented)return;
    const to=targetView(it);
    if(!animate||!ed.view){ed.view=to;draw();return}
    const from={...ed.view},t0=performance.now(),dur=260;
    const step=t=>{const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);ed.view={k:from.k+(to.k-from.k)*e,ox:from.ox+(to.ox-from.ox)*e,oy:from.oy+(to.oy-from.oy)*e};draw();if(p<1&&!ed.gesture)ed.anim=requestAnimationFrame(step)};
    cancelAnimationFrame(ed.anim);ed.anim=requestAnimationFrame(step);
  }
  const toScreen=([dx,dy])=>[ed.view.ox+dx*ed.view.k,ed.view.oy+dy*ed.view.k];
  // Quad points are stored from the top-left; the display frame is centred.
  const quadToScreen=(it,[x,y])=>toScreen([x-.5,y-it.ratio/2]);
  const screenToQuad=(it,[sx,sy])=>[(sx-ed.view.ox)/ed.view.k+.5,(sy-ed.view.oy)/ed.view.k+it.ratio/2];

  // ---------- drawing ----------
  function draw(){
    const it=cur();if(!it?.oriented||!ed.view)return;
    const{w,h}=stageSize(),dpr=Math.min(2,devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
    const x=canvas.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,canvas.width,canvas.height);
    const quadPreview=it.edit.mode==='quad'&&ed.quadView==='preview'&&it.quadPreview&&!ed.showOriginal;
    if(quadPreview){
      const b=it.quadPreview,m=margin(),k=Math.min((w-2*m)/b.width,(h-2*m)/b.height);
      x.setTransform(dpr*k,0,0,dpr*k,dpr*(w-b.width*k)/2,dpr*(h-b.height*k)/2);x.drawImage(b,0,0);
    }else{
      const src=ed.showOriginal?it.oriented:it.display,angle=it.edit.mode==='rect'&&!ed.showOriginal?it.edit.angle:0;
      const view=ed.showOriginal?{k:Math.min((w-2*margin())/1,(h-2*margin())/it.ratio),ox:w/2,oy:h/2}:ed.view;
      x.setTransform(dpr,0,0,dpr,0,0);x.translate(view.ox,view.oy);x.rotate(angle*Math.PI/180);
      const s=view.k/src.width;x.scale(s,s);x.imageSmoothingQuality='high';x.drawImage(src,-src.width/2,-src.height/2);
    }
    drawOverlay(it,quadPreview);
  }

  function drawOverlay(it,quadPreview){
    if(ed.showOriginal||quadPreview||ed.tool==='filter'&&it.edit.mode==='quad'){overlay.innerHTML='';return}
    const{w,h}=stageSize();
    if(it.edit.mode==='quad'){
      const pts=it.edit.quad.map(p=>quadToScreen(it,p)),poly=pts.map(p=>p.join(',')).join(' ');
      const mids=pts.map((p,i)=>{const q=pts[(i+1)%4];return[(p[0]+q[0])/2,(p[1]+q[1])/2]});
      overlay.innerHTML=`<svg class="pe-quad-svg" width="${w}" height="${h}"><path fill-rule="evenodd" class="pe-dim-path" d="M0 0H${w}V${h}H0Z M${pts.map(p=>p.join(' ')).join(' L')}Z"/><polygon points="${poly}" class="pe-quad-line ${ed.glow?'glow':''}"/></svg>`+
        pts.map((p,i)=>`<span class="pe-qh" data-q="${i}" style="left:${p[0]}px;top:${p[1]}px"></span>`).join('')+
        mids.map((p,i)=>`<span class="pe-qm" data-m="${i}" style="left:${p[0]}px;top:${p[1]}px"></span>`).join('');
      return;
    }
    const b=it.edit.box,[l,t]=toScreen([b.cx-b.w/2,b.cy-b.h/2]),bw=b.w*ed.view.k,bh=b.h*ed.view.k;
    const dragging=!!ed.gesture;
    overlay.innerHTML=`
      <div class="pe-dim" style="left:0;top:0;width:${w}px;height:${Math.max(0,t)}px"></div>
      <div class="pe-dim" style="left:0;top:${t+bh}px;width:${w}px;height:${Math.max(0,h-t-bh)}px"></div>
      <div class="pe-dim" style="left:0;top:${t}px;width:${Math.max(0,l)}px;height:${bh}px"></div>
      <div class="pe-dim" style="left:${l+bw}px;top:${t}px;width:${Math.max(0,w-l-bw)}px;height:${bh}px"></div>
      <div class="pe-box ${dragging?'dragging':''}" style="left:${l}px;top:${t}px;width:${bw}px;height:${bh}px">
        <i class="pe-grid v1"></i><i class="pe-grid v2"></i><i class="pe-grid h1"></i><i class="pe-grid h2"></i>
        ${ed.tool==='crop'?['nw','ne','se','sw'].map(c=>`<span class="pe-corner ${c}" data-h="${c}"></span>`).join('')+['n','e','s','w'].map(c=>`<span class="pe-edge ${c}" data-h="${c}"></span>`).join(''):''}
      </div>`;
  }

  // ---------- constraints ----------
  const insideImage=(it,box,angle=it.edit.angle)=>HoliooImage.boxToQuad(box,angle,it.ratio).every(([x,y])=>x>-1e-6&&x<1+1e-6&&y>-1e-6&&y<it.ratio+1e-6);
  // Move from a known-good box toward a candidate as far as the image allows.
  function clampBox(it,good,cand){
    if(insideImage(it,cand))return cand;
    let lo=0,hi=1;const mix=t=>({cx:good.cx+(cand.cx-good.cx)*t,cy:good.cy+(cand.cy-good.cy)*t,w:good.w+(cand.w-good.w)*t,h:good.h+(cand.h-good.h)*t});
    for(let i=0;i<14;i++){const m=(lo+hi)/2;insideImage(it,mix(m))?lo=m:hi=m}
    return mix(lo);
  }
  // After a rotation change: shrink the box around its centre until it fits again.
  function shrinkToFit(it){
    let b=it.edit.box;if(insideImage(it,b))return;
    for(let i=0;i<40&&!insideImage(it,b);i++){b={cx:b.cx*.97,cy:b.cy*.97,w:b.w*.97,h:b.h*.97}}
    it.edit.box=b;
  }

  // ---------- gestures on the stage ----------
  const pointers=new Map();
  stage.addEventListener('pointerdown',e=>{
    const it=cur();if(!it?.oriented||!ed.view)return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const r=stage.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];
    cancelAnimationFrame(ed.anim);
    if(pointers.size===2&&it.edit.mode==='rect'){startPinch(it);return}
    if(pointers.size>1)return;
    const h=e.target.dataset.h,q=e.target.dataset.q,m=e.target.dataset.m;
    const before=peClone(it.edit);
    if(h!==undefined&&it.edit.mode==='rect')ed.gesture={type:'resize',h,start:p,box:{...it.edit.box},view:{...ed.view},before};
    else if(q!==undefined)ed.gesture={type:'corner',i:+q,start:p,quad:peClone(it.edit.quad),before};
    else if(m!==undefined)ed.gesture={type:'edge',i:+m,start:p,quad:peClone(it.edit.quad),before};
    else if(it.edit.mode==='rect'&&ed.tool!=='filter')ed.gesture={type:'pan',start:p,box:{...it.edit.box},view:{...ed.view},before,moved:false};
    else ed.gesture={type:'look',start:p,before,moved:false};
    // Press and hold (without moving) shows the original for comparison.
    ed.holdTimer=setTimeout(()=>{if(ed.gesture&&!ed.gesture.moved&&(ed.gesture.type==='pan'||ed.gesture.type==='look')){ed.showOriginal=true;stage.classList.add('pe-showing-original');showHint('Original');draw()}},450);
    draw();
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const it=cur(),g=ed.gesture;if(!g||!it)return;
    const r=stage.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];
    if(g.type==='pinch'){movePinch(it);return}
    const dx=p[0]-g.start[0],dy=p[1]-g.start[1];
    if(Math.hypot(dx,dy)>6){g.moved=true;clearTimeout(ed.holdTimer)}
    if(ed.showOriginal)return;
    if(g.type==='pan'){
      const k=g.view.k,cand={...g.box,cx:g.box.cx-dx/k,cy:g.box.cy-dy/k};
      it.edit.box=clampBox(it,g.box,cand);
      ed.view={k,ox:g.view.ox+(g.box.cx-it.edit.box.cx)*k,oy:g.view.oy+(g.box.cy-it.edit.box.cy)*k};
      draw();
    }else if(g.type==='resize')resizeBox(it,g,dx,dy,p);
    else if(g.type==='corner'||g.type==='edge')moveQuad(it,g,p);
  });
  const endPointer=e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.delete(e.pointerId);
    const it=cur(),g=ed.gesture;
    if(g?.type==='pinch'){if(pointers.size<2){ed.gesture=null;commit(it,g.before);fitView(true)}return}
    clearTimeout(ed.holdTimer);
    if(ed.showOriginal){ed.showOriginal=false;stage.classList.remove('pe-showing-original');hideHint();draw()}
    loupe.hidden=true;
    if(!g)return;
    ed.gesture=null;
    if(g.type==='resize'){commit(it,g.before);fitView(true)}
    else if(g.type==='pan'){commit(it,g.before);draw()}
    else if(g.type==='corner'||g.type==='edge'){commit(it,g.before);it.quadPreview=null;draw()}
    else draw();
  };
  stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',endPointer);
  stage.addEventListener('contextmenu',e=>e.preventDefault());

  function startPinch(it){
    clearTimeout(ed.holdTimer);
    const[a,b]=[...pointers.values()],r=stage.getBoundingClientRect();
    const mid=[(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top];
    ed.gesture={type:'pinch',dist:Math.hypot(a.x-b.x,a.y-b.y),mid,box:{...it.edit.box},view:{...ed.view},before:ed.gesture?.before||peClone(it.edit)};
  }
  // Zoom the photo under a fixed crop box (iOS Photos style): the box keeps its size on screen.
  function movePinch(it){
    const g=ed.gesture,[a,b]=[...pointers.values()];if(!a||!b)return;
    const r=stage.getBoundingClientRect(),mid=[(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top];
    let f=Math.hypot(a.x-b.x,a.y-b.y)/g.dist;
    const minW=.04;if(g.box.w/f<minW)f=g.box.w/minW;
    const k=g.view.k,U=[(g.mid[0]-g.view.ox)/k,(g.mid[1]-g.view.oy)/k];
    const cand={w:g.box.w/f,h:g.box.h/f,cx:U[0]+(g.box.cx-U[0])/f-(mid[0]-g.mid[0])/(k*f),cy:U[1]+(g.box.cy-U[1])/f-(mid[1]-g.mid[1])/(k*f)};
    it.edit.box=clampBox(it,g.box,cand);
    ed.view=targetView(it);draw();
  }

  function resizeBox(it,g,dx,dy,p){
    const k=g.view.k,b=g.box,du=dx/k,dv=dy/k,h=g.h;
    let L=b.cx-b.w/2,R=b.cx+b.w/2,T=b.cy-b.h/2,B=b.cy+b.h/2;
    if(h.includes('w'))L+=du;if(h.includes('e'))R+=du;if(h.includes('n'))T+=dv;if(h.includes('s'))B+=dv;
    const min=56/k;
    if(R-L<min){if(h.includes('w'))L=R-min;else R=L+min}
    if(B-T<min){if(h.includes('n'))T=B-min;else B=T+min}
    const r=HoliooImage.aspectRatio(it.edit.aspect,it.ratio);
    if(r){
      if(h.length===2){ // corner: follow the larger movement, keep the opposite corner still
        let w=R-L,hh=B-T;if(Math.abs(du)*r>Math.abs(dv))hh=w*r;else w=hh/r;
        if(h.includes('w'))L=R-w;else R=L+w;if(h.includes('n'))T=B-hh;else B=T+hh;
      }else if(h==='e'||h==='w'){const hh=(R-L)*r;T=b.cy-hh/2;B=b.cy+hh/2}
      else{const w=(B-T)/r;L=b.cx-w/2;R=b.cx+w/2}
    }
    // Snap box edges to the detected document edges.
    if(ed.detected&&!it.edit.angle){
      const dq=ed.detected.map(([x,y])=>[x-.5,y-it.ratio/2]),xs=dq.map(p=>p[0]),ys=dq.map(p=>p[1]),snap=10/k;
      const tryS=(v,targets)=>{for(const t of targets)if(Math.abs(v-t)<snap)return t;return v};
      const[nL,nR,nT,nB]=[tryS(L,[Math.min(...xs)]),tryS(R,[Math.max(...xs)]),tryS(T,[Math.min(...ys)]),tryS(B,[Math.max(...ys)])];
      const snapped=nL!==L||nR!==R||nT!==T||nB!==B;
      if(snapped&&!g.snapped)haptic(overlay.querySelector('.pe-box'));g.snapped=snapped;
      L=nL;R=nR;T=nT;B=nB;
    }
    const cand={cx:(L+R)/2,cy:(T+B)/2,w:R-L,h:B-T};
    it.edit.box=clampBox(it,b,cand);
    ed.view=g.view;draw();
    if(h.length===2)showLoupe(p);
  }

  function moveQuad(it,g,p){
    const q=peClone(g.quad),snapPx=16;
    let pt=screenToQuad(it,p);
    const snapTargets=[...(ed.detected||[]),[0,0],[1,0],[1,it.ratio],[0,it.ratio]];
    if(g.type==='corner'){
      let snapped=false;
      for(const t of snapTargets){const s=quadToScreen(it,t);if(Math.hypot(s[0]-p[0],s[1]-p[1])<snapPx){pt=[...t];snapped=true;break}}
      pt=[Math.max(0,Math.min(1,pt[0])),Math.max(0,Math.min(it.ratio,pt[1]))];
      if(snapped&&!g.snapped)haptic(overlay);g.snapped=snapped;
      q[g.i]=pt;showLoupe(p);
    }else{
      const a=g.i,b=(g.i+1)%4,d0=screenToQuad(it,g.start),dx=pt[0]-d0[0],dy=pt[1]-d0[1];
      for(const i of[a,b])q[i]=[Math.max(0,Math.min(1,g.quad[i][0]+dx)),Math.max(0,Math.min(it.ratio,g.quad[i][1]+dy))];
    }
    it.edit.quad=q;draw();
  }

  // Magnifier above the finger for precise corner placement.
  function showLoupe([x,y]){
    const size=120,z=2.4,dpr=canvas.width/stage.clientWidth,l=loupe.getContext('2d');
    loupe.hidden=false;
    loupe.style.left=`${Math.max(8,Math.min(stage.clientWidth-size-8,x-size/2))}px`;
    loupe.style.top=`${y-size-36<8?y+36:y-size-36}px`;
    l.clearRect(0,0,loupe.width,loupe.height);
    const src=size/z*dpr;
    l.drawImage(canvas,x*dpr-src/2,y*dpr-src/2,src,src,0,0,loupe.width,loupe.height);
    l.strokeStyle='rgba(255,255,255,.9)';l.lineWidth=2;
    l.beginPath();l.moveTo(loupe.width/2-14,loupe.height/2);l.lineTo(loupe.width/2+14,loupe.height/2);l.moveTo(loupe.width/2,loupe.height/2-14);l.lineTo(loupe.width/2,loupe.height/2+14);l.stroke();
  }

  let hintTimer;
  function showHint(t){const h=$('.pe-hint');h.textContent=t;h.hidden=false;clearTimeout(hintTimer)}
  function hideHint(ms=0){clearTimeout(hintTimer);hintTimer=setTimeout(()=>$('.pe-hint').hidden=true,ms)}

  // ---------- tool panels ----------
  function renderPanel(){
    const it=cur(),panel=$('.pe-panel');if(!it)return;
    root.querySelectorAll('.pe-tools button').forEach(b=>b.classList.toggle('active',b.dataset.tool===ed.tool));
    if(ed.tool==='crop'){
      panel.innerHTML=`<div class="pe-chips">${PE_ASPECTS.map(([k,l])=>`<button class="pe-chip ${it.edit.mode==='rect'&&it.edit.aspect===k?'active':''}" data-aspect="${k}">${l}</button>`).join('')}</div>
        <div class="pe-row">
          <button class="pe-pill-btn" data-act="rotate">${icon('rotateCw',{size:18})}<span>90°</span></button>
          <button class="pe-pill-btn" data-act="flip">${icon('flip',{size:18})}<span>Miroir</span></button>
          ${it.edit.mode==='quad'?`<button class="pe-pill-btn" data-act="full">${icon('maximize',{size:18})}<span>Image entière</span></button><button class="pe-pill-btn" data-act="quadview">${icon(ed.quadView==='preview'?'scan':'maximize',{size:18})}<span>${ed.quadView==='preview'?'Ajuster les coins':'Aperçu'}</span></button>`:''}
          <button class="pe-pill-btn" data-act="reset">${icon('refresh',{size:18})}<span>Réinitialiser</span></button>
          ${list.length>1?`<button class="pe-pill-btn" data-act="aspect-all">${icon('layers',{size:18})}<span>Format pour toutes</span></button>`:''}
        </div>`;
    }else if(ed.tool==='straighten'){
      const a=it.edit.angle;
      panel.innerHTML=`<div class="pe-angle">${a===0?'0°':`${a>0?'+':'−'}${Math.abs(a).toFixed(1).replace('.',',')}°`}</div>
        <div class="pe-ruler ${it.edit.mode==='quad'?'disabled':''}"><div class="pe-ruler-track" style="transform:translateX(${-a*8}px)">${[-45,-30,-15,0,15,30,45].map(v=>`<span style="left:${(v+45)*8}px">${v}</span>`).join('')}</div><i class="pe-ruler-needle"></i></div>
        <div class="pe-row"><button class="pe-pill-btn" data-act="rotate">${icon('rotateCw',{size:18})}<span>90°</span></button><button class="pe-pill-btn" data-act="flip">${icon('flip',{size:18})}<span>Miroir</span></button>${it.edit.mode==='quad'?'<small class="pe-note">Le redressement s’applique au recadrage libre.</small>':''}</div>`;
      bindRuler(it);
    }else if(ed.tool==='filter'){
      panel.innerHTML=`<div class="pe-filters">${PE_FILTERS.map(([k,l])=>`<button class="pe-filter ${it.edit.filter===k?'active':''}" data-filter="${k}"><canvas width="112" height="112"></canvas><small>${l}</small></button>`).join('')}</div>
        ${list.length>1?`<div class="pe-row"><button class="pe-pill-btn" data-act="filter-all">${icon('layers',{size:18})}<span>Appliquer à toutes</span></button></div>`:''}`;
      paintFilterThumbs(it);
    }else if(ed.tool==='auto'){
      panel.innerHTML=`<div class="pe-auto"><p>Détection des bords du tableau ou de la feuille, puis correction de la perspective.</p>
        <div class="pe-row"><button class="pe-pill-btn primary" data-act="detect">${icon('wand',{size:18})}<span>${it.edit.mode==='quad'?'Détecter à nouveau':'Détecter les bords'}</span></button><button class="pe-pill-btn" data-act="manual">${icon('scan',{size:18})}<span>4 coins manuels</span></button><button class="pe-pill-btn" data-act="full">${icon('maximize',{size:18})}<span>Image entière</span></button></div>
        <div class="pe-progress" hidden><i></i></div></div>`;
    }
  }

  async function paintFilterThumbs(it){
    for(const[k] of PE_FILTERS){
      const c=root.querySelector(`[data-filter="${k}"] canvas`);if(!c)continue;
      let bmp=it.filterThumbs[k];
      if(!bmp){
        try{bmp=it.filterThumbs[k]=(await imageJob('preview',{key:`${it.id}:${it.row.blob.size}`,blob:it.row.blob,edit:{...it.edit,filter:k},maxSide:220,crop:true})).bitmap}catch{continue}
      }
      const cc=root.querySelector(`[data-filter="${k}"] canvas`);if(!cc)return;
      const x=cc.getContext('2d'),s=Math.max(cc.width/bmp.width,cc.height/bmp.height);
      x.drawImage(bmp,(cc.width-bmp.width*s)/2,(cc.height-bmp.height*s)/2,bmp.width*s,bmp.height*s);
    }
  }

  function bindRuler(it){
    const ruler=root.querySelector('.pe-ruler');if(!ruler||it.edit.mode==='quad')return;
    let start=null;
    ruler.onpointerdown=e=>{ruler.setPointerCapture(e.pointerId);start={x:e.clientX,a:it.edit.angle,before:peClone(it.edit)};ed.gesture={type:'ruler'};draw()};
    ruler.onpointermove=e=>{
      if(!start)return;
      let a=Math.max(-45,Math.min(45,start.a-(e.clientX-start.x)/8));
      if(Math.abs(a)<.6){if(it.edit.angle!==0)haptic(root.querySelector('.pe-angle'));a=0}
      it.edit.angle=Math.round(a*10)/10;shrinkToFit(it);fitView(false);
      root.querySelector('.pe-ruler-track').style.transform=`translateX(${-it.edit.angle*8}px)`;
      const a2=it.edit.angle;root.querySelector('.pe-angle').textContent=a2===0?'0°':`${a2>0?'+':'−'}${Math.abs(a2).toFixed(1).replace('.',',')}°`;
    };
    ruler.onpointerup=ruler.onpointercancel=()=>{if(!start)return;ed.gesture=null;commit(it,start.before);start=null;fitView(true)};
  }

  // ---------- actions ----------
  function setAspect(it,aspect){
    const before=peClone(it.edit);
    it.edit.mode='rect';it.edit.quad=null;it.edit.aspect=aspect;
    it.edit.box=HoliooImage.boxForAspect(it.ratio,aspect,it.edit.angle);
    it.quadPreview=null;commit(it,before);fitView(true);renderPanel();
  }
  function rotate90(it){
    const before=peClone(it.edit);
    it.edit.rot=(it.edit.rot+1)%4;
    if(it.edit.mode==='quad'&&it.edit.quad){const r=it.ratio;it.edit.quad=HoliooImage.orderQuad(it.edit.quad.map(([x,y])=>[1-y/r,x/r]))}
    refreshOriented(it);
    if(it.edit.mode==='rect')it.edit.box=HoliooImage.boxForAspect(it.ratio,it.edit.aspect,it.edit.angle);
    it.quadPreview=null;it.filterThumbs={};refreshDisplay(it);commit(it,before);fitView(true);renderPanel();
  }
  function flip(it){
    const before=peClone(it.edit);
    it.edit.flip=!it.edit.flip;it.edit.angle=-it.edit.angle;
    if(it.edit.box)it.edit.box={...it.edit.box,cx:-it.edit.box.cx};
    if(it.edit.quad)it.edit.quad=HoliooImage.orderQuad(it.edit.quad.map(([x,y])=>[1-x,y]));
    refreshOriented(it);it.quadPreview=null;it.filterThumbs={};refreshDisplay(it);commit(it,before);fitView(false);renderPanel();
  }
  async function setFilter(it,f){
    if(it.edit.filter===f)return;
    const before=peClone(it.edit);it.edit.filter=f;commit(it,before);
    it.quadPreview=null;renderPanel();await refreshDisplay(it);
  }
  function enterQuad(it,quad,view){
    const before=peClone(it.edit);
    it.edit.mode='quad';it.edit.angle=0;it.edit.aspect='free';it.edit.box=null;
    it.edit.quad=quad||[[.08,.08*it.ratio],[.92,.08*it.ratio],[.92,.92*it.ratio],[.08,.92*it.ratio]];
    ed.quadView=view||'adjust';it.quadPreview=null;
    commit(it,before);fitView(true);renderPanel();
    if(ed.quadView==='preview')loadQuadPreview(it);
  }
  async function loadQuadPreview(it){
    setBusy(true,'');
    try{it.quadPreview=(await imageJob('preview',{key:`${it.id}:${it.row.blob.size}`,blob:it.row.blob,edit:it.edit,maxSide:1600,crop:true})).bitmap;draw()}
    catch(e){console.warn(e)}finally{setBusy(false)}
  }

  // "Auto": edges found by the scanner worker (OpenCV.js, downloaded once on first use and kept
  // offline). Offline before that, or on failure: 4 corners to place by hand, no error.
  async function autoDetect(it){
    const prog=root.querySelector('.pe-progress');
    const off=Scanner.subscribe(st=>{if(prog&&st.cvState==='loading'){prog.hidden=false;prog.querySelector('i').style.width=`${Math.round(st.cvProgress*100)}%`}});
    let quad=null;
    try{
      if(!(await Scanner.prepare()))throw new Error('unavailable');
      if(prog)prog.hidden=true;
      setBusy(true,'');
      const small=HoliooImage.scaleTo(it.oriented,640),c=document.createElement('canvas');c.width=small.width;c.height=small.height;
      const x=c.getContext('2d');x.drawImage(small,0,0);
      const r=await Scanner.detectImage(x.getImageData(0,0,c.width,c.height),'document');
      if(r?.quad)quad=ScanCore.toEditQuad(r.quad,c.width,c.height);
    }catch(e){
      console.warn('Auto detection unavailable',e);
      showToast(navigator.onLine?'Détection indisponible — ajustez les 4 coins':'Hors ligne — ajustez les 4 coins');
      enterQuad(it,it.edit.quad,'adjust');return;
    }finally{off();if(prog)prog.hidden=true;setBusy(false)}
    if(!quad){showToast('Bords non trouvés — ajustez les 4 coins');enterQuad(it,it.edit.quad,'adjust');return}
    ed.detected=quad;
    enterQuad(it,quad,'adjust');
    ed.glow=true;draw();haptic();
    await new Promise(r=>setTimeout(r,900));
    ed.glow=false;ed.quadView='preview';renderPanel();loadQuadPreview(it);
  }

  // ---------- switching photos, chrome ----------
  function renderStrip(){
    const strip=$('.pe-strip');if(strip.hidden)return;
    if(!strip.children.length){
      strip.innerHTML=list.map((id,i)=>`<button class="pe-thumb" data-i="${i}"><img alt="Photo ${i+1}"></button>`).join('');
      list.forEach(async(id,i)=>{const b=photoThumbBlob(items.get(id).row);if(b){const u=URL.createObjectURL(b);(ed.urls||(ed.urls=[])).push(u);strip.children[i].querySelector('img').src=u}});
    }
    [...strip.children].forEach((b,i)=>{b.classList.toggle('active',i===ed.index);b.classList.toggle('edited',dirty(items.get(list[i])))});
    strip.children[ed.index]?.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
  }
  function updateChrome(){
    const it=cur();
    $('.pe-counter').textContent=list.length>1?`${ed.index+1} / ${list.length}`:'';
    $('[data-act="undo"]').disabled=!it?.history.length;$('[data-act="redo"]').disabled=!it?.future.length;
    renderStrip();
  }
  async function show(i){
    ed.index=i;ed.detected=null;ed.quadView=cur().edit.mode==='quad'?'preview':'adjust';updateChrome();
    setBusy(true,'');await loadItem(cur());if(cur().edit.filter==='original')setBusy(false);
    ed.view=null;fitView(false);renderPanel();
    if(cur().edit.mode==='quad'&&ed.quadView==='preview')loadQuadPreview(cur());
  }

  async function done(){
    const changed=[...items.values()].filter(dirty);
    if(!changed.length){close();return}
    $('[data-act="done"]').disabled=true;
    for(let i=0;i<changed.length;i++){
      setBusy(true,changed.length>1?`Enregistrement ${i+1} / ${changed.length}`:'Enregistrement…');
      try{await savePhotoEdit(changed[i].id,changed[i].edit)}catch(e){console.error(e);showToast('Une photo n’a pas pu être enregistrée');$('[data-act="done"]').disabled=false;setBusy(false);return}
    }
    try{localStorage.removeItem(PE_DRAFT_KEY)}catch{}
    queueSync();close();
    ed.onSaved?.(changed.map(x=>x.id));
    showToast(changed.length>1?`${changed.length} photos modifiées`:'Photo modifiée');
  }
  function cancel(){
    if([...items.values()].some(dirty)){
      openSheet({title:'Abandonner les modifications ?',subtitle:'Les changements non enregistrés seront perdus.',confirmText:'Abandonner',confirmClass:'coral',secondaryText:'Continuer à modifier',onConfirm:()=>{try{localStorage.removeItem(PE_DRAFT_KEY)}catch{}close();return true}});
    }else close();
  }
  function close(){
    document.removeEventListener('visibilitychange',onHide);removeEventListener('resize',onResize);stageObserver?.disconnect();
    for(const u of ed.urls||[])URL.revokeObjectURL(u);
    root.classList.add('pe-closing');document.body.classList.remove('pe-lock');
    setTimeout(()=>root.remove(),220);peOpen=null;
  }
  const onHide=()=>{if(document.hidden)saveDraft()};
  const onResize=()=>{if(!ed.gesture)fitView(false)};
  document.addEventListener('visibilitychange',onHide);addEventListener('resize',onResize);
  // The stage also changes size when the tool panel below it grows or shrinks: redraw at the
  // new size, otherwise the canvas is stretched and the crop frame no longer matches the photo.
  const stageObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(onResize):null;stageObserver?.observe(stage);

  root.addEventListener('click',async e=>{
    const it=cur(),act=e.target.closest('[data-act]')?.dataset.act,tool=e.target.closest('[data-tool]')?.dataset.tool;
    if(tool){ed.tool=tool;renderPanel();draw();return}
    const asp=e.target.closest('[data-aspect]')?.dataset.aspect;if(asp){setAspect(it,asp);return}
    const flt=e.target.closest('[data-filter]')?.dataset.filter;if(flt){setFilter(it,flt);return}
    const th=e.target.closest('.pe-thumb');if(th){show(+th.dataset.i);return}
    switch(act){
      case'cancel':cancel();break;
      case'done':done();break;
      case'undo':if(it.history.length){it.future.push(peClone(it.edit));applyEdit(it,it.history.pop())}break;
      case'redo':if(it.future.length){it.history.push(peClone(it.edit));applyEdit(it,it.future.pop())}break;
      case'rotate':rotate90(it);break;
      case'flip':flip(it);break;
      case'reset':{const before=peClone(it.edit);applyEdit(it,HoliooImage.defaultEdit());it.edit.box=HoliooImage.boxForAspect(it.ratio,'free',0);commit(it,before);fitView(true);break}
      case'quadview':ed.quadView=ed.quadView==='preview'?'adjust':'preview';renderPanel();if(ed.quadView==='preview')loadQuadPreview(it);else{it.quadPreview=null;draw()}break;
      case'detect':autoDetect(it);break;
      case'manual':enterQuad(it,it.edit.quad,'adjust');break;
      case'full':enterQuad(it,[[0,0],[1,0],[1,it.ratio],[0,it.ratio]],'preview');break;
      case'filter-all':for(const x of items.values()){if(x===it)continue;x.edit={...x.edit,filter:it.edit.filter};x.filterThumbs={};x.display=null;x.quadPreview=null}saveDraft();updateChrome();showToast('Filtre appliqué à toutes les photos');break;
      case'aspect-all':for(const x of items.values()){if(x===it)continue;x.edit={...x.edit,mode:'rect',quad:null,aspect:it.edit.aspect,box:x.ratio?HoliooImage.boxForAspect(x.ratio,it.edit.aspect,x.edit.angle):null}}saveDraft();updateChrome();showToast('Format appliqué à toutes les photos');break;
    }
  });

  // ---------- open (hero animation from the thumbnail) ----------
  const from=fromEl?.getBoundingClientRect?.();
  root.classList.add('pe-entering');
  await show(ed.index);
  if(from&&from.width){
    // Shared-element feel: the stage grows out of the thumbnail that was tapped.
    const r=stage.getBoundingClientRect(),s=Math.max(from.width/r.width,from.height/r.height);
    stage.animate([{transformOrigin:'0 0',transform:`translate(${from.left-r.left}px,${from.top-r.top}px) scale(${s})`,opacity:.5,borderRadius:'16px'},{transformOrigin:'0 0',transform:'none',opacity:1,borderRadius:'0'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  requestAnimationFrame(()=>root.classList.remove('pe-entering'));
}
