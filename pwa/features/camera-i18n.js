'use strict';
// Camera screen texts. The app is French-only today; every camera string lives here
// so a translation can be added later without touching the camera code.
const CAMERA_STRINGS={
  fr:{
    close:'Fermer la caméra',
    flash:'Flash',flashOn:'Flash activé',flashOff:'Flash désactivé',flashNone:'Flash indisponible sur cette caméra',flashError:'Impossible d’activer le flash',
    switchCam:'Changer de caméra',shutter:'Prendre une photo',zoom:'Zoom',
    chooseDest:'Choisir la destination',chooseDestHint:'Où ranger les photos ?',closeSheet:'Fermer',destAutoBadge:'automatique, selon l’emploi du temps',destLabel:'Destination : {dest}. Touchez pour changer',
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
    pickerTitle:'Où ranger les photos ?',course:'Cours',section:'Section',session:'Séance',
    useDest:'Utiliser cette destination',cancel:'Annuler',noCourses:'Créez d’abord un cours dans l’onglet Cours.',
    photosCount:'{n} photo(s)',today:'aujourd’hui',
    timetable:'Emploi du temps',timetableHint:'Holioo choisit le bon cours automatiquement pendant vos heures de cours.',
    ttEmpty:'Aucun créneau. Ajoutez vos cours de la semaine.',ttAdd:'Ajouter un créneau',ttSave:'Ajouter',ttDelete:'Supprimer le créneau',
    ttDay:'Jour',ttStart:'Début',ttEnd:'Fin',ttInvalid:'L’heure de fin doit être après le début',ttBack:'Retour',
    days:['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
    auto:'Auto · emploi du temps',
    // Scanner
    modes:'Mode de capture',mode_photo:'Photo',mode_document:'Document',mode_board:'Tableau',mode_book:'Livre',mode_id:'Carte',mode_qr:'QR',
    grid:'Grille',scanAuto:'Auto',scanManual:'Manuel',scanAutoLabel:'Capture automatique : {state}',on:'activée',off:'désactivée',
    scanLoading:'Préparation du scanner… {p} %',scanFailed:'Détection indisponible — cadrez la page, vous pourrez ajuster les coins ensuite',
    searchDocument:'Cadrez la page',searchBoard:'Cadrez tout le tableau',searchBook:'Cadrez les deux pages du livre',searchId:'Cadrez le recto de la carte',searchIdBack:'Retournez la carte : cadrez le verso',
    holdStill:'Ne bougez plus…',ready:'Prêt — touchez le déclencheur',
    warnDark:'Trop sombre — approchez-vous de la lumière',warnBlur:'Image floue — tenez le téléphone immobile',
    warnTilt:'Tenez le téléphone parallèle à la page',warnTiltBoard:'Tenez le téléphone droit, face au tableau',
    warnFar:'Trop loin — rapprochez-vous de la page',warnFarBoard:'Trop loin — rapprochez-vous du tableau',
    warnCut:'La page dépasse du cadre — reculez un peu',warnCutBoard:'Le tableau dépasse du cadre — reculez un peu',
    warnGlare:'Reflet sur la page — inclinez légèrement le téléphone',
    warnFind:'Cadrez toute la page sur un fond contrasté',warnFindBoard:'Cadrez tout le tableau, bien en face',
    pageLocked:'Page détectée — ne bougez plus…',
    qrAim:'Visez un code QR',qrTitle:'Code QR',qrLink:'Lien',qrText:'Texte',qrOpen:'Ouvrir le lien',qrCopy:'Copier',qrCopied:'Copié',qrUnsafe:'Ce lien n’est pas sécurisé (pas https). Ouvrez-le seulement si vous lui faites confiance.',
    idFrontSaved:'Recto enregistré — retournez la carte',idFrontReady:'Recto de la carte : touchez le déclencheur',idBackShort:'Verso',idBackReady:'Verso de la carte : touchez le déclencheur',idDone:'Carte recto-verso ajoutée',
    bookSplit:'2 pages ajoutées',retakeHint:'Reprenez la page',retaken:'Page remplacée',
    fallbackCamera:'Prendre une photo avec l’appareil photo',fallbackHint:'Vous pouvez aussi utiliser l’appareil photo du téléphone : la photo sera recadrée et nettoyée de la même façon.',
    focus:'Mise au point',
    // Review of the pages
    reviewAdd:'Caméra',reviewPages:'{n} page(s)',reviewHint:'Touchez une page pour la recadrer, changer son filtre ou la reprendre. Maintenez-la pour changer l’ordre.',
    reviewAddPages:'Ajouter',reviewFilterAll:'Filtre pour toutes',reviewPdf:'Créer un PDF',reviewProcessing:'Traitement en cours',reviewOrder:'Ordre enregistré',
    reviewAll:'Toutes',reviewPageN:'Page {i} / {n}',reviewPrev:'Page précédente',reviewNext:'Page suivante',reviewFilters:'Filtres',
    reviewCrop:'Recadrer',reviewRotate:'Pivoter',reviewRetake:'Reprendre',reviewApplyAll:'À toutes',reviewDelete:'Supprimer',
    reviewSaveError:'Modification impossible. Réessayez.',reviewApplying:'Filtre appliqué à {n} page(s)…',reviewApplied:'Filtre appliqué à toutes les pages',
    reviewDeleted:'Page supprimée',reviewUndo:'Annuler',
    // Quick Capture (Accueil, features/quick-capture.js)
    qcButton:'Capture rapide : appuyez, glissez vers un cours puis une section, et relâchez pour ouvrir la caméra',qcTrigger:'Capture rapide',
    qcMenu:'Capture rapide',qcClose:'Fermer la capture rapide',
    qcDragCourse:'Glissez vers un cours',qcDragSection:'Glissez vers une section',
    qcRelease:'Relâchez pour ouvrir la caméra',qcCancel:'Relâchez ici pour annuler',
    qcKeyCourse:'Choisissez un cours (flèches, Entrée)',qcKeySection:'Choisissez une section',qcKeyOpen:'Entrée pour ouvrir la caméra',
    qcToday:'séance du jour',qcNew:'nouvelle séance',
    qcMore:'Plus…',qcMoreCourses:'Autres cours',qcMoreSections:'Autres sections',qcMoreHint:'Choisir dans la liste complète',
    qcCourseAria:'{name} : afficher les sections',qcSectionAria:'{course}, {section} : ouvrir la caméra',
    qcHint:'Appuyez ici, glissez vers un cours puis une section sans lever le doigt, et relâchez : la caméra s’ouvre directement.',
    qcNoCourses:'Aucun cours pour l’instant. Créez-en un pour capturer directement dedans.',qcCreateCourse:'Créer un cours'
  }
};
const cameraLang='fr';
function camT(key,vars={}){
  const s=CAMERA_STRINGS[cameraLang]?.[key]??CAMERA_STRINGS.fr[key]??key;
  return typeof s==='string'?s.replace(/\{(\w+)\}/g,(_,k)=>vars[k]??''):s;
}
