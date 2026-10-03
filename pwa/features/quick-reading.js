'use strict';
// Lecture rapide: the same radial menu as Quick Capture (ui/radial-menu.js, same press-drag-lift gesture), for reading.
//   press and hold the paper page on Accueil → courses → sections → sessions → PDFs;
//   lift on a session with ONE PDF: it opens; with several: they fan out in a 4th ring ("•••" when there are more);
//   lift on a PDF: it opens in the normal PDF viewer (pages/PdfViewerPage.js), Retour comes back to Accueil.
// Here (and only here) the ring before the open one is blurred and the older ones are hidden (`stack` of the menu), so
// four rings stay readable on a phone. The tree is built by features/reading-logic.js.

const READING_PDF_COLOR='#E0457B';

function quickReadingItems(){
  const tree=readingTree(state.courses,state.files);
  const pdfItem=(f,course,session)=>({id:f.id,kind:'pdf',pdfId:f.id,label:f.title||'PDF',short:'PDF',html:icon('fileText',{size:22,stroke:2.1}),color:READING_PDF_COLOR,pages:f.pages,aria:camT('rdPdfAria',{title:f.title||'PDF'})});
  const sessionItem=(s,course)=>{
    const one=s.pdfs.length===1,color=sectionColor(s.section.name);
    const base={id:s.session.id,kind:'session',label:s.session.title,short:quickCaptureShort(s.session.title),color,count:s.pdfs.length};
    return one
      ?{...base,pdfId:s.pdfs[0].id,pdfTitle:s.pdfs[0].title||'PDF',aria:camT('rdSessionOneAria',{session:s.session.title})}
      :{...base,aria:camT('rdSessionManyAria',{session:s.session.title}),children:()=>s.pdfs.map(f=>pdfItem(f,course,s.session))};
  };
  const sectionItem=(sec,course)=>({id:sec.section.id,kind:'section',label:sec.section.name,short:quickCaptureShort(sec.section.name),color:sectionColor(sec.section.name),
    aria:camT('rdSectionAria',{course:course.name,section:sec.section.name}),children:()=>sec.sessions.map(s=>sessionItem(s,course))});
  const items=tree.courses.map(c=>({id:c.course.id,kind:'course',label:c.course.name,short:quickCaptureShort(c.course.name),color:c.course.color||'#5B67F1',
    aria:camT('rdCourseAria',{name:c.course.name}),children:()=>c.sections.map(sec=>sectionItem(sec,c.course))}));
  if(tree.loose.length){
    const one=tree.loose.length===1;
    items.push({id:'__loose',kind:'loose',label:camT('rdOther'),short:'PDF',color:'#8A8FA3',aria:camT('rdOther'),
      ...(one?{pdfId:tree.loose[0].id,pdfTitle:tree.loose[0].title||'PDF'}:{children:()=>tree.loose.map(f=>pdfItem(f))})});
  }
  // More courses than a ring holds: the most recent ones, then "•••".
  if(items.length>RADIAL.maxItems)return[...items.slice(0,RADIAL.maxItems-1),readingMoreItem()];
  return items;
}
const readingMoreItem=()=>({id:'more',more:true,label:camT('rdMoreAll'),short:'•••',color:'#8A8FA3',aria:camT('rdMoreAll')});

// The names above the rings: "Chimie · TD · TD 3" and what lifting does here.
function quickReadingDescribe({mode,item,center,path}){
  const keys=mode==='keys';
  if(center)return{title:camT('rdMenu'),sub:camT('qcCancel')};
  if(!item)return{title:camT('rdMenu'),sub:camT(keys?'rdKeyCourse':'rdDragCourse')};
  if(item.more)return{title:item.label,sub:camT('rdMoreHint')};
  const trail=[...(path||[]).map(p=>p.label),item.label].filter(Boolean).join(' · ');
  if(item.pdfId&&item.kind!=='pdf')return{title:trail,sub:camT(keys?'rdKeyOpen':'rdOpenPdf',{title:item.pdfTitle})};
  if(item.kind==='pdf')return{title:trail,sub:camT(keys?'rdKeyOpen':'rdOpenPdf',{title:item.label})};
  if(item.kind==='course'||item.kind==='loose')return{title:trail,sub:camT(item.kind==='loose'?'rdDragPdf':'rdDragSection')};
  if(item.kind==='section')return{title:trail,sub:camT('rdDragSession')};
  return{title:trail,sub:`${camT('rdPdfCount',{n:item.count||0})} · ${camT('rdDragPdf')}`};
}

// Chosen item → what opens. Called inside the gesture's own event (pointerup / Enter), like Quick Capture.
function quickReadingSelect(item){
  closeQuickCaptureBubble();
  if(item.more){navigate('files');return}
  if(item.pdfId){openPdfViewer(item.pdfId,'home');return}
  // A ring that could not be shown (a very small window): the newest PDF of the session, else the list.
  navigate('files');
}

function attachQuickReading(trigger){
  if(!trigger||trigger.dataset.quickReading)return null;
  trigger.dataset.quickReading='1';
  return createRadialMenu({
    trigger,
    items:quickReadingItems,
    maxDepth:4,stack:true,maxKids:READING_MAX_PDFS,
    overflowItem:readingMoreItem,
    describe:quickReadingDescribe,
    onSelect:item=>quickReadingSelect(item),
    onEmpty:()=>showQuickCaptureBubble('readEmpty',trigger),
    label:camT('rdMenu'),closeLabel:camT('rdClose'),centerHtml:icon('x',{size:26,stroke:2.4})
  });
}

// A page of paper with lines of text on it (not a circle). The row around it says how many PDFs there are.
function QuickReadingTrigger({id='readQuick'}={}){
  const n=state.files.length;
  const page=`<svg class="qr-page" viewBox="0 0 56 72" aria-hidden="true" focusable="false"><path class="qr-sheet" d="M4 2h33l15 15v51a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path class="qr-fold" d="M37 2v12a3 3 0 0 0 3 3h12"/><rect class="qr-line head" x="9" y="24" width="30" height="3.4" rx="1.7"/><rect class="qr-line" x="9" y="33" width="38" height="2.6" rx="1.3"/><rect class="qr-line" x="9" y="40" width="34" height="2.6" rx="1.3"/><rect class="qr-line" x="9" y="47" width="38" height="2.6" rx="1.3"/><rect class="qr-line" x="9" y="54" width="26" height="2.6" rx="1.3"/><rect class="qr-line" x="9" y="61" width="32" height="2.6" rx="1.3"/></svg>`;
  return`<div class="list-card static qr-row"><button type="button" class="qr-trigger" id="${id}" aria-label="${esc(camT('rdButton'))}">${page}<small>${esc(camT('rdTrigger'))}</small></button><span class="list-card-copy"><strong>${esc(n?camT('rdSummary',{n}):camT('rdSummaryNone'))}</strong><small>${esc(camT('rdHint'))}</small></span></div>`;
}
