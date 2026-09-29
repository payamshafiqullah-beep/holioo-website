'use strict';
// App shell: floating bottom navigation + live status on headers.

const NAV_ITEMS=[
  {view:'home',label:'Accueil',iconName:'home'},
  {view:'courses',label:'Cours',iconName:'book'},
  {view:'capture',label:'Capture',capture:true},
  {view:'library',label:'Bibliothèque',iconName:'library'},
  {view:'files',label:'Fichiers',iconName:'folder'}
];

function FloatingCaptureButton(){
  return`<span class="capture-orb">${icon('camera',{size:26,stroke:2})}</span>`;
}

function BottomNav(){
  return NAV_ITEMS.map(it=>`<button data-nav="${it.view}" class="nav-item${it.capture?' nav-capture':''}" aria-label="${it.label}">${it.capture?FloatingCaptureButton():`<span class="nav-icon">${icon(it.iconName,{size:24})}</span>`}<small>${it.label}</small></button>`).join('');
}

// Last computed sync state; refreshSyncIndicator() in core.js updates it.
let syncIndicator={cls:'',text:'Local'};

function applyChromeStatus(){
  document.querySelectorAll('[data-sync-dot]').forEach(d=>{
    d.className=`sync-dot ${syncIndicator.cls}`;
    d.closest('button')?.setAttribute('title',`Synchronisation : ${syncIndicator.text}`);
  });
  document.querySelectorAll('[data-sync-text]').forEach(t=>t.textContent=syncIndicator.text);
}

bottomNav.innerHTML=BottomNav();
