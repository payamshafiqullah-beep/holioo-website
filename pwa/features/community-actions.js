'use strict';

function openPublishingLoginSheet(){
  openSheet({title:'Compte Google nécessaire',subtitle:'Connectez-vous avec Google pour publier dans la bibliothèque publique.',confirmText:'Se connecter avec Google',onConfirm:()=>{startGoogleLogin();return true}});
}

async function ensurePublicPublishingAccount(){
  if(!navigator.onLine){showToast('Connexion Internet nécessaire');return false}
  if(guestMode){openPublishingLoginSheet();return false}
  if(!window.supabase){showToast('Service en ligne indisponible');return false}
  try{
    sb=supabaseClient();
    if(!currentUser){
      const{data:{session},error}=await sb.auth.getSession();
      if(error)throw error;
      if(session?.user)currentUser=session.user;
    }
  }catch(e){
    console.error(e);
    showToast('Connexion au compte impossible');
    return false;
  }
  if(!currentUser){openPublishingLoginSheet();return false}
  return true;
}

function publicAcademicProfileReady(){
  const p=state.profile;
  return !!(p.university&&p.program&&p.level&&p.semester&&p.academicYear);
}

async function publishSession(course,section,session){
  if(session.visibility==='public'){showToast('Cette séance est déjà publique');return}
  if(!(await ensurePublicPublishingAccount()))return;
  const p=state.profile;if(!publicAcademicProfileReady()){showToast('Complétez votre profil académique');navigate('profile');return}
  openSheet({title:'Publier cette séance ?',subtitle:'Les photos deviendront visibles dans la bibliothèque académique correspondante.',body:'<div class="notice">Vérifiez qu’aucun visage, nom, adresse ou information personnelle d’une autre personne n’est visible.</div>',confirmText:'Publier',confirmClass:'teal',onConfirm:async()=>{try{const paths=[];for(let i=0;i<session.photoIds.length;i++){const ph=await DB.get('photos',session.photoIds[i]);if(!ph?.blob)continue;const path=`${currentUser.id}/${session.id}/${i+1}.jpg`;const{error}=await sb.storage.from('public-materials').upload(path,ph.blob,{contentType:'image/jpeg',upsert:true});if(error)throw error;paths.push(path)}const{error}=await sb.from('public_materials').insert({owner_id:currentUser.id,session_local_id:session.id,title:session.title,type:'Photos',photo_count:paths.length,storage_paths:paths,university:p.university,faculty:p.faculty||'',program:p.program,level:p.level,semester:p.semester,academic_year:p.academicYear,course:course.name,section:section.name,contributor_name:p.publicProfile?p.displayName:null,contributor_holioo_id:p.publicProfile?p.holiooId:null,is_published:true});if(error)throw error;session.visibility='public';saveState();showToast('Séance publiée');render();return true}catch(e){console.error(e);showToast('Publication impossible');return false}}})
}

function openPdfPublishConfirm(meta,row,course){
  openSheet({
    title:'Publier ce PDF ?',
    subtitle:`${course.name} · Bibliothèque publique`,
    body:'<div class="notice">Ce PDF deviendra accessible aux étudiants de votre contexte académique. Vérifiez qu’il ne contient aucune donnée personnelle que vous ne souhaitez pas rendre publique.</div>',
    confirmText:'Publier',
    confirmClass:'teal',
    onConfirm:()=>doPublishPdfToLibrary(meta,row,course)
  });
}

async function publishPdfToLibrary(meta,row){
  if(!meta||!row?.blob){showToast('PDF introuvable sur cet appareil');return}
  if(!(await ensurePublicPublishingAccount()))return;
  if(!publicAcademicProfileReady()){showToast('Complétez votre profil académique');navigate('profile');return}
  if(row.blob.size>15*1024*1024){showToast('PDF trop volumineux pour la bibliothèque — 15 Mo maximum');return}

  const linkedCourse=state.courses.find(c=>c.id===meta.courseId);
  if(linkedCourse){openPdfPublishConfirm(meta,row,linkedCourse);return}

  if(!state.courses.length){showToast('Ajoutez d’abord un cours pour classer ce PDF');return}
  openSheet({
    title:'Choisir le cours',
    subtitle:'Ce PDF sera publié dans la section PDF de ce cours.',
    body:`<div class="field"><label for="publicPdfCourse">Cours</label><select id="publicPdfCourse">${state.courses.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>`,
    confirmText:'Continuer',
    onConfirm:close=>{
      const course=state.courses.find(c=>c.id===byId('publicPdfCourse').value);
      if(!course)return false;
      close();
      openPdfPublishConfirm(meta,row,course);
      return false;
    }
  });
}

async function doPublishPdfToLibrary(meta,row,course){
  const p=state.profile;
  const localKey=`pdf:${meta.id}`;
  let uploadedPath='';
  try{
    const{data:existing,error:lookupError}=await sb.from('public_materials').select('id').eq('owner_id',currentUser.id).eq('session_local_id',localKey).eq('type','PDF').maybeSingle();
    if(lookupError)throw lookupError;
    if(existing){showToast('Ce PDF est déjà publié');return true}

    uploadedPath=`${currentUser.id}/pdfs/${meta.id}-${Date.now()}.pdf`;
    const{error:uploadError}=await sb.storage.from('public-materials').upload(uploadedPath,row.blob,{contentType:'application/pdf',cacheControl:'3600',upsert:false});
    if(uploadError)throw uploadError;

    const{error:insertError}=await sb.from('public_materials').insert({
      owner_id:currentUser.id,
      session_local_id:localKey,
      title:meta.title,
      type:'PDF',
      photo_count:0,
      storage_paths:[uploadedPath],
      university:p.university,
      faculty:p.faculty||'',
      program:p.program,
      level:p.level,
      semester:p.semester,
      academic_year:p.academicYear,
      course:course.name,
      section:'PDF',
      contributor_name:p.publicProfile?p.displayName:null,
      contributor_holioo_id:p.publicProfile?p.holiooId:null,
      is_published:true
    });
    if(insertError)throw insertError;

    showToast('PDF publié dans la bibliothèque');
    return true;
  }catch(e){
    console.error(e);
    if(uploadedPath){try{await sb.storage.from('public-materials').remove([uploadedPath])}catch{}}
    showToast('Publication du PDF impossible');
    return false;
  }
}

function libraryQuery(columns='*'){const p=state.profile;return sb.from('public_materials').select(columns).eq('is_published',true).eq('university',p.university).eq('program',p.program).eq('level',p.level).eq('semester',p.semester).eq('academic_year',currentLibrary.year)}

// Same window, no popup (popups are unreliable in installed iPhone apps). Google sends
// the browser back to Holioo, which then finds Drive connected.
async function connectDrive(){
  if(guestMode||!currentUser){openSheet({title:'Compte Google nécessaire',subtitle:'Google Drive est disponible après connexion avec Google.',confirmText:'Se connecter avec Google',onConfirm:()=>{startGoogleLogin();return true}});return}
  if(!navigator.onLine||!sb){showToast('Internet est nécessaire');return}
  try{const data=await Drive.connect(sb,`${location.origin}${location.pathname}`);if(!data?.auth_url)throw new Error('Lien Google indisponible');location.href=data.auth_url}
  catch(e){console.error(e);showToast(`Google Drive indisponible : ${e.message||e}`)}
}

function showInstallSheet(){openSheet({title:'Installer Holioo sur iPhone',subtitle:'Ouvrez cette page dans Safari.',body:'<div class="notice">Touchez Partager → Sur l’écran d’accueil → Ajouter. Holioo s’ouvrira ensuite comme une app.</div>',confirmText:deferredInstallPrompt?'Installer maintenant':'Compris',onConfirm:async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null}return true},secondaryText:''})}