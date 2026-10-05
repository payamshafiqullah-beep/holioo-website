// Notes on a tablet or computer (window ≥ 768 px, ui/desk-shell.js): one free page per séance, OneNote-style.
// Second toolbar: select, pen, highlighter, stroke eraser, text box | 4 colours | 3 sizes |
// background | stylus only | add space. Undo / redo and "Enregistrement… / Enregistré" are in the top bar (the spacer
// of ui/desk-shell.js). A floating, collapsible tray on the left holds the séance's photos: drag one onto the page
// (a tap places it in the middle of what is visible); new ones carry a badge, placed ones a check mark.
// The ink is a layer above the photos. Pointer events: pen pressure; with "stylus only" the finger scrolls.
//
// Document model, history, merge: features/notes/canvas-doc.js. Storage / Drive / other devices: features/notes/canvas-sync.js.
// PDF: features/notes/canvas-export.js (drawn by features/notes/canvas-render.js). Phones never get here (they keep the Carnet).

let canvasRuntime=null;      // the page being edited; it survives a redraw of the screen, so nothing in progress is lost
let canvasCleanup=null;      // called by app.js before the screen is drawn again
const canvasHistories=new Map();   // séance id → undo / redo, kept while the app is open (as the Carnet's)
const CANVAS_PEN_HOLD=800;         // ms after the last pen event during which a touch is a resting palm
const CANVAS_MIN_STEP=.8;          // page units between two points of a stroke
const CANVAS_SVG='http://www.w3.org/2000/svg';
const CANVAS_TOOL_UI={
  hand:['hand','Main : faire défiler la page sans écrire ni déplacer'],select:['pointer','Sélection : déplacer, redimensionner'],pen:['penLine','Stylo'],highlighter:['highlighter','Surligneur'],
  eraser:['eraser','Gomme : efface le trait entier ou seulement la partie touchée (voir le mode)'],text:['type','Zone de texte : touchez la page, double-cliquez pour modifier']
};
const CANVAS_COLOR_NAMES={pen:['Noir','Bleu','Rouge','Vert'],highlighter:['Jaune','Vert','Rose','Bleu']};
const canvasMeasureCtx=document.createElement('canvas').getContext('2d');
const canvasMeasure=size=>t=>{canvasMeasureCtx.font=canvasFontCss(size);return canvasMeasureCtx.measureText(t).width};

// Tool, colour and size are remembered on the device.
const canvasPrefs=()=>state.settings.canvasPrefs??={tool:'pen',ci:{pen:0,highlighter:0},size:1};
const canvasHoldSnapOn=()=>state.settings.canvasPrefs?.holdSnap!==false;                  // Forme auto en maintenant (default on): hold still ~1/2 s during a stroke -> the same shape correction
const CANVAS_HOLD_MS=500,CANVAS_HOLD_SLOP=4,CANVAS_SNAP_MS=180;   // stillness, movement that still counts as still (screen px), morph duration
const canvasSnapOn=()=>!!state.settings.canvasPrefs?.snap;                         // Formes auto: straighten lines, circles, polygons
const canvasEraseMode=()=>state.settings.canvasPrefs?.eraseMode==='partial'?'partial':'stroke';   // gomme: whole stroke / touched part only
const canvasStylusOnly=()=>state.settings.canvasPrefs?.stylusOnly??(navigator.maxTouchPoints>0);
const canvasPaletteKind=tool=>tool==='highlighter'?'highlighter':'pen';
const canvasColor=(tool=canvasRuntime?.tool)=>{const k=canvasPaletteKind(tool);return CANVAS_COLORS[k][canvasPrefs().ci[k]??0]};

// Called by the toolbar / pages / camera / presence.
const canvasSessionId=()=>canvasRuntime?.root?.isConnected?canvasRuntime.session.id:null;
const canvasBusy=()=>{const rt=canvasRuntime;return!!rt&&!!rt.root?.isConnected&&!!(rt.drawing||rt.drag||rt.editing||rt.erasing||rt.trayDrag||rt.exporting)};
function canvasCameraDestination(){const rt=canvasRuntime;return rt?{courseId:rt.course.id,sectionId:rt.section.id,sessionId:rt.session.id}:null}

// ── Which séance ──
// The one the course navigator has selected is the one the notes are saved in. With only a course or a type selected,
// today's séance of it, else the latest (the navigator then shows which one it is); none → the "create a séance" screen.
function canvasPickSession(){
  const sel=navResolve(state.courses,{courseId:currentCourseId,sectionId:currentSectionId,sessionId:currentSessionId});
  if(sel.session)return sel;
  const course=sel.course||galleryCourse();if(!course)return null;
  const q=navPickSession(course,sel.section);
  return q?{course,section:q.section,session:q.session}:null;
}
// Toolbar "Notes" (ui/desk-shell.js): the page of what is selected.
const deskNotes=()=>navigate('notes');

async function renderNotesCanvas(){
  if(!isDesk()){navigate('home');return}
  setChrome(false);
  const found=canvasPickSession();
  if(!found){canvasRenderEmpty();return}
  const{course,section,session}=found;
  currentCourseId=course.id;currentSectionId=section.id;currentSessionId=session.id;
  let rt=canvasRuntime;
  if(!rt||rt.session.id!==session.id){
    if(rt)await canvasSave(rt);
    rt=await canvasCreateRuntime(course,section,session);
  }else{rt.course=course;rt.section=section;rt.session=session}
  canvasRuntime=rt;
  canvasBuildDom(rt);
  rt.viewport.scrollTop=rt.scrollTop||0;      // a redraw (another device's change) never throws the reader back to the top
  canvasBind(rt);
  canvasCleanup=()=>canvasLeave(rt);
}
function canvasRenderEmpty(){
  const course=galleryCourse(),sel=course&&gallerySelection(),where=sel?.section?`${course.name} · ${sel.section.name}`:course?.name;
  app.innerHTML=`<section class="canvas-screen cv-empty">${EmptyState({iconName:'penLine',title:course?`Aucune séance dans ${where}`:'Aucun cours',text:course?'Les notes se rangent par séance : choisissez-en une dans la liste des cours, ou créez-en une.':'Ajoutez d’abord un cours dans la liste des cours.',action:course?ActionButton({label:'Créer une séance',id:'cvNewSession',iconName:'plus',full:false}):ActionButton({label:'Ajouter un cours',id:'cvNewCourse',iconName:'plus',full:false})})}</section>`;
  byId('cvNewCourse')?.addEventListener('click',navigatorAddCourse);
  byId('cvNewSession')?.addEventListener('click',()=>{
    const section=galleryCaptureSection(course,galleryFilter(),null);
    if(!section){showToast('Ce cours n’a pas de section');return}
    navigatorAddSession(course.id,section.id);
  });
}

async function canvasCreateRuntime(course,section,session){
  let doc=await canvasLoadStored(session.id);
  if(!doc){doc=emptyCanvasDoc(session.id);doc.known=[...session.photoIds]}   // photos already there are not "new"
  if(!canvasHistories.has(session.id))canvasHistories.set(session.id,canvasHistory());
  const rt={course,section,session,store:canvasStore(doc),hist:canvasHistories.get(session.id),docStamp:doc.updatedAt,
    tool:'hand',selected:null,editing:null,drawing:null,drag:null,erasing:null,trayDrag:null,
    touches:new Map(),pan:null,penUntil:0,lastTap:null,dirty:false,saveState:'saved',saveTimer:0,syncTimer:0,scale:1,
    itemEls:new Map(),inkEls:new Map(),urls:new Map(),arrivals:new Set(),guards:[],unsub:[],stale:false,exporting:false};
  return rt;
}
function canvasDiscardRuntime(){
  const rt=canvasRuntime;if(!rt)return;
  clearTimeout(rt.saveTimer);clearTimeout(rt.syncTimer);canvasRevokeUrls(rt);
  canvasHistories.delete(rt.session.id);canvasRuntime=null;
}
