'use strict';
// Notes page → PDF. Each A4 sheet of the page is drawn by features/canvas-render.js (photos, ink, text, shapes,
// as placed) and becomes one full-bleed page of the PDF, built with the same pdf-lib code as every other PDF
// (features/pdf-actions.js). The picture has a fixed size (200 dpi), so the PDF is the same on a tablet and a computer.
//   exportCanvasPdf()           the page on screen → a PDF in Fichiers, opened
//   canvasExportPages(session)  [{blob}] one JPEG per sheet, [] when the page is empty (the PDF builder adds them)

async function canvasExportPages(session){
  const doc=await canvasDocFor(session.id);
  if(!doc||canvasIsEmpty(doc))return[];
  const photos=await canvasLoadPhotos(doc);
  try{
    const out=[];
    for(let i=0;i<canvasPdfPageCount(doc);i++)out.push({blob:await canvasRenderSheet(doc,i,{photos})});
    return out;
  }finally{canvasFreePhotos(photos)}
}
const canvasSessionHasContent=async sessionId=>{const doc=await canvasDocFor(sessionId);return!!doc&&!canvasIsEmpty(doc)};

async function exportCanvasPdf(){
  const rt=canvasRuntime;if(!rt)return;
  if(rt.exporting)return;
  rt.exporting=true;
  try{
    await canvasSave(rt);
    if(canvasIsEmpty(canvasSerialize(rt.store))){showToast('La page est vide : rien à exporter');return}
    let lib;
    try{lib=await loadPdfLib()}catch{showToast(navigator.onLine?'Le module PDF n’est pas disponible':'Hors ligne : le module PDF sera disponible après une première utilisation en ligne');return}
    showToast('Création du PDF…');
    const{course,section,session}=rt,pages=await canvasExportPages(session);
    if(!pages.length){showToast('La page est vide : rien à exporter');return}
    const title=`${course.name} — ${session.title} — Notes`,who=state.profile.displayName&&state.profile.displayName!=='Étudiant'?state.profile.displayName:'';
    // Already JPEG: kept as it is (high quality), the sheet fills the A4 page.
    const encode=async blob=>{const b=await createImageBitmap(blob),r={bytes:await blob.arrayBuffer(),width:b.width,height:b.height};b.close?.();return r};
    const{bytes,total}=await buildPdfDocument(lib,{pages:pages.map(p=>({blob:p.blob,words:null,label:'',bleed:true})),title,subject:`${course.name} — ${section.name}`,keywords:[course.name,section.name,session.title,'Notes','Holioo'],author:who,pageSize:'a4',quality:'high',numbers:false,encode});
    const blob=new Blob([bytes],{type:'application/pdf'}),fid=uid();
    const fileName=pdfFileName({course:course.name,sections:[section.name],sessions:[session]}).replace(/\.pdf$/,'_Notes.pdf');
    await DB.put('files',{id:fid,blob,createdAt:now(),syncState:'pending'});
    state.files.unshift({id:fid,title,fileName,courseId:course.id,sessionIds:[session.id],createdAt:now(),pages:total,searchable:false});
    saveState();queueSync();
    showToast(`PDF créé — ${plural(total,'page')}`);
    openPdfViewer(fid,'files');
  }catch(e){console.error(e);showToast('Erreur pendant la création du PDF')}
  finally{rt.exporting=false}
}
