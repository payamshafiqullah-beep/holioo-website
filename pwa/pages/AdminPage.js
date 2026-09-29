// Administration — liste des utilisateurs : modifier, bloquer, débloquer, supprimer.
// All checks happen on the server (admin-users function); this screen only displays.
let adminUsers=null;

async function adminCall(action,payload={}){
  const{data,error}=await sb.functions.invoke('admin-users',{body:{action,...payload}});
  if(error){let msg=error.message;try{msg=(await error.context.json()).error||msg}catch{}throw new Error(msg)}
  if(data?.error)throw new Error(data.error);
  return data;
}

async function renderAdmin(){
  app.innerHTML=`<section class="screen">
    ${PageHeader({back:true,title:'Administration',actions:false,trailing:`<button class="icon-btn" id="adminRefresh" aria-label="Actualiser">${icon('refresh',{size:20})}</button>`})}
    ${PageIntro({eyebrow:'ADMIN',title:'Utilisateurs',subtitle:'Gérez les comptes qui se connectent à Holioo.'})}
    <div class="stat-grid three" id="adminStats"></div>
    ${SearchBar({id:'adminSearch',placeholder:'Rechercher un nom ou un e-mail...'})}
    ${FilterChips('adminFilters',[{value:'all',label:'Tous'},{value:'active',label:'Actifs'},{value:'blocked',label:'Bloqués'},{value:'drive',label:'Drive connecté'},{value:'device',label:'Anciens comptes'}],'all')}
    <div class="list-stack" id="adminList"><p class="pdf-loading">Chargement…</p></div>
    <div id="adminEmpty" hidden>${EmptyState({iconName:'users',title:'Aucun utilisateur',text:'Aucun compte ne correspond à ce filtre.'})}</div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('profile');
  byId('adminRefresh').onclick=()=>{adminUsers=null;render()};
  try{if(!adminUsers)adminUsers=(await adminCall('list')).users}
  catch(e){byId('adminList').innerHTML=EmptyState({iconName:'x',title:'Chargement impossible',text:e.message});return}
  if(currentView!=='admin')return;
  const n=k=>adminUsers.filter(k).length;
  byId('adminStats').innerHTML=`${StatCard({tone:'lavender',iconName:'users',value:adminUsers.length,label:'Comptes'})}${StatCard({tone:'mint',iconName:'cloud',value:n(u=>u.drive_connected),label:'Drive connecté'})}${StatCard({tone:'pink',iconName:'x',value:n(u=>u.blocked),label:'Bloqués'})}`;
  byId('adminList').innerHTML=adminUsers.map(u=>{
    const kinds=[u.blocked?'blocked':'active',u.drive_connected?'drive':'',u.device?'device':''].filter(Boolean).join(' ');
    const tag=u.blocked?Tag('Bloqué','pink'):u.role==='admin'?Tag('Admin','lavender'):u.device?Tag('Ancien','neutral'):u.drive_connected?Tag('Drive','mint'):'';
    const avatar=u.avatar_url?`<img class="admin-avatar" src="${esc(u.avatar_url)}" alt="" referrerpolicy="no-referrer">`:`<span class="admin-avatar">${esc(iconLetter(u.name||u.email))}</span>`;
    return`<button class="list-card" data-admin-user="${u.id}" data-kind="${kinds}" data-search="${esc(`${u.name} ${u.email}`.toLowerCase())}">${avatar}<span class="list-card-copy"><strong>${esc(u.name||(u.device?'Compte appareil':u.email))}</strong><small>${esc(u.device?'Ancien compte sans Google':u.email)}</small><small>${u.last_sign_in_at?`Dernière connexion ${fmtDate(u.last_sign_in_at)}`:'Jamais connecté'}</small></span>${tag}<span class="chev">${icon('chevronRight',{size:20})}</span></button>`;
  }).join('');
  bindListFilter({searchId:'adminSearch',chipsId:'adminFilters',scope:'#adminList',onChange:({shown})=>byId('adminEmpty').hidden=!!shown});
  document.querySelectorAll('[data-admin-user]').forEach(b=>b.onclick=()=>openAdminUser(adminUsers.find(u=>u.id===b.dataset.adminUser)));
}

function openAdminUser(u){
  if(!u)return;
  const self=u.id===currentUser?.id;
  const run=async(action,payload,done)=>{try{await adminCall(action,{id:u.id,...payload});showToast(done);adminUsers=null;render()}catch(e){showToast(e.message)}};
  const actions=[{label:'Modifier',iconName:'pencil',onClick:()=>openAdminEdit(u)}];
  if(!self)actions.push(u.blocked
    ?{label:'Débloquer l’accès',iconName:'checkCircle',tone:'mint',onClick:()=>run('unblock',{},'Accès rétabli')}
    :{label:'Bloquer l’accès',iconName:'x',tone:'peach',onClick:()=>openSheet({title:'Bloquer cet utilisateur ?',subtitle:`${u.name||u.email} ne pourra plus se connecter ni synchroniser. Vous pourrez le débloquer plus tard.`,confirmText:'Bloquer',confirmClass:'coral',onConfirm:()=>{run('block',{},'Utilisateur bloqué');return true}})});
  if(!self)actions.push({label:'Supprimer le compte',iconName:'trash',danger:true,onClick:()=>openSheet({title:'Supprimer ce compte ?',subtitle:`Le compte ${u.email}, son profil, ses séances publiées et sa connexion Drive seront supprimés définitivement. Les fichiers déjà dans son Google Drive restent chez lui.`,confirmText:'Supprimer définitivement',confirmClass:'coral',onConfirm:()=>{run('delete',{},'Compte supprimé');return true}})});
  openActionSheet(u.name||u.email,actions,[u.email,u.university,u.program].filter(Boolean).join(' · '));
}

function openAdminEdit(u){
  const f=(label,id,value)=>Field({label,id,value});
  openSheet({title:'Modifier le profil',subtitle:u.email,
    body:`${f('Nom affiché','aeName',u.name)}${f('Université','aeUni',u.university)}${f('Faculté','aeFac',u.faculty)}${f('Filière / majeure','aeProg',u.program)}<div class="field-row">${f('Niveau','aeLevel',u.level)}${f('Semestre','aeSem',u.semester)}</div>${f('Année universitaire','aeYear',u.academic_year)}`,
    onConfirm:async()=>{
      const changes={display_name:byId('aeName').value,university:byId('aeUni').value,faculty:byId('aeFac').value,program:byId('aeProg').value,level:byId('aeLevel').value,semester:byId('aeSem').value,academic_year:byId('aeYear').value};
      try{await adminCall('update',{id:u.id,changes});showToast('Profil modifié');adminUsers=null;render();return true}catch(e){showToast(e.message);return false}
    }});
}
