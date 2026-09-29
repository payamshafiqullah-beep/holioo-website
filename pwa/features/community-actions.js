'use strict';

async function publishSession(course,section,session){
  if(session.visibility==='public'){showToast('Cette séance est déjà publique');return}if(!navigator.onLine||!sb||!currentUser){showToast('Internet est nécessaire pour publier');return}const p=state.profile;if(!p.university||!p.program||!p.level||!p.semester||!p.academicYear){showToast('Complétez votre profil académique');navigate('profile');return}
  openSheet({title:'Publier cette séance ?',subtitle:'Les photos deviendront visibles dans la bibliothèque académique correspondante.',body:'<div class="notice">Vérifiez qu’aucun visage, nom, adresse ou information personnelle d’une autre personne n’est visible.</div>',confirmText:'Publier',confirmClass:'teal',onConfirm:async()=>{try{const paths=[];for(let i=0;i<session.photoIds.length;i++){const ph=await DB.get('photos',session.photoIds[i]);if(!ph?.blob)continue;const path=`${currentUser.id}/${session.id}/${i+1}.jpg`;const{error}=await sb.storage.from('public-materials').upload(path,ph.blob,{contentType:'image/jpeg',upsert:true});if(error)throw error;paths.push(path)}const{error}=await sb.from('public_materials').insert({owner_id:currentUser.id,session_local_id:session.id,title:session.title,type:'Photos',photo_count:paths.length,storage_paths:paths,university:p.university,faculty:p.faculty||'',program:p.program,level:p.level,semester:p.semester,academic_year:p.academicYear,course:course.name,section:section.name,contributor_name:p.publicProfile?p.displayName:null,contributor_holioo_id:p.publicProfile?p.holiooId:null,is_published:true});if(error)throw error;session.visibility='public';saveState();showToast('Séance publiée');render();return true}catch(e){console.error(e);showToast('Publication impossible');return false}}})
}

function libraryQuery(columns='*'){const p=state.profile;return sb.from('public_materials').select(columns).eq('is_published',true).eq('university',p.university).eq('program',p.program).eq('level',p.level).eq('semester',p.semester).eq('academic_year',currentLibrary.year)}

// Same window, no popup (popups are unreliable in installed iPhone apps). Google sends
// the browser back to Holioo, which then finds Drive connected.
async function connectDrive(){
  if(!navigator.onLine||!sb){showToast('Internet est nécessaire');return}
  try{const data=await Drive.connect(sb,`${location.origin}${location.pathname}`);if(!data?.auth_url)throw new Error('Lien Google indisponible');location.href=data.auth_url}
  catch(e){console.error(e);showToast(`Google Drive indisponible : ${e.message||e}`)}
}

function showInstallSheet(){openSheet({title:'Installer Holioo sur iPhone',subtitle:'Ouvrez cette page dans Safari.',body:'<div class="notice">Touchez Partager → Sur l’écran d’accueil → Ajouter. Holioo s’ouvrira ensuite comme une app.</div>',confirmText:deferredInstallPrompt?'Installer maintenant':'Compris',onConfirm:async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null}return true},secondaryText:''})}