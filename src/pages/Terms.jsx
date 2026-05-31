import { useLang } from '../contexts/LanguageContext'

const content = {
  fr: [
    { title: '1. Processus de réservation', body: 'La réservation s\'effectue via le formulaire en ligne. Après réception, notre équipe vous contacte pour confirmer les détails dans les 48 heures.' },
    { title: '2. Offre de lancement', body: 'Le service complet est offert gratuitement aux 5 premières familles. Cette offre comprend le tournage, le montage, la post-production et la livraison. Aucun frais caché.' },
    { title: '3. Formulaire de consentement', body: 'Un formulaire de consentement est signé avant chaque tournage. Il précise les droits sur les images, les choix de publication et les conditions de confidentialité.' },
    { title: '4. Lieu de tournage', body: 'Le client est responsable du choix et de la mise à disposition du lieu de tournage. Nous recommandons un espace fermé pour une meilleure qualité.' },
    { title: '5. Livraison', body: 'La vidéo finale est livrée par QR code numérique ou clé USB, selon le choix du client. Les délais de livraison seront précisés lors de la confirmation de réservation.' },
    { title: '6. Publication', body: 'Aucune vidéo, photo ou extrait ne sera publié sans accord écrit explicite du client. Le refus de publication ne conditionne en rien la qualité du service rendu.' },
    { title: '7. Annulation et report', body: 'En cas d\'annulation ou de report de la part du client, nous demanderons un préavis raisonnable. En cas d\'imprévu de notre côté, nous proposerons un report sans frais.' },
  ],
  en: [
    { title: '1. Booking process', body: 'Booking is done via the online form. After receipt, our team contacts you to confirm details within 48 hours.' },
    { title: '2. Launch offer', body: 'The complete service is offered free of charge to the first 5 families. This includes filming, editing, post-production and delivery. No hidden fees.' },
    { title: '3. Consent form', body: 'A consent form is signed before each filming session. It specifies image rights, publication choices and confidentiality conditions.' },
    { title: '4. Filming location', body: 'The client is responsible for choosing and providing the filming location. We recommend an indoor space for better quality.' },
    { title: '5. Delivery', body: 'The final video is delivered by digital QR code or USB drive, according to the client\'s choice. Delivery times will be specified upon booking confirmation.' },
    { title: '6. Publication', body: 'No video, photo or extract will be published without the client\'s explicit written consent. Refusing publication does not affect the quality of service.' },
    { title: '7. Cancellation and rescheduling', body: 'In the event of cancellation or rescheduling by the client, we request reasonable notice. If unexpected events occur on our side, we will offer rescheduling at no cost.' },
  ]
}

export default function Terms() {
  const { t, lang } = useLang()
  const items = content[lang]
  return (
    <div className="pt-20">
      <section className="py-24 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <h1 className="font-serif font-light text-cream" style={{fontSize:'clamp(2rem,5vw,3.5rem)'}}>{t.terms.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>
      <section className="py-20 bg-cream">
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          <div className="p-6 bg-beige border-l-4 border-gold mb-12">
            <p className="font-sans text-sm font-light text-warm">{t.terms.note}</p>
          </div>
          <div className="space-y-10">
            {items.map((item, i) => (
              <div key={i}>
                <h2 className="font-serif text-xl font-medium text-charcoal mb-4">{item.title}</h2>
                <p className="font-sans text-sm font-light text-warm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
