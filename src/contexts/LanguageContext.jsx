import { createContext, useContext, useState } from 'react'

const LanguageContext = createContext()

export const translations = {
  fr: {
    // Nav
    nav: {
      home: 'Accueil', about: 'À propos', services: 'Services',
      how: 'Comment ça marche', offer: 'Offre gratuite',
      gallery: 'Galerie', faq: 'FAQ', contact: 'Contact', book: 'Réserver',
    },
    // Hero
    hero: {
      tagline: 'Un film pour aujourd\'hui. Un message pour demain.',
      sub: 'Nous créons des vidéos cinématographiques qui relient votre histoire d\'aujourd\'hui à votre futur.',
      cta1: 'Réserver une séance gratuite', cta2: 'Découvrir le concept',
      offer: 'Offre de lancement : service complet gratuit pour les 5 premières familles.',
    },
    // About
    about: {
      label: 'À propos', title: 'Qui sommes-nous',
      p1: 'Message pour Demain est une équipe de quatre personnes passionnées par la mémoire, le cinéma, et l\'émotion humaine.',
      p2: 'Deux membres de notre équipe s\'occupent du tournage, de la mise en scène et de la direction artistique. Deux autres membres se consacrent au montage et à la post-production.',
      p3: 'Notre mission est simple : préserver ce que vous vivez aujourd\'hui, pour que vous puissiez le retrouver demain.',
      mission: 'Notre mission', missionText: 'Nous ne filmons pas seulement votre présent. Nous vous connectons à votre futur.',
      team1: 'Tournage & Production', team2: 'Montage & Post-production',
    },
    // Services
    services: {
      label: 'Services', title: 'Ce que nous créons',
      items: [
        { title: 'Films de mémoire familiale', desc: 'Capturez votre famille telle qu\'elle est aujourd\'hui. Dans un an, redécouvrez ce moment précieux.' },
        { title: 'Messages pour le futur', desc: 'Enregistrez vos objectifs, vos rêves, vos émotions — et retrouvez-les dans un an.' },
        { title: 'Interviews individuelles', desc: 'Un moment personnel pour vous exprimer, vous raconter, et laisser une trace authentique.' },
        { title: 'Films de couple', desc: 'Votre histoire à deux, filmée avec soin, beauté et sincérité.' },
        { title: 'Grandes familles', desc: 'Plusieurs générations réunies dans un seul film cinématographique.' },
        { title: 'Suivi annuel', desc: 'Revenez chaque année. Voyez comment vous avez évolué, grandi, changé.' },
        { title: 'Montage & Post-production', desc: 'Chaque vidéo est montée avec soin pour créer un film émotionnel et cinématographique.' },
        { title: 'Livraison QR code ou USB', desc: 'Recevez votre film par QR code numérique ou sur clé USB selon votre préférence.' },
      ],
    },
    // How
    how: {
      label: 'Le processus', title: 'Comment ça marche',
      steps: [
        { n: '01', title: 'Réserver votre séance', desc: 'Remplissez le formulaire. Nous vous recontactons pour confirmer tous les détails.' },
        { n: '02', title: 'Choisir votre lieu', desc: 'Chez vous, dans un lieu significatif — de préférence un espace fermé pour une meilleure qualité.' },
        { n: '03', title: 'Préparer les questions', desc: 'Vous préparez vos propres questions (jusqu\'à 10 par personne), ou notre équipe les prépare pour vous.' },
        { n: '04', title: 'Le jour du tournage', desc: 'Notre équipe arrive avec le matériel. Vous vous exprimez librement, dans un cadre bienveillant.' },
        { n: '05', title: 'Montage & Post-production', desc: 'Nous créons un film cinématographique à partir de vos images. Chaque détail est soigné.' },
        { n: '06', title: 'Recevoir votre film', desc: 'Livraison par QR code ou clé USB. Votre film, prêt à être visionné.' },
        { n: '07', title: 'Revoir dans un an', desc: 'Un an plus tard, redécouvrez votre message. Voyez ce qui a changé.' },
      ],
    },
    // Offer
    offer: {
      label: 'Offre de lancement', title: 'Gratuit pour les 5 premières familles',
      sub: 'Une offre unique pour commencer cette aventure avec vous.',
      text: 'Offre de lancement : service complet gratuit pour les 5 premières familles.',
      includes: ['Tournage cinématographique', 'Montage et post-production', 'Livraison par QR code ou clé USB', 'Accompagnement personnalisé'],
      note: 'Aucun frais caché. Aucune obligation. Seule une demande optionnelle : votre accord pour utiliser un extrait de votre vidéo dans notre portfolio.',
      consent: 'Avant le tournage, un formulaire de consentement est signé. Votre vie privée est entièrement respectée.',
      cta: 'Réserver ma place gratuite',
      future: 'Des forfaits seront disponibles prochainement.',
    },
    // Gallery
    gallery: {
      label: 'Galerie', title: 'Nos créations',
      empty: 'Nos premiers exemples seront bientôt disponibles.',
      placeholders: ['Film de famille', 'Portrait individuel', 'Film de couple', 'Coulisses', 'Grande famille', 'Message futur'],
    },
    // FAQ
    faq: {
      label: 'FAQ', title: 'Questions fréquentes',
      items: [
        { q: 'Le service est-il vraiment gratuit pour les 5 premières familles ?', a: 'Oui, entièrement gratuit. Tournage, montage, post-production et livraison. Aucun frais caché.' },
        { q: 'Où se déroule le tournage ?', a: 'Dans le lieu de votre choix : chez vous, dans un endroit significatif. Nous recommandons un espace fermé pour une meilleure qualité de lumière et de son.' },
        { q: 'Pouvons-nous préparer nos propres questions ?', a: 'Oui, absolument. Vous pouvez préparer jusqu\'à 10 questions par personne.' },
        { q: 'Pouvez-vous préparer les questions pour nous ?', a: 'Oui, notre équipe peut préparer des questions pensées, émotionnelles et adaptées à votre situation.' },
        { q: 'Des personnes seules peuvent-elles réserver ce service ?', a: 'Oui. Ce service s\'adresse aux familles, couples, individus et grandes familles.' },
        { q: 'Publiez-vous notre vidéo ?', a: 'Non, jamais sans votre accord écrit. Votre vidéo vous appartient entièrement.' },
        { q: 'Notre vie privée est-elle protégée ?', a: 'Entièrement. Toutes les vidéos et informations personnelles restent confidentielles.' },
        { q: 'Comment recevons-nous la vidéo finale ?', a: 'Par QR code numérique ou sur clé USB, selon votre préférence.' },
        { q: 'Faut-il signer un formulaire de consentement ?', a: 'Oui, avant le tournage. Ce document protège votre vie privée et précise vos choix de publication.' },
        { q: 'Quelles villes couvrez-vous ?', a: 'Dijon, Nevers, et environ 70 km autour de ces villes. Contactez-nous pour vérifier votre zone.' },
      ],
    },
    // Contact
    contact: {
      label: 'Contact', title: 'Parlons de votre projet',
      sub: 'Nous sommes là pour répondre à vos questions.',
      zone: 'Zone de service : Dijon, Nevers et environ 70 km alentour.',
      email: 'contact@messagepourdemain.fr', phone: '+33 (0)X XX XX XX XX',
      whatsapp: 'Écrire sur WhatsApp', send: 'Envoyer le message',
      name: 'Nom complet', emailField: 'Adresse email',
      phoneField: 'Téléphone', message: 'Votre message',
    },
    // Booking
    booking: {
      label: 'Réservation', title: 'Réserver votre séance',
      sub: 'Simple, rapide et sans engagement.',
      fields: {
        name: 'Nom complet *', email: 'Email *', phone: 'Téléphone *',
        city: 'Ville *', people: 'Nombre de personnes à filmer *',
        lang: 'Langue préférée', location: 'Lieu préféré',
        date: 'Date ou période souhaitée', questions: 'Souhaitez-vous préparer vos propres questions ?',
        qYes: 'Oui', qNo: 'Non', qMaybe: 'Pas encore sûr(e)',
        qNote: 'Jusqu\'à 10 questions par personne.',
        consent: 'J\'accepte d\'être contacté(e) pour confirmer les détails.',
        submit: 'Envoyer ma demande',
      },
      success: 'Merci ! Nous vous recontacterons très prochainement.',
    },
    // Privacy
    privacy: {
      title: 'Politique de confidentialité',
      note: 'Ce texte est une base informative et doit être vérifié par un professionnel avant publication.',
    },
    // Terms
    terms: {
      title: 'Conditions générales',
      note: 'Ces conditions sont une base informative et doivent être vérifiées avant publication.',
    },
    // Footer
    footer: {
      tagline: 'Un film pour aujourd\'hui. Un message pour demain.',
      privacy: 'Politique de confidentialité', terms: 'Conditions générales',
      rights: '© 2025 Message pour Demain. Tous droits réservés.',
    },
  },

  en: {
    nav: {
      home: 'Home', about: 'About', services: 'Services',
      how: 'How it works', offer: 'Free offer',
      gallery: 'Gallery', faq: 'FAQ', contact: 'Contact', book: 'Book',
    },
    hero: {
      tagline: 'A film for today. A message for tomorrow.',
      sub: 'We create cinematic videos that connect today\'s story with your future.',
      cta1: 'Book a free session', cta2: 'Discover the concept',
      offer: 'Launch offer: the complete service is free for the first 5 families.',
    },
    about: {
      label: 'About', title: 'Who we are',
      p1: 'Message pour Demain is a team of four people passionate about memory, cinema, and human emotion.',
      p2: 'Two team members handle filming, directing, and artistic direction. Two others focus on editing and post-production.',
      p3: 'Our mission is simple: preserve what you live today, so you can find it again tomorrow.',
      mission: 'Our mission', missionText: 'We do not only film your present. We connect you with your future.',
      team1: 'Filming & Production', team2: 'Editing & Post-production',
    },
    services: {
      label: 'Services', title: 'What we create',
      items: [
        { title: 'Family memory films', desc: 'Capture your family as it is today. In one year, rediscover this precious moment.' },
        { title: 'Messages for the future', desc: 'Record your goals, dreams, emotions — and find them again in a year.' },
        { title: 'Individual interviews', desc: 'A personal moment to express yourself and leave an authentic trace.' },
        { title: 'Couple films', desc: 'Your story as a couple, filmed with care, beauty, and sincerity.' },
        { title: 'Extended family', desc: 'Several generations gathered in one cinematic film.' },
        { title: 'Annual follow-up', desc: 'Come back each year. See how you\'ve evolved, grown, changed.' },
        { title: 'Editing & Post-production', desc: 'Every video is carefully edited to create an emotional cinematic film.' },
        { title: 'QR code or USB delivery', desc: 'Receive your film by QR code or USB drive according to your preference.' },
      ],
    },
    how: {
      label: 'The process', title: 'How it works',
      steps: [
        { n: '01', title: 'Book your session', desc: 'Fill in the form. We get back to you to confirm all details.' },
        { n: '02', title: 'Choose your location', desc: 'At home, in a meaningful place — preferably an indoor space for better quality.' },
        { n: '03', title: 'Prepare the questions', desc: 'You prepare your own questions (up to 10 per person), or our team prepares them for you.' },
        { n: '04', title: 'Filming day', desc: 'Our team arrives with equipment. You express yourself freely, in a caring environment.' },
        { n: '05', title: 'Editing & Post-production', desc: 'We create a cinematic film from your footage. Every detail is carefully crafted.' },
        { n: '06', title: 'Receive your film', desc: 'Delivery by QR code or USB drive. Your film, ready to be watched.' },
        { n: '07', title: 'Watch again in a year', desc: 'One year later, rediscover your message. See what has changed.' },
      ],
    },
    offer: {
      label: 'Launch offer', title: 'Free for the first 5 families',
      sub: 'A unique offer to begin this journey with you.',
      text: 'Launch offer: the complete service is free for the first 5 families.',
      includes: ['Cinematic filming', 'Editing and post-production', 'Delivery by QR code or USB', 'Personalised support'],
      note: 'No hidden fees. No obligation. Only an optional request: your agreement to use a short extract in our portfolio.',
      consent: 'Before filming, a consent form is signed. Your privacy is fully respected.',
      cta: 'Book my free place',
      future: 'Paid packages will be available soon.',
    },
    gallery: {
      label: 'Gallery', title: 'Our work',
      empty: 'Our first examples will be available soon.',
      placeholders: ['Family film', 'Individual portrait', 'Couple film', 'Behind the scenes', 'Extended family', 'Future message'],
    },
    faq: {
      label: 'FAQ', title: 'Frequently asked questions',
      items: [
        { q: 'Is the service really free for the first 5 families?', a: 'Yes, completely free. Filming, editing, post-production and delivery. No hidden fees.' },
        { q: 'Where does filming take place?', a: 'At your chosen location: at home or a meaningful place. We recommend an indoor space for better light and sound quality.' },
        { q: 'Can we prepare our own questions?', a: 'Yes, absolutely. You can prepare up to 10 questions per person.' },
        { q: 'Can you prepare the questions for us?', a: 'Yes, our team can prepare thoughtful, emotional questions adapted to your situation.' },
        { q: 'Can individuals book this service?', a: 'Yes. This service is for families, couples, individuals, and extended families.' },
        { q: 'Do you publish our video?', a: 'Never without your written consent. Your video belongs to you entirely.' },
        { q: 'Is our privacy protected?', a: 'Completely. All videos and personal information remain confidential.' },
        { q: 'How do we receive the final video?', a: 'By digital QR code or USB drive, according to your preference.' },
        { q: 'Do we need to sign a consent form?', a: 'Yes, before filming. This document protects your privacy and specifies your publication choices.' },
        { q: 'What cities do you cover?', a: 'Dijon, Nevers, and approximately 70 km around these cities. Contact us to check your area.' },
      ],
    },
    contact: {
      label: 'Contact', title: 'Let\'s talk about your project',
      sub: 'We\'re here to answer your questions.',
      zone: 'Service area: Dijon, Nevers and approximately 70 km around.',
      email: 'contact@messagepourdemain.fr', phone: '+33 (0)X XX XX XX XX',
      whatsapp: 'Message on WhatsApp', send: 'Send message',
      name: 'Full name', emailField: 'Email address',
      phoneField: 'Phone', message: 'Your message',
    },
    booking: {
      label: 'Booking', title: 'Book your session',
      sub: 'Simple, quick and no commitment.',
      fields: {
        name: 'Full name *', email: 'Email *', phone: 'Phone *',
        city: 'City *', people: 'Number of people to be filmed *',
        lang: 'Preferred language', location: 'Preferred location',
        date: 'Preferred date or period', questions: 'Do you want to prepare your own questions?',
        qYes: 'Yes', qNo: 'No', qMaybe: 'Not sure yet',
        qNote: 'Up to 10 questions per person.',
        consent: 'I agree to be contacted to confirm the details.',
        submit: 'Send my request',
      },
      success: 'Thank you! We will get back to you very soon.',
    },
    privacy: {
      title: 'Privacy Policy',
      note: 'This text is an informational draft and should be reviewed by a professional before publication.',
    },
    terms: {
      title: 'Terms and Conditions',
      note: 'These terms are an informational draft and should be reviewed before publication.',
    },
    footer: {
      tagline: 'A film for today. A message for tomorrow.',
      privacy: 'Privacy Policy', terms: 'Terms and Conditions',
      rights: '© 2025 Message pour Demain. All rights reserved.',
    },
  },
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('fr')
  const t = translations[lang]
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
