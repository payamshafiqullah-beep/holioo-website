'use strict';
// PDF export with pdf-lib (loaded on first use, then kept offline by the service worker).
// - One page per photo, in the order chosen in the PDF builder; landscape photos get landscape pages.
// - Searchable: the text recognised on the device (features/ocr.js) is placed invisibly over
//   each photo, so the PDF can be searched and its text selected or copied.
// - Page size (A4 / Letter / image), quality (file size), cover, table of contents, footer
//   "Cours · Section · Séance — X / Y", document metadata, clear file name.
// Pure helpers at the end are tested in tests/pdf-export.test.mjs.

const PDFLIB_URL='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const PDF_QUALITY={high:{maxSide:3000,quality:.9},standard:{maxSide:2000,quality:.8},small:{maxSide:1400,quality:.62}};

let pdfLibPromise=null;
function loadPdfLib(){
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  pdfLibPromise??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=PDFLIB_URL;s.crossOrigin='anonymous';s.onload=()=>resolve(window.PDFLib);s.onerror=()=>{pdfLibPromise=null;s.remove();reject(new Error('pdf-lib indisponible'))};document.head.appendChild(s)});
  return pdfLibPromise;
}

// Builds the PDF bytes. `pages`: [{blob, words?, label}] in order; returns {bytes, total, withText}.
async function buildPdfDocument(lib,{pages,title,subject,keywords=[],author='',cover=null,toc=null,pageSize='a4',quality='standard',numbers=true,encode}){
  const{PDFDocument,StandardFonts,rgb,setTextRenderingMode,TextRenderingMode}=lib;
  const q=PDF_QUALITY[quality]||PDF_QUALITY.standard;
  const doc=await PDFDocument.create();
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const charset=new Set(font.getCharacterSet()),safe=t=>pdfSafeText(t,charset);
  const gray=rgb(.45,.47,.55),ink=rgb(.11,.13,.25),accent=rgb(.36,.4,.95);
  const photoPages=[];let withText=0;

  for(const p of pages){
    const{bytes,width:iw,height:ih}=await encode(p.blob,q,quality);
    const img=await doc.embedJpg(bytes);
    const[pw,ph]=pdfPageSize(pageSize,iw,ih),page=doc.addPage([pw,ph]);
    const box=pdfFit(iw,ih,{x:24,y:34,w:pw-48,h:ph-24-34});
    page.drawImage(img,box);
    // Invisible text over the photo (text rendering mode 3): searchable and selectable, not visible.
    if(p.words?.length){
      withText++;
      page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
      for(const[w,x0,y0,x1,y1] of p.words){
        const t=safe(w);if(!t.trim())continue;
        const at=pdfWordPlacement([x0,y0,x1,y1],box,font.widthOfTextAtSize(t,1));
        try{page.drawText(t,{x:at.x,y:at.y,size:at.size,font})}catch{}
      }
      page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));
    }
    photoPages.push({page,p});
  }

  // Table of contents (after the cover): headings, then entries with their first page.
  const front=cover?1:0,perToc=30,tocLines=toc||[];
  const tocPages=toc?Math.max(1,Math.ceil(tocLines.length/perToc)):0,offset=front+tocPages,total=photoPages.length+offset;
  const A4=[595.28,841.89];
  if(cover){
    const c=doc.insertPage(0,A4);
    c.drawRectangle({x:0,y:A4[1]-230,width:A4[0],height:230,color:accent});
    c.drawText(safe(cover.heading),{x:48,y:A4[1]-110,size:30,font:bold,color:rgb(1,1,1),maxWidth:500});
    c.drawText(safe(title),{x:48,y:A4[1]-150,size:16,font,color:rgb(1,1,1),maxWidth:500,lineHeight:20});
    cover.lines.filter(Boolean).forEach((l,i)=>c.drawText(safe(l),{x:48,y:A4[1]-290-i*22,size:12,font,color:ink,maxWidth:500}));
    c.drawText('Créé avec Holioo',{x:48,y:40,size:9,font,color:gray});
  }
  for(let t=0;t<tocPages;t++){
    const tp=doc.insertPage(front+t,A4);let y=A4[1]-70;
    if(t===0){tp.drawText('Table des matières',{x:48,y,size:22,font:bold,color:ink});y-=40}
    for(const l of tocLines.slice(t*perToc,(t+1)*perToc)){
      if(l.head){y-=6;tp.drawText(safe(l.head),{x:48,y,size:12,font:bold,color:accent});tp.drawLine({start:{x:48,y:y-5},end:{x:A4[0]-48,y:y-5},thickness:.6,color:rgb(.85,.86,.9)});y-=22;continue}
      const num=String(l.index+offset+1);
      tp.drawText(safe(l.title),{x:60,y,size:11,font,color:ink,maxWidth:400});
      tp.drawText(num,{x:A4[0]-48-font.widthOfTextAtSize(num,11),y,size:11,font,color:ink});
      y-=20;
    }
  }
  photoPages.forEach(({page,p},i)=>{
    const w=page.getWidth(),num=`${i+offset+1} / ${total}`;
    if(p.label)page.drawText(safe(p.label),{x:24,y:14,size:8,font,color:gray,maxWidth:w-120});
    if(numbers)page.drawText(num,{x:w-24-font.widthOfTextAtSize(num,8),y:14,size:8,font,color:gray});
  });

  doc.setTitle(safe(title));if(subject)doc.setSubject(safe(subject));if(keywords.length)doc.setKeywords(keywords.map(safe));
  if(author)doc.setAuthor(safe(author));
  doc.setCreator('Holioo');doc.setProducer('Holioo');doc.setCreationDate(new Date());doc.setModificationDate(new Date());
  try{doc.setLanguage('fr-FR')}catch{}
  return{bytes:await doc.save(),total,withText};
}

async function generatePdfFile(course,sessionIds,opts){
  let lib;
  try{lib=await loadPdfLib()}catch{showToast(navigator.onLine?'Le module PDF n’est pas disponible':'Hors ligne : le module PDF sera disponible après une première utilisation en ligne');return}
  showToast('Création du PDF…');
  try{
    const entries=[];
    for(const section of course.sections)for(const s of section.sessions)if(sessionIds.includes(s.id))entries.push({section,session:s});
    const photoContext=new Map(),defaultOrder=[];
    for(const e of entries)for(const id of e.session.photoIds){photoContext.set(id,e);defaultOrder.push(id)}
    const requested=Array.isArray(opts.photoOrder)?opts.photoOrder.filter(id=>photoContext.has(id)):[];
    const orderedIds=[...requested,...defaultOrder.filter(id=>!requested.includes(id))];

    // Handwritten notebook pages replace the plain photo (they have no text layer: the ink is drawn over the photo).
    const inkPages=new Map();
    for(const e of entries){
      try{inkPages.set(e.session.id,await notebookExportPages(e.session))}
      catch(err){console.warn(err);inkPages.set(e.session.id,[]);showToast('Notes manuscrites non incluses (erreur de rendu)')}
    }
    const pageLabel=e=>`${course.name} · ${e.section.name} · ${e.session.title}`;
    const pages=[];
    for(const id of orderedIds){
      const e=photoContext.get(id),row=await DB.get('photos',id);if(!e||!row?.blob)continue;
      const written=inkPages.get(e.session.id).find(c=>c.photoId===id);
      const o=!written&&opts.searchable!==false?await Ocr.get(id):null;
      pages.push({id,blob:written?written.blob:photoBlob(row),words:o?.words||null,label:pageLabel(e),e});
    }
    for(const e of entries)for(const c of inkPages.get(e.session.id))if(!c.photoId){
      const page={id:`ink:${c.blockId}`,blob:c.blob,words:null,label:pageLabel(e),e},at=pages.map(p=>p.e.session.id).lastIndexOf(e.session.id);
      at<0?pages.push(page):pages.splice(at+1,0,page);
    }
    if(!pages.length){showToast('Aucune photo à mettre dans le PDF');return}

    let toc=null;
    if(opts.toc){
      toc=[];let last=null;const seen=new Set();
      pages.forEach((p,i)=>{if(seen.has(p.e.session.id))return;seen.add(p.e.session.id);if(p.e.section!==last){toc.push({head:p.e.section.name});last=p.e.section}toc.push({title:p.e.session.title,index:i})});
    }
    const sectionsUsed=[...new Set(entries.map(e=>e.section.name))],who=state.profile.displayName&&state.profile.displayName!=='Étudiant'?state.profile.displayName:'';
    const cover=opts.cover?{heading:course.name,lines:[sectionsUsed.join(' · '),pdfDateRange(entries.map(e=>e.session.createdAt)),`${pages.length} page(s)`,[state.profile.university,state.profile.program,state.profile.level,state.profile.semester].filter(Boolean).join(' · '),state.profile.academicYear||'',who]}:null;

    // High quality keeps the JPEG as it is; otherwise it is re-encoded smaller in the image worker.
    const encode=async(blob,q,quality)=>{
      if(quality==='high'&&/jpe?g/.test(blob.type||'image/jpeg')){const b=await createImageBitmap(blob),r={bytes:await blob.arrayBuffer(),width:b.width,height:b.height};b.close?.();return r}
      const r=await imageJob('encode',{key:`pdf:${blob.size}:${q.maxSide}`,blob,maxSide:q.maxSide,quality:q.quality});
      return{bytes:await r.blob.arrayBuffer(),width:r.width,height:r.height};
    };
    const{bytes,total,withText}=await buildPdfDocument(window.PDFLib,{pages,title:opts.title,subject:`${course.name} — ${sectionsUsed.join(', ')}`,
      keywords:[course.name,...sectionsUsed,...entries.map(e=>e.session.title),'Holioo'],author:who,cover,toc,
      pageSize:opts.pageSize||'a4',quality:opts.quality||'standard',numbers:opts.numbers!==false,encode});

    const blob=new Blob([bytes],{type:'application/pdf'}),fid=uid();
    const fileName=pdfFileName({course:course.name,sections:sectionsUsed,sessions:entries.map(e=>e.session),title:opts.title});
    await DB.put('files',{id:fid,blob,createdAt:now(),syncState:'pending'});
    state.files.unshift({id:fid,title:opts.title,fileName,courseId:course.id,sessionIds,createdAt:now(),pages:total,searchable:withText>0});
    saveState();queueSync();
    showToast(withText?`PDF créé — texte recherchable sur ${withText} page(s)`:'PDF créé');
    openPdfViewer(fid,'files');
  }catch(e){console.error(e);showToast('Erreur pendant la création du PDF')}
}

// ---------- pure helpers (tests/pdf-export.test.mjs) ----------

// Page size in points. Landscape photos get landscape pages; "image" follows the photo's shape.
function pdfPageSize(size,iw,ih){
  if(size==='image'){const w=595.28;return[w,Math.max(300,Math.min(w*3,(w-48)*ih/iw+58))]}
  const[a,b]=size==='letter'?[612,792]:[595.28,841.89];
  return iw>ih?[b,a]:[a,b];
}
// Largest placement of an iw×ih image inside a box, centred.
function pdfFit(iw,ih,{x,y,w,h}){const k=Math.min(w/iw,h/ih),W=iw*k,H=ih*k;return{x:x+(w-W)/2,y:y+(h-H)/2,width:W,height:H}}
// A recognised word (bbox 0..1 from the image's top-left) → PDF text position (baseline) and size.
function pdfWordPlacement([x0,y0,x1,y1],box,widthAt1){
  const bw=(x1-x0)*box.width,bh=(y1-y0)*box.height;
  const size=Math.max(1,Math.min(bh*1.1,widthAt1>0?bw/widthAt1:bh));
  return{x:box.x+x0*box.width,y:box.y+box.height-y1*box.height+bh*.18,size};
}
// Standard PDF fonts only know Western characters: accents stay; other letters become their base
// letter or a close equivalent, or are dropped, so the text layer never breaks the export.
function pdfSafeText(t,charset){
  let out='';
  for(const ch of String(t??'')){
    if(!charset||charset.has(ch.codePointAt(0))){out+=ch;continue}
    const base=ch.normalize('NFD').replace(/[̀-ͯ]/g,'');
    out+=base&&[...base].every(b=>charset.has(b.codePointAt(0)))?base:({'’':"'",'‘':"'",'“':'"','”':'"','–':'-','—':'-','…':'...',' ':' ','≤':'<=','≥':'>='}[ch]||'');
  }
  return out;
}
function pdfDateRange(dates){
  const d=dates.filter(Boolean).map(x=>new Date(x)).filter(x=>!isNaN(x)).sort((a,b)=>a-b);if(!d.length)return'';
  const f=x=>x.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  return f(d[0])===f(d.at(-1))?f(d[0]):`${f(d[0])} – ${f(d.at(-1))}`;
}
// Cours_Section_AAAA-MM-JJ_Séance.pdf (several sessions: the document title instead of the session).
function pdfFileName({course,sections=[],sessions=[],title=''}){
  const clean=s=>String(s||'').normalize('NFC').replace(/[\\/:*?"<>|#%]/g,'-').replace(/\s+/g,' ').trim().replace(/ /g,'_');
  const first=sessions.map(s=>s.createdAt).filter(Boolean).sort()[0];
  const day=first?new Date(first):new Date(),date=isNaN(day)?'':day.toISOString().slice(0,10);
  const part=sessions.length===1?sessions[0].title:title;
  const sec=sections.length===1?sections[0]:sections.length?'Sections':'';
  return[clean(course),clean(sec),date,clean(part)].filter(Boolean).join('_').slice(0,120)+'.pdf';
}
if(typeof module!=='undefined')module.exports={buildPdfDocument,pdfPageSize,pdfFit,pdfWordPlacement,pdfSafeText,pdfFileName,pdfDateRange};
