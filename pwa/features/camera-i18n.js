'use strict';
// Camera screen texts. The app is French-only today; every camera string lives here
// so a translation can be added later without touching the camera code.
const CAMERA_STRINGS={
  fr:{
    close:'Fermer la caméra',
    flash:'Flash',flashOn:'Flash activé',flashOff:'Flash désactivé',flashNone:'Flash indisponible sur cette caméra',flashError:'Impossible d’activer le flash',
    switchCam:'Changer de caméra',shutter:'Prendre une photo',zoom:'Zoom',
    chooseDest:'Choisir la destination',destLabel:'Destination : {dest}. Touchez pour changer',
    newSession:'Nouvelle séance',sessionN:'Séance {n}',newSessionN:'Nouvelle séance ({n})',
    chooseFirst:'Choisissez d’abord où ranger les photos',
    lastPhoto:'Dernière photo, {n} photo(s) dans cette capture. Touchez pour les revoir',
    importBtn:'Importer',done:'Terminé',
    imported:'{n} photo(s) ajoutée(s) à {dest}',
    savedTo:'Photos rangées dans {dest}',
    pending:'{n} photo(s) en cours d’enregistrement…',
    retrying:'Enregistrement échoué, nouvel essai…',
    storageFull:'Stockage presque plein : libérez de l’espace sur l’appareil',
    storageLow:'Espace de stockage faible',
    leavePending:'Des photos sont encore en cours d’enregistrement.',
    // Camera states
    opening:'Ouverture…',ready:'Caméra prête',
    permTitle:'Accès à la caméra',
    permAsk:'Holioo a besoin de la caméra pour photographier le tableau. Les photos restent sur votre appareil.',
    permAllow:'Autoriser la caméra',
    permDenied:'L’accès à la caméra a été refusé.',
    permBlocked:'La caméra est bloquée pour Holioo. Autorisez-la dans les réglages, puis revenez ici.',
    permHowIos:'iPhone : Réglages › Safari › Caméra › Autoriser (ou « aA » dans la barre d’adresse › Réglages du site web).',
    permHowAndroid:'Android : touchez le cadenas à côté de l’adresse › Autorisations › Caméra › Autoriser.',
    permHowApp:'Application installée : Réglages du téléphone › Applications › Holioo (ou Chrome) › Autorisations › Caméra.',
    retry:'Réessayer',
    noCamera:'Aucune caméra trouvée sur cet appareil.',
    camBusy:'La caméra est utilisée par une autre application. Fermez-la puis réessayez.',
    camError:'La caméra ne peut pas démarrer.',
    insecure:'La caméra nécessite une connexion sécurisée (https).',
    notReady:'La caméra n’est pas prête',
    // Picker
    pickerTitle:'Où ranger les photos ?',recent:'Récents',course:'Cours',section:'Section',session:'Séance',
    useDest:'Utiliser cette destination',cancel:'Annuler',noCourses:'Créez d’abord un cours dans l’onglet Cours.',
    photosCount:'{n} photo(s)',today:'aujourd’hui',
    timetable:'Emploi du temps',timetableHint:'Holioo choisit le bon cours automatiquement pendant vos heures de cours.',
    ttEmpty:'Aucun créneau. Ajoutez vos cours de la semaine.',ttAdd:'Ajouter un créneau',ttSave:'Ajouter',ttDelete:'Supprimer le créneau',
    ttDay:'Jour',ttStart:'Début',ttEnd:'Fin',ttInvalid:'L’heure de fin doit être après le début',ttBack:'Retour',
    days:['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
    auto:'Auto · emploi du temps'
  }
};
const cameraLang='fr';
function camT(key,vars={}){
  const s=CAMERA_STRINGS[cameraLang]?.[key]??CAMERA_STRINGS.fr[key]??key;
  return typeof s==='string'?s.replace(/\{(\w+)\}/g,(_,k)=>vars[k]??''):s;
}
