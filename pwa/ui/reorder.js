'use strict';
// Touch uses cancelable touch events so native scrolling cannot cancel a lifted item.
// Mouse/pen uses pointer events. Fixed layout slots prevent feedback/jitter after a swap.
const reorderControls=new Set();
function destroyReorderables(){for(const control of [...reorderControls])control.destroy()}

function makeReorderable(host,{onChange,holdMs=320,itemSelector='[data-photo-id]',idAttribute='photoId'}={}){
  host._reorder?.destroy();
  let drag=null,frame=0,suppressUntil=0;
  const items=()=>[...host.children].filter(el=>el.matches(itemSelector));
  const visible=()=>items().filter(el=>!el.hidden);
  const ids=()=>items().map(el=>el.dataset[idAttribute]);
  const announce=document.createElement('span');announce.className='sr-only';announce.setAttribute('aria-live','polite');host.after(announce);
  const api={onChange,renumber:()=>renumber(),destroy};host._reorder=api;reorderControls.add(api);host.classList.add('reorder-grid');
  function renumber(){items().forEach((el,i)=>{
    const badge=el.querySelector('.num');if(badge)badge.textContent=String(i+1);
    const handle=el.querySelector('.reorder-handle');if(handle)handle.setAttribute('aria-label',`Déplacer l’élément ${i+1}. Utilisez les flèches du clavier ou faites glisser.`);
  })}
  for(const el of items()){
    const handle=document.createElement('button');handle.type='button';handle.className='reorder-handle';handle.dataset.reorderHandle='';
    handle.innerHTML='<span aria-hidden="true">⠿</span>';el.appendChild(handle);
  }
  renumber();
  function setVisibleOrder(ordered){
    // Filtered-out items retain their saved positions.
    let n=0;for(const el of items().map(el=>el.hidden?el:ordered[n++]))host.appendChild(el);
    renumber();
  }
  function commit(){api.onChange?.(ids())}
  function finish(cancel=false){
    if(!drag)return;
    const d=drag;drag=null;clearTimeout(d.timer);cancelAnimationFrame(frame);frame=0;
    document.removeEventListener('pointermove',pointerMove);document.removeEventListener('pointerup',pointerUp);document.removeEventListener('pointercancel',pointerCancel);
    document.removeEventListener('touchmove',touchMove);document.removeEventListener('touchend',touchEnd);document.removeEventListener('touchcancel',touchCancel);
    window.removeEventListener('blur',cancelDrag);window.removeEventListener('resize',cancelDrag);
    if(!d.active)return;
    if(cancel)for(const el of d.original)host.appendChild(el);
    d.ghost.remove();d.card.classList.remove('drag-placeholder');host.classList.remove('is-dragging');document.body.classList.remove('reorder-active');
    suppressUntil=Date.now()+450;renumber();
    if(!cancel&&ids().join()!==d.initial){commit();announce.textContent=`Position ${visible().indexOf(d.card)+1} enregistrée.`}
    else announce.textContent=cancel?'Déplacement annulé.':'';
  }
  const cancelDrag=()=>finish(true);
  function lift(){
    if(!drag||!host.isConnected)return finish(true);
    const d=drag,r=d.card.getBoundingClientRect();d.active=true;
    d.slots=visible().map(el=>{const b=el.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2,width:b.width,height:b.height}});
    d.scrollY=window.scrollY;d.scrollX=window.scrollX;d.index=visible().indexOf(d.card);
    d.width=r.width;d.height=r.height;
    const ghost=d.card.cloneNode(true);ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.classList.add('reorder-ghost');
    Object.assign(ghost.style,{width:`${r.width}px`,height:`${r.height}px`,left:'0',top:'0'});
    document.body.appendChild(ghost);d.ghost=ghost;d.card.classList.add('drag-placeholder');host.classList.add('is-dragging');document.body.classList.add('reorder-active');
    navigator.vibrate?.(15);announce.textContent='Élément saisi. Faites glisser, puis relâchez.';frame=requestAnimationFrame(tick);
  }
  function tick(){
    if(!drag?.active)return;
    const d=drag;if(!host.isConnected)return finish(true);
    d.ghost.style.transform=`translate3d(${d.x-d.offsetX}px,${d.y-d.offsetY}px,0) scale(1.035)`;
    // Continues even if the finger stops moving near an edge. Speed increases toward the edge.
    const edge=80,bottom=window.innerHeight-90;
    const speed=d.y<edge?-Math.ceil((edge-d.y)/edge*15):d.y>bottom?Math.ceil((d.y-bottom)/edge*15):0;
    if(speed)window.scrollBy(0,Math.max(-18,Math.min(18,speed)));
    const x=d.x-d.offsetX+d.width/2+(window.scrollX-d.scrollX),y=d.y-d.offsetY+d.height/2+(window.scrollY-d.scrollY);
    const distances=d.slots.map(s=>Math.hypot(x-s.x,y-s.y));let to=distances.indexOf(Math.min(...distances));
    // A deliberate crossing, not a one-pixel tie, is required to change slots.
    if(to!==d.index&&distances[to]+12<distances[d.index]){
      const ordered=visible();ordered.splice(d.index,1);ordered.splice(to,0,d.card);setVisibleOrder(ordered);d.index=to;
      const badge=d.ghost.querySelector('.num');if(badge)badge.textContent=String(items().indexOf(d.card)+1);
    }
    frame=requestAnimationFrame(tick);
  }
  function start(target,x,y,mode,id,immediate=false){
    if(drag)return;
    const card=target.closest(itemSelector);if(!card||card.parentElement!==host)return;
    const button=target.closest('button');if(button&&button!==card&&!button.matches('[data-reorder-handle]'))return;
    const r=card.getBoundingClientRect();drag={card,mode,id,x,y,startX:x,startY:y,offsetX:x-r.left,offsetY:y-r.top,initial:ids().join(),original:items(),active:false};
    if(mode==='touch'){
      document.addEventListener('touchmove',touchMove,{passive:false});document.addEventListener('touchend',touchEnd);document.addEventListener('touchcancel',touchCancel);
    }else{
      document.addEventListener('pointermove',pointerMove,{passive:false});document.addEventListener('pointerup',pointerUp);document.addEventListener('pointercancel',pointerCancel);
    }
    window.addEventListener('blur',cancelDrag);window.addEventListener('resize',cancelDrag);
    if(immediate)lift();else drag.timer=setTimeout(lift,holdMs);
  }
  function move(x,y,e){
    if(!drag)return;
    drag.x=x;drag.y=y;
    if(drag.active){if(e.cancelable)e.preventDefault();return}
    if(Math.hypot(x-drag.startX,y-drag.startY)>10){
      if(drag.mode==='touch')finish(true);else lift();
    }
  }
  function pointerDown(e){
    if(e.pointerType==='touch'||e.isPrimary===false||e.button!==0)return;
    start(e.target,e.clientX,e.clientY,'pointer',e.pointerId,!!e.target.closest('[data-reorder-handle]'));
    if(drag)e.preventDefault();
  }
  function pointerMove(e){if(drag?.id===e.pointerId)move(e.clientX,e.clientY,e)}
  function pointerUp(e){if(drag?.id===e.pointerId)finish()}
  function pointerCancel(e){if(drag?.id===e.pointerId)finish(true)}
  function touchStart(e){
    if(e.touches.length!==1){finish(true);return}
    const t=e.changedTouches[0],handle=!!e.target.closest('[data-reorder-handle]');
    start(e.target,t.clientX,t.clientY,'touch',t.identifier,handle);
    if(drag?.active&&e.cancelable)e.preventDefault();
  }
  function touchMove(e){
    if(e.touches.length!==1)return finish(true);
    const t=[...e.touches].find(t=>t.identifier===drag?.id);if(t)move(t.clientX,t.clientY,e);
  }
  function touchEnd(e){if([...e.changedTouches].some(t=>t.identifier===drag?.id))finish()}
  function touchCancel(){finish(true)}
  function click(e){if(Date.now()<suppressUntil||e.target.closest('[data-reorder-handle]')){e.preventDefault();e.stopImmediatePropagation()}}
  function keydown(e){
    if(e.key==='Escape'&&drag){e.preventDefault();finish(true);return}
    const handle=e.target.closest('[data-reorder-handle]');if(!handle)return;
    const delta={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key];if(!delta)return;
    e.preventDefault();e.stopPropagation();const card=handle.closest(itemSelector),ordered=visible(),from=ordered.indexOf(card),to=from+delta;
    if(to<0||to>=ordered.length)return;
    ordered.splice(from,1);ordered.splice(to,0,card);setVisibleOrder(ordered);handle.focus();commit();announce.textContent=`Position ${to+1} enregistrée.`;
  }
  function contextmenu(e){if(drag||e.target.closest(itemSelector))e.preventDefault()}
  function nativeDrag(e){e.preventDefault()}
  function destroy(){
    finish(true);host.removeEventListener('pointerdown',pointerDown);host.removeEventListener('touchstart',touchStart);host.removeEventListener('click',click,true);host.removeEventListener('keydown',keydown);host.removeEventListener('contextmenu',contextmenu);host.removeEventListener('dragstart',nativeDrag);
    host.querySelectorAll('.reorder-handle').forEach(el=>el.remove());announce.remove();reorderControls.delete(api);delete host._reorder;
  }
  host.addEventListener('pointerdown',pointerDown);host.addEventListener('touchstart',touchStart,{passive:false});host.addEventListener('click',click,true);host.addEventListener('keydown',keydown);host.addEventListener('contextmenu',contextmenu);host.addEventListener('dragstart',nativeDrag);
  return api;
}
