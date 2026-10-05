// Lecture rapide: the radial menu with up to 4 rings (ui/radial-menu.js), the courses → sections → sessions → PDFs tree
// (features/home/reading-logic.js) and the items built from it (features/home/quick-reading.js). Capture rapide is covered by
// radial-menu.test.mjs, which must keep passing unchanged.
// Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
// Every file runs in ONE context, like the browser's classic scripts (top-level const / function are shared).
const ctx=vm.createContext({module:{exports:{}},console,Date,Math,Number,Array,Object,Set,Map,JSON,Promise,String,Boolean,parseInt,parseFloat,isFinite});
const run=p=>vm.runInContext(read(p),ctx,{filename:p});
for(const f of ['../ui/radial-geometry.js','../ui/radial-menu.js','../features/camera/camera-i18n.js','../features/home/reading-logic.js','../ui/icons.js','../features/camera/quick-capture.js','../features/home/quick-reading.js'])run(f);
const get=name=>vm.runInContext(name,ctx);
const R=vm.runInContext('({RADIAL,radialRadius,radialFit,radialChildren,radialHit,radialHitN,radialFree,radialRun,radialMinStep,radialPoint})',ctx);
const {RADIAL,radialRadius,radialFit,radialChildren,radialHit,radialHitN,radialPoint}=R;
const deep={...RADIAL,rings:4};

const screens={
  'iPhone SE (320×568)':{w:320,h:568},
  'iPhone 8 (375×667)':{w:375,h:667},
  'iPhone 15 (390×844)':{w:390,h:844,top:47,bottom:34},
  'Pro Max (430×932)':{w:430,h:932,top:59,bottom:34},
  'iPad (768×1024)':{w:768,h:1024,top:24,bottom:20},
  'desktop (1280×800)':{w:1280,h:800},
  'phone landscape (844×390)':{w:844,h:390,bottom:21}
};
// Where the Lecture rapide page sits on Accueil: left of the "Révisions du jour" row, in the lower half; plus two other places.
const triggers={
  'Accueil row':vp=>({x:58,y:Math.round(vp.h*.72)}),
  'middle':vp=>({x:vp.w/2,y:vp.h/2}),
  'bottom center':vp=>({x:vp.w/2,y:vp.h-(vp.bottom||0)-70})
};
// Values built inside the vm context have another Array / Object prototype: compare their JSON.
const J=v=>JSON.parse(JSON.stringify(v));
const same=(a,b,msg)=>assert.deepEqual(J(a),J(b),msg);
const inside=(p,s,vp)=>p.x-s/2>=-.5&&p.x+s/2<=vp.w+.5&&p.y-s/2>=(vp.top||0)-.5&&p.y+s/2<=vp.h-(vp.bottom||0)+.5;

test('ring radii: one item plus a gap further out, ring 2 is the old r2',()=>{
  const fit=radialFit(3,{x:200,y:500},{w:390,h:844});
  assert.equal(radialRadius(fit,1),fit.r1);
  assert.equal(radialRadius(fit,2),fit.r2);
  assert.equal(radialRadius(fit,4)-radialRadius(fit,3),fit.size+RADIAL.ringGap);
});

for(const [name,vp] of Object.entries(screens))for(const [where,at] of Object.entries(triggers))test(`${name}, ${where}: a 4-ring menu fits (or loses outer rings) and every ring stays on screen`,()=>{
  const o=at(vp),fit=radialFit(5,o,vp,deep);
  assert.ok(fit.rings>=2&&fit.rings<=4,`rings ${fit.rings}`);
  fit.angles1.forEach(a=>assert.ok(inside(radialPoint(o,fit.r1,a),fit.size,vp),'ring 1 item off screen'));
  // Every ring the fit promises has room for at least a few children, around the item they open from.
  for(let k=2;k<=fit.rings;k++){
    const ch=radialChildren(4,fit.angles1[0],o,vp,fit,deep,k);
    assert.ok(ch.shown>=1,`ring ${k}: nothing fits`);
    ch.angles.forEach(a=>assert.ok(inside(radialPoint(o,radialRadius(fit,k),a),fit.size,vp),`ring ${k} item off screen`));
  }
});

test('on a normal phone all four rings fit from the Accueil row; a tiny window degrades instead of breaking',()=>{
  for(const n of ['iPhone 8 (375×667)','iPhone 15 (390×844)','Pro Max (430×932)','iPad (768×1024)','desktop (1280×800)']){
    const vp=screens[n];assert.equal(radialFit(5,triggers['Accueil row'](vp),vp,deep).rings,4,n);
  }
  const tiny=radialFit(5,{x:60,y:200},{w:320,h:568},deep);
  assert.ok(tiny.rings>=2);
});

test('the default fit is unchanged (two rings): Capture rapide does not see the deep option',()=>{
  const vp=screens['iPhone 15 (390×844)'],o={x:vp.w-78,y:300};
  const a=radialFit(5,o,vp),b=radialFit(5,o,vp,RADIAL);
  same(a,b);assert.equal(a.rings,2);
});

test('hit testing with four rings: an item is found on its own ring, by distance on the outermost',()=>{
  const vp=screens['iPhone 15 (390×844)'],o={x:58,y:610},fit=radialFit(4,o,vp,deep);
  const ch2=radialChildren(3,fit.angles1[0],o,vp,fit,deep,2),ch3=radialChildren(3,ch2.angles[0],o,vp,fit,deep,3),ch4=radialChildren(3,ch3.angles[0],o,vp,fit,deep,4);
  const levels=[{angles:fit.angles1,step:fit.step1},{angles:ch2.angles,step:ch2.step},{angles:ch3.angles,step:ch3.step},{angles:ch4.angles,step:ch4.step}];
  const act=[0,0,0,-1];
  const at=(k,i)=>radialPoint(o,radialRadius(fit,k),levels[k-1].angles[i]);
  same(radialHitN(at(4,1),o,fit,levels,act,deep,1),{ring:4,index:1});
  same(radialHitN(at(3,0),o,fit,levels,act,deep,1),{ring:3,index:0});
  same(radialHitN(at(2,0),o,fit,levels,act,deep,1),{ring:2,index:0});
  same(radialHitN(o,o,fit,levels,act,deep,1),{center:true});
  assert.equal(radialHitN({x:o.x+400,y:o.y-700},o,fit,levels,act,deep,1),null);
});

test('stacked menu: rings older than the previous one do not answer, the previous one still does (to switch its item)',()=>{
  const vp=screens['desktop (1280×800)'],o={x:300,y:500},fit=radialFit(4,o,vp,deep);
  const ch2=radialChildren(3,fit.angles1[0],o,vp,fit,deep,2),ch3=radialChildren(3,ch2.angles[0],o,vp,fit,deep,3);
  const levels=[{angles:fit.angles1,step:fit.step1},{angles:ch2.angles,step:ch2.step},{angles:ch3.angles,step:ch3.step}];
  const act=[0,0,-1],from=2;   // ring 3 is open: rings 2 (blurred) and 3 answer, ring 1 is hidden
  const onRing1=radialPoint(o,fit.r1,fit.angles1[0]);
  const h1=radialHitN(onRing1,o,fit,levels,act,deep,from);
  assert.ok(!h1||h1.ring>=2,'a hidden ring answered');
  const onRing2=radialPoint(o,radialRadius(fit,2),ch2.angles[0]);
  assert.equal(radialHitN(onRing2,o,fit,levels,act,deep,from).ring,2);
  // the same point with every ring visible is ring 1
  assert.equal(radialHitN(onRing1,o,fit,levels,act,deep,1).ring,1);
});

test('dragging over a neighbour of an open ring is tentative (the menu switches only if the finger rests there)',()=>{
  const vp=screens['desktop (1280×800)'],o={x:300,y:500},fit=radialFit(4,o,vp,deep);
  const ch2=radialChildren(3,fit.angles1[0],o,vp,fit,deep,2),ch3=radialChildren(3,ch2.angles[0],o,vp,fit,deep,3);
  const levels=[{angles:fit.angles1,step:fit.step1},{angles:ch2.angles,step:ch2.step},{angles:ch3.angles,step:ch3.step}];
  const h=radialHitN(radialPoint(o,radialRadius(fit,2),ch2.angles[1]),o,fit,levels,[0,0,-1],deep,1);
  same({ring:h.ring,index:h.index,tentative:h.tentative},{ring:2,index:1,tentative:true});
});

test('radialHit (two rings) is radialHitN with two levels, point for point',()=>{
  const vp=screens['iPhone 15 (390×844)'],o={x:vp.w-78,y:300},fit=radialFit(5,o,vp),ring2=radialChildren(3,fit.angles1[1],o,vp,fit);
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<400;i++){
    const p={x:rnd()*vp.w,y:rnd()*vp.h},a=radialHit(p,o,fit,ring2,1),b=radialHitN(p,o,fit,[{angles:fit.angles1,step:fit.step1},ring2],[1],RADIAL,1);
    same(a,b);
  }
});

// ── The tree ────────────────────────────────────────────────────────────────────────────────────────
const sess=(id,title)=>({id,title,photoIds:[],createdAt:'2026-10-01T10:00:00Z'});
const course=(id,name,sections)=>({id,name,color:'#506BFF',sections});
const sec=(id,name,sessions)=>({id,name,sessions});
const pdf=(id,title,sessionIds,day,extra={})=>({id,title,courseId:null,sessionIds,createdAt:`2026-10-${String(day).padStart(2,'0')}T09:00:00Z`,...extra});
const courses=()=>[
  course('c1','VHDL',[sec('s-cm','CM',[sess('cm1','CM 1')]),sec('s-td','TD',[sess('td1','TD 1'),sess('td2','TD 2')]),sec('s-tp','TP',[sess('tp1','TP 1')])]),
  course('c2','Chimie',[sec('s-cm2','CM',[sess('chcm1','CM 1')])]),
  course('c3','Vide',[sec('s-cm3','CM',[sess('vide1','CM 1')])])
];
const {readingTree}=vm.runInContext('({readingTree})',ctx);

test('the tree lists only what has a PDF: courses and sessions newest first, sections in their usual order',()=>{
  const t=readingTree(courses(),[pdf('a','A',['td1'],3),pdf('b','B',['td2'],9),pdf('c','C',['td2'],5),pdf('d','D',['chcm1'],12),pdf('e','E',['cm1'],1)]);
  same(t.courses.map(c=>c.course.name),['Chimie','VHDL'],'Vide has no PDF; Chimie has the newest');
  const v=t.courses[1];
  same(v.sections.map(s=>s.section.name),['CM','TD'],'usual order (the gesture stays the same from day to day); TP has no PDF');
  const td=v.sections[1];
  same(td.sessions.map(s=>s.session.title),['TD 2','TD 1']);
  same(td.sessions[0].pdfs.map(f=>f.id),['b','c'],'newest first');
});

test('a PDF made from several sessions appears under each; one with no session left is "loose"',()=>{
  const t=readingTree(courses(),[pdf('multi','M',['td1','td2'],4),pdf('imp','Imported',[],6),pdf('gone','Gone',['deleted-session'],7)]);
  const td=t.courses[0].sections.find(s=>s.section.name==='TD');
  same(td.sessions.map(s=>s.pdfs[0].id),['multi','multi']);
  same(t.loose.map(f=>f.id),['gone','imp']);
});

test('nothing to read: an empty tree',()=>{
  const t=readingTree(courses(),[]);assert.equal(t.courses.length,0);assert.equal(t.loose.length,0);
  assert.equal(readingTree(null,null).courses.length,0);
});

// ── The menu items ──────────────────────────────────────────────────────────────────────────────────
const setData=(cs,files)=>{ctx.state={courses:cs,files};vm.runInContext('esc=s=>String(s)',ctx)};
vm.runInContext('var esc=s=>String(s);var sectionColor=n=>n==="CM"?"#506BFF":n==="TD"?"#8C5CF5":"#FF9E42"',ctx);
const items=()=>get('quickReadingItems')();
const kids=it=>typeof it.children==='function'?it.children():(it.children||[]);

test('items: course → section → session → PDF; a session with ONE PDF is a leaf that opens it, several fan out',()=>{
  setData(courses(),[pdf('a','A',['td1'],3),pdf('b','B',['td2'],9),pdf('c','C',['td2'],5)]);
  const ring1=items();same(ring1.map(i=>i.label),['VHDL']);
  const sections=kids(ring1[0]);same(sections.map(i=>i.label),['TD']);
  const sessions=kids(sections[0]);same(sessions.map(i=>i.label),['TD 2','TD 1']);
  const [many,one]=sessions;
  assert.equal(one.children,undefined);assert.equal(one.pdfId,'a','one PDF: opens directly');
  assert.equal(many.pdfId,undefined);same(kids(many).map(i=>[i.kind,i.pdfId]),[['pdf','b'],['pdf','c']]);
  assert.ok(kids(many).every(i=>!i.children),'PDFs are leaves');
});

test('items: loose PDFs under "Autres" (a single one opens directly); more courses than a ring holds end with "•••"',()=>{
  setData(courses(),[pdf('l1','L1',[],2)]);
  let r=items();assert.equal(r.length,1);assert.equal(r[0].kind,'loose');assert.equal(r[0].pdfId,'l1');assert.equal(r[0].children,undefined);
  setData(courses(),[pdf('l1','L1',[],2),pdf('l2','L2',[],3)]);
  r=items();assert.equal(typeof r[0].children,'function');same(kids(r[0]).map(i=>i.pdfId),['l2','l1']);
  const many=Array.from({length:9},(_,i)=>course('k'+i,'Cours '+i,[sec('sk'+i,'CM',[sess('x'+i,'CM 1')])]));
  setData(many,many.map((c,i)=>pdf('f'+i,'F'+i,['x'+i],i+1)));
  r=items();assert.equal(r.length,RADIAL.maxItems);assert.equal(r.at(-1).more,true);assert.equal(r.at(-1).short,'•••');
});

test('items: nothing to read gives no ring (the menu then shows its "no PDF yet" bubble)',()=>{
  setData(courses(),[]);assert.equal(items().length,0);
});

test('what lifting does: a PDF (or a session with one) opens in the viewer and Retour comes back to Accueil; "•••" opens Fichiers',()=>{
  const calls=[];ctx.openPdfViewer=(id,from)=>calls.push(['pdf',id,from]);ctx.navigate=v=>calls.push(['nav',v]);ctx.closeQuickCaptureBubble=()=>{};
  const sel=get('quickReadingSelect');
  sel({kind:'pdf',pdfId:'p1'});sel({kind:'session',pdfId:'p2'});sel({more:true});
  same(calls,[['pdf','p1','home'],['pdf','p2','home'],['nav','files']]);
});

test('the title above the rings follows the path: "Chimie · TD · TD 2" and what lifting does',()=>{
  const d=get('quickReadingDescribe');
  assert.equal(d({mode:'gesture',center:true}).sub,'Relâchez ici pour annuler');
  assert.equal(d({mode:'gesture',item:null}).sub,'Glissez vers un cours');
  const course={label:'Chimie',kind:'course'},section={label:'TD',kind:'section'};
  same(d({mode:'gesture',item:section,path:[course]}),{title:'Chimie · TD',sub:'Glissez vers une séance'});
  assert.match(d({mode:'gesture',item:{label:'TD 1',kind:'session',pdfId:'p',pdfTitle:'Corrigé'},path:[course,section]}).sub,/Relâchez pour ouvrir « Corrigé »/);
  assert.match(d({mode:'gesture',item:{label:'TD 2',kind:'session',count:3},path:[course,section]}).sub,/3 PDF · Glissez vers un PDF/);
  assert.match(d({mode:'keys',item:{label:'Corrigé',kind:'pdf',pdfId:'p'},path:[course,section,{label:'TD 1'}]}).sub,/Entrée pour ouvrir/);
});

test('the menu is configured as stacked and four rings deep; so is Capture rapide (local rings); the item menu is not',()=>{
  const src=read('../features/home/quick-reading.js'),qc=read('../features/camera/quick-capture.js');
  assert.match(src,/maxDepth:4,stack:true/);
  assert.match(src,/local:true/);assert.match(qc,/stack:true,local:true/);
  assert.doesNotMatch(src+qc,/hub:true/);assert.match(src+qc,/minR1:76/);
  assert.doesNotMatch(read('../ui/item-menu.js'),/maxDepth|stack:/);
});
