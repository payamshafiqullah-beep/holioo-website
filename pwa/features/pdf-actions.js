'use strict';

async function blobToDataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}

async function generatePdfFile(course,sessionIds,opts){
  if(!window.jspdf){showToast('Le module PDF n’est pas disponible');return}
  showToast('Création du PDF…');
  try{
    const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'});let hasPage=false,pageNo=0;const entries=[];
    for(const section of course.sections)for(const q of section.sessions)if(sessionIds.includes(q.id))entries.push({section,session:q});
    const addPage=()=>{if(hasPage)doc.addPage();hasPage=true;pageNo++};
    if(opts.cover){addPage();doc.setFont('helvetica','bold');doc.setFontSize(26);doc.text(course.name,20,38);doc.setFontSize(17);doc.text(opts.title,20,54,{maxWidth:170});doc.setFont('helvetica','normal');doc.setFontSize(11);doc.text(state.profile.academicYear||'',20,70);doc.text([state.profile.university,state.profile.program,state.profile.level,state.profile.semester].filter(Boolean).join(' • '),20,80,{maxWidth:170})}
    if(opts.toc){addPage();doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('Table des matières',20,28);doc.setFont('helvetica','normal');doc.setFontSize(11);let y=45;for(const e of entries){doc.text(`${e.section.name} — ${e.session.title}`,20,y,{maxWidth:165});y+=9;if(y>270){addPage();y=25}}}
    // Photo pages: image on top, its number centered right under it, caption in the footer.
    let photoNo=0;
    for(const e of entries){for(let i=0;i<e.session.photoIds.length;i++){
      const p=await DB.get('photos',e.session.photoIds[i]);if(!p?.blob)continue;
      addPage();photoNo++;
      const data=await blobToDataURL(p.blob),props=doc.getImageProperties(data),ratio=Math.min(178/props.width,245/props.height),w=props.width*ratio,h=props.height*ratio;
      doc.addImage(data,props.fileType||'JPEG',(210-w)/2,14,w,h,undefined,'FAST');
      if(opts.numbers){doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(40);doc.text(String(photoNo),105,Math.min(14+h+9,278),{align:'center'})}
      doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);doc.text(`${course.name} • ${e.section.name} • ${e.session.title}`,105,289,{align:'center',maxWidth:180});doc.setTextColor(0);
    }}
    if(!hasPage)addPage();
    const blob=doc.output('blob'),id=uid(),fileName=`${Drive.safeName(opts.title)}.pdf`;
    await DB.put('files',{id,blob,createdAt:now(),syncState:'pending'});
    state.files.unshift({id,title:opts.title,fileName,courseId:course.id,sessionIds,createdAt:now(),pages:pageNo});
    saveState();queueSync();showToast('PDF créé');
    openPdfViewer(id,'files');
  }catch(e){console.error(e);showToast('Erreur pendant la création du PDF')}
}