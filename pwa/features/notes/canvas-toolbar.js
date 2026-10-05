// Notes page, tools: the second toolbar and the undo / redo / save indicator of the desk toolbar.
// ── Second toolbar ──
function canvasToolsHtml(rt){
  const p=canvasPrefs(),pk=canvasPaletteKind(rt.tool),palette=CANVAS_COLORS[pk],ci=p.ci[pk]??0,stylus=canvasStylusOnly();
  const btn=(attrs,label,inner,active,cls='')=>`<button class="cv-btn${cls?` ${cls}`:''}${active?' active':''}" type="button" ${attrs} title="${esc(label)}" aria-label="${esc(label)}"${active===undefined?'':` aria-pressed="${!!active}"`}>${inner}</button>`;
  return`<div class="cv-group" role="group" aria-label="Outils">${CANVAS_TOOLS.map(t=>btn(`data-cv-tool="${t}"`,CANVAS_TOOL_UI[t][1],icon(CANVAS_TOOL_UI[t][0],{size:20}),rt.tool===t)).join('')}</div>
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Couleur">${palette.map((c,i)=>`<button class="cv-color${i===ci?' active':''}" type="button" data-cv-color="${i}" style="--c:${c}" title="${CANVAS_COLOR_NAMES[pk][i]}" aria-label="${CANVAS_COLOR_NAMES[pk][i]}" aria-pressed="${i===ci}"></button>`).join('')}</div>
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Épaisseur">${['Fin','Moyen','Épais'].map((l,i)=>btn(`data-cv-size="${i}"`,`Épaisseur : ${l.toLowerCase()}`,`<i class="cv-dot" style="--d:${5+i*5}px"></i>`,i===p.size)).join('')}</div>
    ${rt.tool==='pen'||rt.tool==='highlighter'?`<span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Aide au dessin">${btn('data-cv-snap',canvasSnapOn()?'Formes automatiques activées : lignes, cercles et formes régulières sont redressés (cliquez pour désactiver)':'Formes automatiques désactivées (cliquez pour redresser lignes, cercles et formes régulières)',icon('wand',{size:20}),canvasSnapOn())}${btn('data-cv-hold',canvasHoldSnapOn()?'Forme auto en maintenant activée : gardez le stylet immobile une demi-seconde et le trait devient une forme nette (cliquez pour désactiver)':'Forme auto en maintenant désactivée (cliquez pour l’activer)',icon('clock',{size:20}),canvasHoldSnapOn())}</div>`:''}
    ${rt.tool==='eraser'?`<span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Mode de la gomme">${btn('data-cv-erasemode="stroke"','Gomme trait : efface le trait entier touché',icon('eraser',{size:20}),canvasEraseMode()==='stroke')}${btn('data-cv-erasemode="partial"','Gomme partielle : n’efface que la partie touchée du trait',icon('scissors',{size:20}),canvasEraseMode()==='partial')}</div>`:''}
    <span class="cv-sep"></span>
    <div class="cv-group" role="group" aria-label="Fond de page">${[['lines','rows','Lignes'],['grid','grid','Quadrillage'],['blank','square','Page blanche']].map(([v,ic,l])=>btn(`data-cv-bg="${v}"`,l,icon(ic,{size:19}),rt.store.page.bg===v)).join('')}</div>
    <span class="cv-sep"></span>
    ${btn('data-cv-stylus',stylus?'Stylet seul : le stylet dessine, le doigt fait défiler (cliquez pour dessiner aussi au doigt)':'Dessin au doigt activé (cliquez pour réserver le dessin au stylet)',icon('stylus',{size:20}),stylus)}
    ${btn('data-cv-space','Ajouter de l’espace en bas de la page',icon('addSpace',{size:20}),undefined)}`;
}
function canvasRenderTools(rt){rt.tools.innerHTML=canvasToolsHtml(rt)}
// Undo / redo / "Enregistré" live in the desk toolbar (ui/desk-shell.js asks for the HTML after every render).
function canvasTopBarHtml(){
  const rt=canvasRuntime,live=!!rt&&!!rt.root?.isConnected;
  const label={saved:'Enregistré',saving:'Enregistrement…',error:'Non enregistré'}[live?rt.saveState:'saved'];
  return`<button class="desk-tool" type="button" id="cvUndo" data-cv-undo title="Annuler (Ctrl+Z)" aria-label="Annuler"${live&&rt.hist.undo.length?'':' disabled'}>${icon('undo',{size:20})}</button>
    <button class="desk-tool" type="button" id="cvRedo" data-cv-redo title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"${live&&rt.hist.redo.length?'':' disabled'}>${icon('redo',{size:20})}</button>
    <span class="cv-status ${live?rt.saveState:'saved'}" id="cvStatus" role="status" aria-live="polite">${icon('check',{size:14,stroke:2.6})}<span>${label}</span></span>`;
}
function canvasRefreshTopBar(){
  const rt=canvasRuntime,live=!!rt&&!!rt.root?.isConnected;
  const u=byId('cvUndo'),r=byId('cvRedo'),s=byId('cvStatus');
  if(u)u.disabled=!(live&&rt.hist.undo.length);if(r)r.disabled=!(live&&rt.hist.redo.length);
  if(s){const st=live?rt.saveState:'saved';s.className=`cv-status ${st}`;s.lastElementChild.textContent={saved:'Enregistré',saving:'Enregistrement…',error:'Non enregistré'}[st]}
}
document.addEventListener('holioo:desk',canvasRefreshTopBar);
document.addEventListener('click',e=>{
  const rt=canvasRuntime;if(!rt?.root?.isConnected)return;
  if(e.target.closest('[data-cv-undo]'))canvasUndoAction(rt);
  else if(e.target.closest('[data-cv-redo]'))canvasRedoAction(rt);
});
