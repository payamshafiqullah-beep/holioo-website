import { useLang } from '../contexts/LanguageContext'

const content = {
  fr: [
    { title: '1. Données collectées', body: 'Dans le cadre de votre demande de réservation ou de contact, nous collectons : nom, adresse email, numéro de téléphone, ville et informations relatives à votre projet. Ces données sont strictement nécessaires au traitement de votre demande.' },
    { title: '2. Finalité du traitement', body: 'Les données collectées sont utilisées uniquement pour vous recontacter, confirmer votre réservation et assurer le suivi de votre projet. Elles ne sont pas utilisées à des fins commerciales.' },
    { title: '3. Confidentialité des vidéos', body: 'Toutes les vidéos réalisées sont strictement confidentielles. Elles ne seront jamais publiées, partagées ou utilisées sans votre accord écrit explicite et signé.' },
    { title: '4. Publication et portfolio', body: 'Avant chaque tournage, un formulaire de consentement est signé. Vous choisissez si vous autorisez l\'utilisation d\'un extrait dans notre portfolio. Ce choix est entièrement optionnel et ne conditionne en rien la qualité ou la réalisation du service.' },
    { title: '5. Droits RGPD', body: 'Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d\'un droit d\'accès, de rectification, d\'effacement et de portabilité de vos données. Pour exercer ces droits, contactez-nous à l\'adresse : contact@messagepourdemain.fr' },
    { title: '6. Conservation des données', body: 'Vos données personnelles sont conservées le temps nécessaire à la réalisation de votre projet, puis supprimées ou anonymisées conformément à la réglementation en vigueur.' },
  ],
  en: [
    { title: '1. Data collected', body: 'As part of your booking or contact request, we collect: name, email address, phone number, city and information about your project. This data is strictly necessary to process your request.' },
    { title: '2. Purpose of processing', body: 'Collected data is used solely to contact you, confirm your booking and follow up on your project. It is not used for commercial purposes.' },
    { title: '3. Video confidentiality', body: 'All videos produced are strictly confidential. They will never be published, shared or used without your explicit written consent.' },
    { title: '4. Publication and portfolio', body: 'Before each filming session, a consent form is signed. You choose whether you allow a short extract to be used in our portfolio. This choice is entirely optional and does not affect the quality or delivery of the service.' },
    { title: '5. GDPR rights', body: 'In accordance with the General Data Protection Regulation (GDPR), you have the right to access, rectify, delete and port your data. To exercise these rights, contact us at: contact@messagepourdemain.fr' },
    { title: '6. Data retention', body: 'Your personal data is kept for the time necessary to complete your project, then deleted or anonymised in accordance with applicable regulations.' },
  ]
}

export default function Privacy() {
  const { t, lang } = useLang()
  const items = content[lang]
  return (
    <div className="pt-20">
      <section className="py-24 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <h1 className="font-serif font-light text-cream" style={{fontSize:'clamp(2rem,5vw,3.5rem)'}}>{t.privacy.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>
      <section className="py-20 bg-cream">
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          <div className="p-6 bg-beige border-l-4 border-gold mb-12">
            <p className="font-sans text-sm font-light text-warm">{t.privacy.note}</p>
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
