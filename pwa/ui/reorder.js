'use strict';
// Press-and-hold to drag photos into a new order, iPhone style. Shared by every photo grid.
//
//   makeReorderable(host,{onChange(ids)})
//
// Items are the direct children of `host` that carry data-photo-id. Holding a photo lifts it
// (it grows slightly and follows the finger), the others make room, the .num badges renumber
// live, and onChange receives the final order on release. A quick tap still works as a tap,
// and a finger that moves before the hold completes scrolls the page as usual.

function makeReorderable(host,{onChange,holdMs=280,itemSelector='[data-photo-id]',idAttribute='photoId'}={}){
  if(host._reorder){host._reorder.onChange=onChange;return host._reorder}
  const api=host._reorder={onChange,renumber:()=>renumber()};
  host.classList.add('reorder-grid');
  let drag=null,suppressClick=false;
  const items=()=>[...host.children].filter(el=>el.dataset[idAttribute]);
  const renumber=()=>items().forEach((el,i)=>{
    const n=el.querySelector('.num');if(n)n.textContent=String(i+1);
    if(el===drag?.card){const g=drag.ghost?.querySelector('.num');if(g)g.textContent=String(i+1)} // the lifted photo shows where it will land
  });

  // Slide the other photos from their old position to the new one.
  const animateFrom=before=>items().forEach(el=>{
    const old=before.get(el);if(!old||el===drag?.card)return;
    const now=el.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;
    if(!dx&&!dy)return;
    el.style.transition='none';el.style.transform=`translate(${dx}px,${dy}px)`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.transition='';el.style.transform=''}));
  });

  const onMove=e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;
    if(!drag.active){if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8)stop();return}
    e.preventDefault();
    drag.ghost.style.left=`${e.clientX-drag.offsetX}px`;
    drag.ghost.style.top=`${e.clientY-drag.offsetY}px`;
    // Scroll the page when the photo is carried near the top or bottom edge.
    if(e.clientY<90)window.scrollBy(0,-10);else if(e.clientY>innerHeight-150)window.scrollBy(0,10);

    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(itemSelector);
    if(!target||target===drag.card||target.parentElement!==host)return;
    const list=items(),from=list.indexOf(drag.card),to=list.indexOf(target);
    const before=new Map(list.map(el=>[el,el.getBoundingClientRect()]));
    host.insertBefore(drag.card,from<to?target.nextSibling:target);
    renumber();animateFrom(before);
    navigator.vibrate?.(5);
  };

  // While a photo is lifted, the page must not scroll (touch events are the only reliable way on iOS).
  const blockScroll=e=>{if(drag?.active)e.preventDefault()};

  const stop=()=>{
    if(!drag)return;
    clearTimeout(drag.timer);
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',stop);
    document.removeEventListener('pointercancel',stop);
    document.removeEventListener('touchmove',blockScroll);
    if(drag.active){
      drag.ghost.remove();
      drag.card.classList.remove('drag-placeholder');
      host.classList.remove('is-dragging');
      renumber();
      suppressClick=true;setTimeout(()=>suppressClick=false,60);
      const ids=items().map(el=>el.dataset[idAttribute]);
      if(ids.join()!==drag.initial)api.onChange?.(ids);
      navigator.vibrate?.(10);
    }
    drag=null;
  };

  const lift=()=>{
    if(!drag)return;
    drag.active=true;
    const r=drag.card.getBoundingClientRect(),ghost=drag.card.cloneNode(true);
    ghost.classList.add('reorder-ghost');
    Object.assign(ghost.style,{width:`${r.width}px`,height:`${r.height}px`,left:`${r.left}px`,top:`${r.top}px`});
    document.body.appendChild(ghost);
    drag.ghost=ghost;
    drag.card.classList.add('drag-placeholder');
    host.classList.add('is-dragging');
    navigator.vibrate?.(18);
  };

  host.addEventListener('pointerdown',e=>{
    const card=e.target.closest(itemSelector);
    if(!card||card.parentElement!==host||drag)return;
    const btn=e.target.closest('button');if(btn&&btn!==card)return; // action buttons on a photo stay tappable
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const r=card.getBoundingClientRect();
    drag={card,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,active:false,initial:items().map(el=>el.dataset[idAttribute]).join(),timer:setTimeout(lift,holdMs)};
    document.addEventListener('pointermove',onMove,{passive:false});
    document.addEventListener('pointerup',stop);
    document.addEventListener('pointercancel',stop);
    document.addEventListener('touchmove',blockScroll,{passive:false});
  });
  host.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation()}},true);
  host.addEventListener('contextmenu',e=>e.preventDefault());
  return api;
}
