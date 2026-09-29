// Créer un PDF — sélection de séances, ordre des photos et options de mise en page.
let pdfBuilderUrls=[];

function renderPdfBuilder(){
  for(const url of pdfBuilderUrls)URL.revokeObjectURL(url);
  pdfBuilderUrls=[];

  const ctx=findSessionContext();if(!ctx){navigate('files');return}
  const{course,session}=ctx;
  const allSessions=course.sections.flatMap(s=>s.sessions.map(q=>({section:s,session:q}))).filter(x=>x.session.photoIds.length);
  const photoContext=new Map();
  for(const entry of allSessions)for(const id of entry.session.photoIds)photoContext.set(id,entry);

  let photoOrder=[];
  let orderRenderToken=0;
  const toggle=(id,title,meta,checked=true)=>`<label class="toggle-card"><span class="list-card-copy"><strong>${title}</strong><small>${meta}</small></span><input type="checkbox" id="${id}" class="switch" ${checked?'checked':''}></label>`;

  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:course.name,actions:false})}
    ${PageIntro({eyebrow:'PDF',title:'Créer un PDF',subtitle:'Sélectionnez une ou plusieurs séances du même cours.'})}
    <div class="form-card">${Field({label:'Titre du document',id:'pdfTitle',value:`${course.name} — ${session.title}`})}</div>
    ${SectionTitle('Séances')}
    <div class="list-stack">${allSessions.map(({section,session:q})=>`<label class="check-card"><input type="checkbox" class="pdfSession" value="${q.id}" ${q.id===session.id?'checked':''}>${IconBadge('layers',sectionTone(section.name),'sm')}<span class="list-card-copy"><strong>${esc(q.title)}</strong><small>${esc(section.name)} · ${plural(q.photoIds.length,'photo')}</small></span><i class="check-mark">${icon('check',{size:16,stroke:2.6})}</i></label>`).join('')}</div>

    ${SectionTitle('Ordre des photos')}
    <p class="lead">Maintenez une photo, puis faites-la glisser à l’endroit souhaité. L’ordre affiché sera celui du PDF.</p>
    <div class="thumbs compact pdf-order-grid" id="pdfPhotoOrder" aria-label="Ordre des photos du PDF"></div>

    ${SectionTitle('Mise en page')}
    <div class="list-stack">
      ${toggle('pdfCover','Page de couverture','Page de titre sans photo, au début du PDF',false)}
      ${toggle('pdfToc','Table des matières','Liste des séances, sans photo',false)}
      ${toggle('pdfNumbers','Numéroter les photos','Numéro affiché sous chaque photo')}
    </div>
    ${ActionButton({label:'Générer le PDF',id:'generatePdf',iconName:'fileText'})}
  </section>`;

  const selectedSessionIds=()=>new Set([...document.querySelectorAll('.pdfSession:checked')].map(x=>x.value));

  const syncPhotoOrder=()=>{
    const selected=selectedSessionIds();
    const allowed=[];
    for(const {session:q} of allSessions)if(selected.has(q.id))allowed.push(...q.photoIds);
    const allowedSet=new Set(allowed);
    photoOrder=photoOrder.filter(id=>allowedSet.has(id));
    const existing=new Set(photoOrder);
    for(const id of allowed)if(!existing.has(id)){photoOrder.push(id);existing.add(id)}
    renderPhotoOrder();
  };

  const updateOrderNumbers=host=>{
    [...host.querySelectorAll('.pdf-order-thumb')].forEach((card,i)=>{
      const num=card.querySelector('.num');
      if(num)num.textContent=String(i+1);
      const img=card.querySelector('img');
      if(img)img.alt=`Photo ${i+1}`;
    });
  };

  const animateOrderShift=(host,before)=>{
    host.querySelectorAll('.pdf-order-thumb').forEach(card=>{
      const old=before.get(card.dataset.photoId);if(!old)return;
      const now=card.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;
      if(!dx&&!dy)return;
      card.style.transition='none';
      card.style.transform=`translate(${dx}px,${dy}px)`;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        card.style.transition='';
        card.style.transform='';
      }));
    });
  };

  const setupPhotoDrag=(host,card)=>{
    let drag=null;

    const clearPending=()=>{
      if(drag?.timer)clearTimeout(drag.timer);
      if(drag&&!drag.active)drag=null;
    };

    const finish=e=>{
      if(!drag||drag.pointerId!==e.pointerId)return;
      if(drag.timer)clearTimeout(drag.timer);
      if(!drag.active){drag=null;return}

      try{card.releasePointerCapture?.(e.pointerId)}catch{}
      drag.ghost.remove();
      card.classList.remove('drag-placeholder');
      host.classList.remove('is-dragging');

      photoOrder=[...host.querySelectorAll('.pdf-order-thumb')].map(el=>el.dataset.photoId);
      updateOrderNumbers(host);
      drag=null;
      navigator.vibrate?.(10);
    };

    card.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      if(drag)return;
      const rect=card.getBoundingClientRect();
      drag={
        pointerId:e.pointerId,
        startX:e.clientX,
        startY:e.clientY,
        offsetX:e.clientX-rect.left,
        offsetY:e.clientY-rect.top,
        active:false,
        ghost:null,
        timer:null
      };

      drag.timer=setTimeout(()=>{
        if(!drag)return;
        drag.active=true;
        const current=card.getBoundingClientRect();
        const ghost=card.cloneNode(true);
        ghost.classList.add('pdf-order-ghost');
        ghost.classList.remove('drag-placeholder');
        Object.assign(ghost.style,{
          width:`${current.width}px`,
          height:`${current.height}px`,
          left:`${drag.startX-drag.offsetX}px`,
          top:`${drag.startY-drag.offsetY}px`
        });
        document.body.appendChild(ghost);
        drag.ghost=ghost;
        card.classList.add('drag-placeholder');
        host.classList.add('is-dragging');
        card.setPointerCapture?.(e.pointerId);
        navigator.vibrate?.(18);
      },180);
    });

    card.addEventListener('pointermove',e=>{
      if(!drag||drag.pointerId!==e.pointerId)return;
      if(!drag.active){
        if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8)clearPending();
        return;
      }
      e.preventDefault();
      drag.ghost.style.left=`${e.clientX-drag.offsetX}px`;
      drag.ghost.style.top=`${e.clientY-drag.offsetY}px`;

      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.pdf-order-thumb');
      if(!target||target===card||target.parentElement!==host)return;

      const before=new Map([...host.querySelectorAll('.pdf-order-thumb')].map(el=>[el.dataset.photoId,el.getBoundingClientRect()]));
      const r=target.getBoundingClientRect();
      const horizontal=e.clientX<r.left+r.width/2;
      const vertical=e.clientY<r.top+r.height/2;
      const cards=[...host.querySelectorAll('.pdf-order-thumb')];
      const cardIndex=cards.indexOf(card),targetIndex=cards.indexOf(target);
      const insertBefore=targetIndex<cardIndex?(vertical||horizontal):!(vertical||horizontal);

      if(insertBefore)host.insertBefore(card,target);
      else host.insertBefore(card,target.nextSibling);

      updateOrderNumbers(host);
      animateOrderShift(host,before);
      navigator.vibrate?.(5);
    });

    card.addEventListener('pointerup',finish);
    card.addEventListener('pointercancel',finish);
    card.addEventListener('lostpointercapture',e=>{if(drag?.active)finish(e)});
  };

  const renderPhotoOrder=async()=>{
    const host=byId('pdfPhotoOrder');if(!host)return;
    const token=++orderRenderToken;
    for(const url of pdfBuilderUrls)URL.revokeObjectURL(url);
    pdfBuilderUrls=[];
    host.innerHTML='';

    for(let i=0;i<photoOrder.length;i++){
      const id=photoOrder[i],row=await DB.get('photos',id);
      if(token!==orderRenderToken)return;
      if(!row?.blob)continue;
      const url=URL.createObjectURL(row.blob);pdfBuilderUrls.push(url);
      const entry=photoContext.get(id);
      const card=document.createElement('div');
      card.className='thumb selected pdf-order-thumb';
      card.dataset.photoId=id;
      card.innerHTML=`<img src="${url}" alt="Photo ${i+1}" draggable="false"><span class="num">${i+1}</span><span class="pdf-order-hint" aria-hidden="true">${icon('more',{size:18})}</span>`;
      card.title=entry?`${entry.section.name} · ${entry.session.title}`:'';
      setupPhotoDrag(host,card);
      host.appendChild(card);
    }
  };

  byId('backBtn').onclick=()=>navigate('session');
  document.querySelectorAll('.pdfSession').forEach(cb=>cb.addEventListener('change',syncPhotoOrder));
  byId('generatePdf').onclick=async()=>{
    const ids=[...document.querySelectorAll('.pdfSession:checked')].map(x=>x.value);
    if(!ids.length){showToast('Sélectionnez au moins une séance');return}
    await generatePdfFile(course,ids,{
      title:byId('pdfTitle').value.trim()||course.name,
      cover:byId('pdfCover').checked,
      toc:byId('pdfToc').checked,
      numbers:byId('pdfNumbers').checked,
      photoOrder:[...photoOrder]
    })
  };

  syncPhotoOrder();
}
