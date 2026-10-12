'use strict';
// Holioo shared UI components.
// Every component is a small function that returns an HTML string, so any
// screen in pwa/features/ can be restyled by editing one place here.
// Components never touch app data; pages pass in what they want displayed.

const TONES=['lavender','sky','mint','peach','pink','yellow'];
const toneAt=i=>TONES[((i%TONES.length)+TONES.length)%TONES.length];

/* ---------- Course presentation helpers (read-only views of course data) ---------- */

// Ten distinct course icons, each with its own tone. New courses get one at creation (course.icon).
const COURSE_ICONS=[
  {iconName:'book',tone:'lavender'},{iconName:'cpu',tone:'sky'},{iconName:'calculator',tone:'mint'},{iconName:'languages',tone:'peach'},{iconName:'leaf',tone:'pink'},
  {iconName:'flask',tone:'yellow'},{iconName:'scale',tone:'lavender'},{iconName:'code',tone:'sky'},{iconName:'cap',tone:'mint'},{iconName:'atom',tone:'peach'}
];
// First icon not used by any of these courses; falls back to the least-used one if all ten are taken.
function nextCourseIcon(courses){
  const used=courses.map((c,i)=>courseVisual(c,i).iconName);
  const free=COURSE_ICONS.find(o=>!used.includes(o.iconName));
  if(free)return free.iconName;
  return COURSE_ICONS.map(o=>o.iconName).sort((a,b)=>used.filter(x=>x===a).length-used.filter(x=>x===b).length)[0];
}

function courseVisual(course,index=0){
  const n=(course?.name||'').toLowerCase();
  const pick=(iconName,tone)=>({iconName,tone});
  const chosen=COURSE_ICONS.find(o=>o.iconName===course?.icon);
  if(chosen)return{...chosen};
  if(/math|stat|alg[eè]bre|analyse|calcul/.test(n))return pick('calculator','sky');
  if(/vhdl|[ée]lectron|info|num[ée]rique|syst[eè]me|signal|r[ée]seau/.test(n))return pick(/info|code|prog/.test(n)?'code':'cpu','lavender');
  if(/fran[cç]ais|grammaire|vocab|langue|anglais|espagnol|lecture|compr[ée]hension/.test(n))return pick('languages','peach');
  if(/bio|svt|vivant|[ée]colog/.test(n))return pick('leaf','mint');
  if(/droit|juridique|[ée]co|gestion/.test(n))return pick('scale','pink');
  if(/chimie|physique|m[ée]ca/.test(n))return pick('flask','yellow');
  return pick(['book','cpu','calculator','languages','leaf','flask'][index%6],toneAt(index));
}

function courseStats(course){
  const sections=course.sections||[];
  const sessions=sections.flatMap(s=>s.sessions||[]);
  const photos=sessions.reduce((a,q)=>a+(q.photoIds?.length||0),0);
  const filled=sections.filter(s=>(s.sessions||[]).length).length;
  const pct=sections.length?Math.round(filled/sections.length*100):0;
  const last=sessions.reduce((a,q)=>!a||new Date(q.createdAt)>new Date(a)?q.createdAt:a,null);
  const idleDays=last?(Date.now()-new Date(last))/864e5:Infinity;
  const status=course.done?'done':(sessions.length&&idleDays>14)?'review':'active';
  return{sections:sections.length,sessions:sessions.length,photos,filled,pct,last,status};
}

function latestSession(){
  let best=null;
  for(const course of state.courses)for(const section of course.sections)for(const session of section.sessions)
    if(!best||new Date(session.createdAt)>new Date(best.session.createdAt))best={course,section,session};
  return best;
}

function plural(n,word,many=`${word}s`){return`${n} ${n>1?many:word}`}

/* ---------- Primitives ---------- */

function IconBadge(name,tone='lavender',size='md'){return`<span class="icon-badge ${size} tone-${tone}">${icon(name,{size:size==='lg'?26:size==='sm'?18:22})}</span>`}

function Tag(text,tone='neutral'){return`<span class="tag tone-${tone}">${esc(text)}</span>`}

function ProgressBar(pct,tone='accent'){const v=Math.max(0,Math.min(100,Math.round(pct||0)));return`<span class="progress tone-${tone}" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><i style="width:${v}%"></i></span>`}

function ActionButton({label,id='',variant='primary',iconName='',full=true,attrs='',disabled=false}){
  return`<button class="action-btn ${variant}${full?' full':''}" ${id?`id="${id}"`:''} ${attrs} ${disabled?'disabled':''}>${iconName?icon(iconName,{size:20}):''}<span>${esc(label)}</span></button>`;
}

function AvatarButton(){
  const avatar=state.profile.avatarUrl
    ?`<img class="avatar-image" src="${esc(state.profile.avatarUrl)}" alt="">`
    :`<span class="avatar-initial">${esc(iconLetter(state.profile.displayName))}</span>`;
  return`<button class="avatar-btn" data-nav="profile" aria-label="Profil et synchronisation">${avatar}<i class="sync-dot" data-sync-dot></i></button>`;
}

function NotificationButton(){
  const count=state.inbox.reduce((a,b)=>a+b.photoIds.length,0);
  return`<button class="icon-btn" data-nav="inbox" aria-label="Captures à trier${count?` : ${count}`:''}">${icon('inbox',{size:21})}${count?`<b class="icon-btn-badge" data-inbox-badge>${count>99?'99+':count}</b>`:''}</button>`;
}

/* ---------- Page structure ---------- */

// Main tabs: logo or title on the left, notifications + avatar on the right.
// Sub-pages: pass back:true to get a round back button (id="backBtn").
// large:true puts the page title in the header row (iOS large-title style) instead of a separate block.
function PageHeader({title='',logo=false,back=false,actions=true,trailing='',large=false}={}){
  const left=`${back?`<button class="icon-btn" id="backBtn" aria-label="Retour">${icon('chevronLeft',{size:22})}</button>`:''}${logo?`<span class="wordmark" aria-label="Holioo">Holioo<i></i></span>`:title?(large?`<h1 class="page-header-large">${esc(title)}</h1>`:`<span class="page-header-title">${esc(title)}</span>`):''}`;
  const right=`${trailing}${actions?`${NotificationButton()}${AvatarButton()}`:''}`;
  return`<header class="page-header"><div class="page-header-left">${left}</div><div class="page-header-right">${right}</div></header>`;
}

function PageIntro({eyebrow='',title='',subtitle=''}={}){
  return`<div class="page-intro">${eyebrow?`<p class="eyebrow">${esc(eyebrow)}</p>`:''}${title?`<h1 class="hero-title">${esc(title)}</h1>`:''}${subtitle?`<p class="lead">${esc(subtitle)}</p>`:''}</div>`;
}

function SectionTitle(title,{action='',nav='',id='',count=null}={}){
  const btn=action?`<button class="link-btn" ${nav?`data-nav="${nav}"`:''} ${id?`id="${id}"`:''}>${esc(action)}</button>`:'';
  return`<div class="section-title-row"><h2 class="section-title">${esc(title)}${count!==null?` <span class="count">${count}</span>`:''}</h2>${btn}</div>`;
}

function SearchBar({id,placeholder}){
  return`<label class="search-bar">${icon('search',{size:20})}<input id="${id}" type="search" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search"></label>`;
}

function FilterChips(id,items,active){
  return`<div class="chips" id="${id}" role="tablist">${items.map(it=>`<button class="chip${it.value===active?' active':''}" data-chip="${esc(it.value)}" role="tab" aria-selected="${it.value===active}">${esc(it.label)}</button>`).join('')}</div>`;
}

function EmptyState({iconName='sparkles',title='',text='',action=''}={}){
  return`<div class="empty-state">${IconBadge(iconName,'lavender','lg')}${title?`<strong>${esc(title)}</strong>`:''}${text?`<p>${esc(text)}</p>`:''}${action}</div>`;
}

function Notice(text,tone='sky'){return`<div class="notice tone-${tone}">${text}</div>`}

function Field({label,id,value='',placeholder='',type='text'}){
  return`<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`;
}

/* ---------- Cards ---------- */

// `aside` replaces the illustration on the right (Accueil: the Quick Capture trigger).
function HeroCard({label,title,subtitle='',cta,ctaAttrs='',art='',aside=''}){
  return`<article class="hero-card"><div class="hero-card-copy"><span class="hero-label">${esc(label)}</span><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}<button class="hero-cta" ${ctaAttrs}>${esc(cta)}${icon('arrowRight',{size:18})}</button></div>${aside||`<div class="hero-art" aria-hidden="true">${art||HeroIllustration()}</div>`}</article>`;
}

function HeroIllustration(){
  return`<svg viewBox="0 0 140 130" fill="none"><rect x="30" y="18" width="78" height="96" rx="14" fill="#fff" opacity=".55" transform="rotate(-8 69 66)"/><rect x="36" y="16" width="78" height="96" rx="14" fill="#fff"/><rect x="48" y="34" width="44" height="7" rx="3.5" fill="#5B67F1"/><rect x="48" y="50" width="54" height="5" rx="2.5" fill="#E3E5F4"/><rect x="48" y="61" width="48" height="5" rx="2.5" fill="#E3E5F4"/><rect x="48" y="72" width="52" height="5" rx="2.5" fill="#E3E5F4"/><rect x="48" y="88" width="26" height="10" rx="5" fill="#E8FAF2"/><circle cx="112" cy="26" r="13" fill="#FF8A4C"/><path d="m106.5 26 3.8 3.8 7.2-7.6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFD66B"/></svg>`;
}

function CategoryCard({tone,iconName,title,meta,pct,attrs=''}){
  return`<button class="category-card tone-${tone}" ${attrs}>${IconBadge(iconName,tone,'md')}<strong>${esc(title)}</strong><small>${esc(meta)}</small>${ProgressBar(pct,tone)}</button>`;
}

function ListCard({iconName,tone='lavender',title,meta='',trailing='',attrs='',tag='',search='',kind=''}){
  const t=trailing===false?'':trailing||`<span class="chev">${icon('chevronRight',{size:20})}</span>`;
  return`<button class="list-card" ${attrs} ${search?`data-search="${esc(search.toLowerCase())}"`:''} ${kind?`data-kind="${esc(kind)}"`:''}>${IconBadge(iconName,tone,'md')}<span class="list-card-copy"><strong>${esc(title)}</strong>${meta?`<small>${esc(meta)}</small>`:''}</span>${tag}${t}</button>`;
}

// A list row with its own action menu button (two sibling buttons, never nested).
function FileCard({id,iconName='fileText',tone='pink',title,meta='',tag='',search='',kind=''}){
  return`<div class="list-card file-card" ${search?`data-search="${esc(search.toLowerCase())}"`:''} ${kind?`data-kind="${esc(kind)}"`:''}><button class="file-open" data-file-open="${id}">${IconBadge(iconName,tone,'md')}<span class="list-card-copy"><strong>${esc(title)}</strong>${meta?`<small>${esc(meta)}</small>`:''}</span>${tag}</button><button class="icon-btn flat" data-file-menu="${id}" aria-label="Actions pour ${esc(title)}">${icon('more',{size:20})}</button></div>`;
}

function StatCard({tone,iconName,value,label}){
  return`<div class="stat-card tone-${tone}">${IconBadge(iconName,tone,'sm')}<strong>${esc(String(value))}</strong><small>${esc(label)}</small></div>`;
}

function CourseCard(course,index,managed=false){
  const v=courseVisual(course,index),s=courseStats(course);
  const overview=course.sections.map(x=>`${x.name} ${x.sessions.length}`).join(' · ');
  const tags=course.sections.map(x=>Tag(x.name,sectionTone(x.name))).join('');
  const statusTag=s.status==='done'?Tag('Terminé','mint'):s.status==='review'?Tag('À revoir','peach'):'';
  return`<${managed?'div role="button" tabindex="0"':'button'} class="course-card${managed?' course-managed':''}" data-course="${course.id}" data-kind="${s.status}" data-search="${esc(course.name.toLowerCase())}">
    <span class="course-card-top">${IconBadge(v.iconName,v.tone,'lg')}<span class="course-card-copy"><strong>${esc(course.name)}</strong><small>${esc(overview)}</small></span>${statusTag}</span>
    <span class="course-card-progress">${ProgressBar(s.pct,v.tone)}<b>${s.filled}/${s.sections} sections</b></span>
    <span class="course-card-foot"><span class="tags">${tags}</span><small>${icon('clock',{size:14})}${s.last?`Dernière activité ${fmtShort(s.last)}`:'Aucune activité'}</small></span>
  </${managed?'div':'button'}>`;
}

function sectionTone(name){return name==='CM'?'lavender':name==='TD'?'sky':name==='TP'?'peach':name==='Projet'?'mint':'pink'}

/* ---------- Interaction helpers ---------- */

// Filters any element inside `scope` that has data-search / data-kind.
// Chips with data-chip="all" show everything.
function bindListFilter({searchId,chipsId,scope,onChange}){
  const root=typeof scope==='string'?document.querySelector(scope):scope;if(!root)return;
  let query='',kind=document.querySelector(`#${chipsId} .chip.active`)?.dataset.chip||'all';
  const apply=()=>{
    let shown=0;
    root.querySelectorAll('[data-search],[data-kind]').forEach(el=>{
      const okQ=!query||(el.dataset.search||'').includes(query);
      const kinds=(el.dataset.kind||'').split(' ');
      const okK=kind==='all'||!el.dataset.kind||kinds.includes(kind);
      el.hidden=!(okQ&&okK);if(!el.hidden)shown++;
    });
    root.querySelectorAll('[data-filter-group]').forEach(g=>{g.hidden=![...g.querySelectorAll('[data-search],[data-kind]')].some(el=>!el.hidden)});
    onChange?.({query,kind,shown});
  };
  if(searchId)byId(searchId)?.addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();apply()});
  if(chipsId)document.querySelectorAll(`#${chipsId} .chip`).forEach(c=>c.addEventListener('click',()=>{
    document.querySelectorAll(`#${chipsId} .chip`).forEach(x=>{x.classList.toggle('active',x===c);x.setAttribute('aria-selected',x===c)});
    kind=c.dataset.chip;apply();
  }));
  apply();
}

// Bottom sheet with a list of actions: [{label,iconName,tone,danger,onClick}]
function openActionSheet(title,actions,subtitle=''){
  mountSheet(`<div class="sheet" id="activeSheet"><div class="sheet-card"><div class="sheet-handle"></div><h2 class="sheet-title">${esc(title)}</h2>${subtitle?`<p class="sheet-sub">${esc(subtitle)}</p>`:''}<div class="sheet-list">${actions.map((a,i)=>`<button class="sheet-row${a.danger?' danger':''}" data-sheet-action="${i}">${IconBadge(a.iconName||'chevronRight',a.danger?'pink':a.tone||'lavender','sm')}<span>${esc(a.label)}</span></button>`).join('')}</div><div class="sheet-actions"><button class="action-btn ghost full" id="sheetCancel">Annuler</button></div></div></div>`);
  const close=closeSheet;
  byId('sheetCancel').onclick=close;
  byId('activeSheet').onclick=e=>{if(e.target.id==='activeSheet')close()};
  sheetRoot.querySelectorAll('[data-sheet-action]').forEach(b=>b.onclick=async()=>{close();await actions[Number(b.dataset.sheetAction)].onClick?.()});
}
