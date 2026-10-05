// Diviser le lot — répartir les photos entre deux lots.
async function renderSplit(){
  if(!currentBatch){navigate('home');return}
  const a=currentBatch.selected.size,b=currentBatch.photoIds.length-a;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Capture',actions:false})}
    ${PageIntro({eyebrow:'DIVISER LE LOT',title:'Diviser le lot',subtitle:'Touchez une photo pour la faire passer d’un lot à l’autre.'})}
    <div class="segmented"><span class="seg lot-a">Lot 1 · ${a}</span><span class="seg lot-b">Lot 2 · ${b}</span></div>
    <div class="thumbs" id="splitThumbs"></div>
    <div class="button-stack">
      ${ActionButton({label:'Organiser les deux lots',id:'confirmSplit',iconName:'folder',disabled:!a||!b})}
      ${ActionButton({label:'Mettre les deux lots dans Captures',id:'splitInbox',variant:'ghost',iconName:'inbox'})}
    </div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('captureComplete');
  await fillThumbs('splitThumbs',currentBatch.photoIds,{selectable:true,split:true});
  byId('confirmSplit').onclick=()=>{const first=[...currentBatch.selected],second=currentBatch.photoIds.filter(id=>!currentBatch.selected.has(id));if(!first.length||!second.length)return;currentBatch={...currentBatch,photoIds:first,selected:new Set(first),splitQueue:[{id:uid(),photoIds:second,selected:new Set(second),createdAt:currentBatch.createdAt,splitQueue:[]}]};navigate('organize')};
  byId('splitInbox').onclick=()=>{const first=[...currentBatch.selected],second=currentBatch.photoIds.filter(id=>!currentBatch.selected.has(id));removeFromInbox(currentBatch.photoIds);if(first.length)state.inbox.unshift({id:uid(),title:'Lot 1',photoIds:first,createdAt:currentBatch.createdAt});if(second.length)state.inbox.unshift({id:uid(),title:'Lot 2',photoIds:second,createdAt:currentBatch.createdAt});saveState();currentBatch=null;queueSync();navigate('inbox')};
}
