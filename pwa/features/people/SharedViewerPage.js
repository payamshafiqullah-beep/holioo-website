// Viewer for a document shared with me: read-only. No share, download, publish or sync action is offered, and the file is
// kept in memory only (short-lived signed URL → blob), never stored on the device.
let currentSharedDoc=null,sharedViewerUrls=[];
function revokeSharedUrls(){sharedViewerUrls.forEach(u=>URL.revokeObjectURL(u));sharedViewerUrls=[]}
async function renderSharedViewer(){
  setChrome(true);revokeSharedUrls();
  const d=currentSharedDoc;
  const home=d?.back||'holiooShares';
  if(!d){navigate(home);return}
  app.innerHTML=`<div class="pdf-viewer shared-viewer">
    <header class="page-header"><div class="page-header-left"><button class="icon-btn" id="shBack" aria-label="Retour">${icon('chevronLeft',{size:22})}</button><span class="viewer-title"><strong>${esc(d.title)}</strong><small>${esc(shareMetaLine(d))}${d.own?'':' · lecture seule'}</small></span></div></header>
    <div class="pdf-frame-wrap"><div class="pdf-pages" id="shPages"><p class="pdf-loading">Chargement…</p></div></div></div>`;
  byId('shBack').onclick=()=>{revokeSharedUrls();goBack(home)};
  const host=byId('shPages');
  host.addEventListener('contextmenu',e=>e.preventDefault());
  try{
    const blobs=d.publicUrl?[await fetch(d.publicUrl).then(r=>{if(!r.ok)throw new Error('fetch');return r.blob()})]:await fetchSharedBlobs(d);
    if(currentView!=='sharedViewer'||!host.isConnected)return;
    if(d.kind==='pdf'){
      try{await renderPdfPages(blobs[0],host)}
      catch(e){console.warn(e);host.innerHTML='<p class="pdf-loading">Impossible d’afficher ce PDF.</p>'}
    }else{
      host.innerHTML='';
      blobs.forEach((b,i)=>{const u=URL.createObjectURL(b);sharedViewerUrls.push(u);const f=document.createElement('figure');f.className='pdf-page shared-photo';f.innerHTML=`<img src="${u}" alt="Photo ${i+1}" draggable="false"><figcaption>${i+1} / ${blobs.length}</figcaption>`;host.append(f)});
    }
  }catch(e){console.error(e);if(host.isConnected)host.innerHTML='<p class="pdf-loading">Ce document n’est plus disponible (l’accès a peut-être été retiré).</p>'}
}
