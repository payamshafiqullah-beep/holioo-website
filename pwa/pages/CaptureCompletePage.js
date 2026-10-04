// Capture terminée — choisir quoi faire du lot.
async function renderCaptureComplete(){
  if(!currentBatch){navigate('home');return}
  const n=currentBatch.photoIds.length;
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Capture',actions:false})}
    <div class="success-hero">${IconBadge('checkCircle','mint','lg')}<p class="eyebrow">CAPTURE TERMINÉE</p><h1 class="hero-title">${plural(n,'photo capturée','photos capturées')}</h1><p class="lead">Que voulez-vous faire maintenant ?</p></div>
    <div class="thumbs" id="capturedThumbs"></div>
    <p class="reorder-hint">${icon('more',{size:14})}Maintenez une photo puis faites-la glisser pour changer l’ordre. Touchez la poignée pour la déplacer ou la supprimer.</p>
    <div class="button-stack">
      ${ActionButton({label:'Organiser maintenant',id:'organizeNow',iconName:'folder'})}
      ${ActionButton({label:'Diviser le lot',id:'splitNow',variant:'soft',iconName:'scissors'})}
      ${ActionButton({label:'Garder dans Captures',id:'saveInbox',variant:'ghost',iconName:'inbox'})}
    </div>
  </section>`;
  await fillThumbs('capturedThumbs',currentBatch.photoIds,{selectable:false,reorder:true});
  byId('backBtn').onclick=()=>saveBatchToInbox(currentBatch);   // Retour never loses the photos: they wait in Captures
  byId('organizeNow').onclick=()=>{currentBatch.selected=new Set(currentBatch.photoIds);navigate('organize')};
  byId('splitNow').onclick=()=>{currentBatch.selected=new Set(currentBatch.photoIds.slice(0,Math.ceil(n/2)));navigate('split')};
  byId('saveInbox').onclick=()=>saveBatchToInbox(currentBatch);
}
