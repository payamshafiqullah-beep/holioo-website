# Message pour Demain — Site Web

## Installation et démarrage

```bash
npm install
npm run dev       # Développement local → http://localhost:5173
npm run build     # Build de production (dossier /dist)
npm run preview   # Prévisualiser le build
```

## Comment personnaliser

### Nom de marque
Cherchez et remplacez `Message pour Demain` dans les fichiers.

### Email et téléphone
Dans `src/contexts/LanguageContext.jsx`, cherchez `contact@messagepourdemain.fr` et `+33 (0)X XX XX XX XX`.
Dans `src/pages/Contact.jsx`, mettez à jour les liens `mailto:` et `tel:`.

### WhatsApp
Dans `src/pages/Contact.jsx`, remplacez le lien `https://wa.me/33XXXXXXXXX`.

### Texte français / anglais
Tout le texte est dans `src/contexts/LanguageContext.jsx` dans l'objet `translations`.

### Photos et vidéos
Dans `src/pages/Gallery.jsx`, remplacez les placeholders par vos vraies images/vidéos.

### Formulaire de réservation
Pour connecter à Formspree, Netlify Forms, ou un backend, modifiez la fonction `submit` dans `src/pages/Booking.jsx`.

### Logo
Remplacez le texte dans `src/components/Header.jsx` par une balise `<img>`.

## Déploiement

- **Netlify** : connectez votre repo GitHub → déploiement automatique
- **Vercel** : `vercel deploy`
- **Hébergement classique** : uploadez le contenu du dossier `/dist`

## Structure du projet

```
src/
  components/     Header, Footer, ScrollReveal
  contexts/       LanguageContext (toutes les traductions)
  pages/          Une page par route
  index.css       Styles globaux
  main.jsx        Point d'entrée + Router
```
