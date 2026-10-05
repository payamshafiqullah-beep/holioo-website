// Administration — liste des utilisateurs : modifier, bloquer, débloquer, supprimer.
// All checks happen on the server (admin-users function); this screen only displays.
let adminUsers=null,adminActivity=null;

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
    <div id="adminActivity"></div>
    <div class="stat-grid three" id="adminStats"></div>
    ${SearchBar({id:'adminSearch',placeholder:'Rechercher un nom ou un e-mail...'})}
    ${FilterChips('adminFilters',[{value:'all',label:'Tous'},{value:'active',label:'Actifs'},{value:'blocked',label:'Bloqués'},{value:'drive',label:'Drive connecté'},{value:'device',label:'Anciens comptes'}],'all')}
    <div class="list-stack" id="adminList"><p class="pdf-loading">Chargement…</p></div>
    <div id="adminEmpty" hidden>${EmptyState({iconName:'users',title:'Aucun utilisateur',text:'Aucun compte ne correspond à ce filtre.'})}</div>
  </section>`;
  byId('backBtn').onclick=()=>navigate('profile');
  byId('adminRefresh').onclick=()=>{adminUsers=null;adminActivity=null;render()};
  try{if(!adminUsers)adminUsers=(await adminCall('list')).users}
  catch(e){byId('adminList').innerHTML=EmptyState({iconName:'x',title:'Chargement impossible',text:e.message});return}
  if(currentView!=='admin')return;
  if(!adminActivity){try{adminActivity=await adminCall('stats')}catch(e){adminActivity={error:e.message}}}
  if(currentView!=='admin')return;
  renderAdminActivity();
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

// Usage counts and the Excel export: for the owner only (the server refuses everyone else).
function renderAdminActivity(){
  const box=byId('adminActivity'),a=adminActivity;if(!box||!a)return;
  const exportBtn=ActionButton({label:'Exporter en Excel',id:'adminExport',variant:'ghost',iconName:'download'});
  if(a.error){
    box.innerHTML=`${Notice(`Activité indisponible : ${a.error}. Vérifiez que la migration et la fonction app-ping sont déployées.`,'sky')}${exportBtn}`;
  }else{
    const s=a.summary||{},sum=(u,g)=>(u||0)+(g||0);
    box.innerHTML=`${SectionTitle('Activité')}
      <div class="stat-grid four">
        ${StatCard({tone:'mint',iconName:'zap',value:sum(s.online_users,s.online_guests),label:'En ligne (10 min)'})}
        ${StatCard({tone:'lavender',iconName:'calendar',value:sum(s.today_users,s.today_guests),label:'Aujourd’hui'})}
        ${StatCard({tone:'sky',iconName:'calendar',value:sum(s.week_users,s.week_guests),label:'7 derniers jours'})}
        ${StatCard({tone:'peach',iconName:'calendar',value:sum(s.month_users,s.month_guests),label:'30 derniers jours'})}
      </div>
      <p class="field-note">Utilisateurs connectés vus : ${s.users_seen||0} · invités (appareils) : ${s.guests_seen||0}. Dont invités — en ligne : ${s.online_guests||0}, aujourd’hui : ${s.today_guests||0}, 7 jours : ${s.week_guests||0}, 30 jours : ${s.month_guests||0}.</p>
      ${exportBtn}`;
  }
  byId('adminExport').onclick=exportAdminExcel;
}

function adminStamp(v){
  const d=v?new Date(v):null;if(!d||isNaN(d))return'';
  const p=n=>String(n).padStart(2,'0');
  return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function exportAdminExcel(){
  const users=adminUsers||[],a=adminActivity&&!adminActivity.error?adminActivity:null,s=a?.summary||{},devices=a?.devices||[];
  const platformName={ipad:'iPad',iphone:'iPhone',android:'Android',desktop:'Ordinateur',other:'Autre'};
  const perUser=new Map();
  for(const d of devices)if(d.email){
    const e=perUser.get(d.email)||{last:'',opens:0,days:0,devices:0};
    if(d.last_seen_at>e.last)e.last=d.last_seen_at;
    e.opens+=d.opens;e.days+=d.days_active;e.devices++;
    perUser.set(d.email,e);
  }
  const summary=[['Indicateur','Valeur'],['Date de l’export',adminStamp(new Date())],['Comptes inscrits',s.registered??users.length]];
  if(a)summary.push(
    ['Utilisateurs connectés vus dans l’app',s.users_seen],['Invités (appareils)',s.guests_seen],
    ['En ligne maintenant — utilisateurs',s.online_users],['En ligne maintenant — invités',s.online_guests],
    ['Actifs aujourd’hui — utilisateurs',s.today_users],['Actifs aujourd’hui — invités',s.today_guests],
    ['Actifs 7 jours — utilisateurs',s.week_users],['Actifs 7 jours — invités',s.week_guests],
    ['Actifs 30 jours — utilisateurs',s.month_users],['Actifs 30 jours — invités',s.month_guests]);
  const sheets=[{name:'Résumé',widths:[40,20],rows:summary}];
  if(a)sheets.push({name:'Par jour',widths:[14,14,12,10],rows:[['Date','Utilisateurs','Invités','Total'],...a.daily.map(d=>[d.day,d.users,d.guests,d.users+d.guests])]});
  sheets.push({name:'Utilisateurs',widths:[26,32,8,12,26,22,22,10,10,17,17,17,12,12,10,10],rows:[
    ['Nom','E-mail','Rôle','Statut','Université','Faculté','Filière','Niveau','Semestre','Inscrit le','Dernière connexion','Dernière activité','Jours actifs','Ouvertures','Appareils','Drive'],
    ...users.map(u=>{const e=perUser.get(u.email);return[u.name,u.email,u.role,u.blocked?'Bloqué':u.device?'Ancien compte':'Actif',u.university,u.faculty,u.program,u.level,u.semester,adminStamp(u.created_at),adminStamp(u.last_sign_in_at),adminStamp(e?.last),e?.days,e?.opens,e?.devices,u.drive_connected?'Oui':'']})
  ]});
  if(a)sheets.push({name:'Appareils',widths:[12,32,12,26,17,17,12,12,10],rows:[
    ['Type','Compte','Plateforme','Version','Premier passage','Dernier passage','Jours actifs','Ouvertures','ID'],
    ...devices.map(d=>[d.is_user?'Utilisateur':'Invité',d.email||'',platformName[d.platform]||'Autre',d.version,adminStamp(d.first_seen_at),adminStamp(d.last_seen_at),d.days_active,d.opens,d.id.slice(0,8)])
  ]});
  const url=URL.createObjectURL(buildXlsx(sheets)),link=document.createElement('a');
  link.href=url;link.download=`Holioo_statistiques_${new Date().toISOString().slice(0,10)}.xlsx`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  showToast('Fichier Excel prêt');
}
