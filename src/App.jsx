import { useMemo, useState } from 'react'
import './App.css'

const contactEmail = 'holioofamily@gmail.com'

const copy = {
  fr: {
    nav: ['A propos', 'Pourquoi', 'Processus', 'Videos', 'Contact'],
    hero: {
      eyebrow: 'Studio familial cinematographique',
      title: 'Your family story, beautifully filmed every year.',
      subtitle:
        'A cinematic yearly film for your family - memories, dreams, growth, and messages to your future selves.',
      primary: 'Book your session',
      secondary: 'Discover how it works',
      note: 'Les 5 premieres familles participent gratuitement.',
    },
    aboutTitle: 'Holioo transforme une annee de famille en film intime.',
    about:
      'Chaque annee, nous venons chez vous pour filmer les visages, les voix, les souvenirs et les reves qui racontent votre famille. Le film devient une capsule temporelle: un moment calme a revoir plus tard, avec emotion.',
    whyTitle: 'La vie change vite. Les souvenirs les plus vrais disparaissent doucement.',
    why:
      'Les enfants grandissent, les parents changent, les maisons evoluent. Les photos gardent les images, mais elles ne gardent pas toujours les voix, les silences, les rires, les reves et les messages.',
    stepsTitle: 'Un processus simple, humain, et fait pour durer.',
    steps: [
      ['We visit your home', 'Une seance naturelle dans l endroit ou votre vie existe vraiment.'],
      ['We film your family', 'Parents, enfants, gestes, regards, pieces et details du quotidien.'],
      ['We capture your memories and messages', 'Des questions simples font remonter souvenirs, emotions et messages au futur.'],
      ['One year later, you watch your story again and continue it', 'Vous revoyez le film, comparez la vie qui a change, puis commencez le chapitre suivant.'],
    ],
    videosTitle: 'Deux espaces prets pour vos videos Holioo.',
    videosText: 'Remplacez les fichiers dans public/videos/ et public/video-thumbnails/ quand vos films sont prets.',
    captureTitle: 'Les details qui deviennent votre archive vivante.',
    offerTitle: 'First 5 families free.',
    offer:
      'Pour lancer Holioo avec soin, les 5 premieres familles peuvent participer gratuitement. Une offre fondatrice, privee et realisee avec confiance.',
    contactTitle: 'Demandez votre premiere seance Holioo.',
    contact:
      'Le formulaire est pret pour Formspree. Vous pouvez aussi nous ecrire directement par email.',
    form: ['Full name', 'Email', 'City', 'Preferred language', 'Preferred filming period', 'Message'],
    submit: 'Request a session',
    privacy: 'We never publish family videos without permission.',
    footer: 'Premium yearly family films for the future.',
  },
  en: {
    nav: ['About', 'Why', 'Process', 'Videos', 'Contact'],
    hero: {
      eyebrow: 'Cinematic family studio',
      title: 'Your family story, beautifully filmed every year.',
      subtitle:
        'A cinematic yearly film for your family - memories, dreams, growth, and messages to your future selves.',
      primary: 'Book your session',
      secondary: 'Discover how it works',
      note: 'The first 5 families can participate for free.',
    },
    aboutTitle: 'Holioo turns one year of family life into an intimate film.',
    about:
      'Every year, we visit your home to film the faces, voices, memories, and dreams that tell the truth of your family. The film becomes a time capsule: something calm and emotional to reopen later.',
    whyTitle: 'Life changes fast. The truest memories disappear quietly.',
    why:
      'Children grow, parents change, homes evolve. Photos preserve images, but they do not always preserve voices, pauses, laughter, dreams, and the messages we wish we could hear again.',
    stepsTitle: 'A simple, human process designed to become more meaningful each year.',
    steps: [
      ['We visit your home', 'A calm session in the place where your family life actually happens.'],
      ['We film your family', 'Parents, children, gestures, rooms, and small details.'],
      ['We capture your memories and messages', 'Simple questions bring out memories, emotions, dreams, and future messages.'],
      ['One year later, you watch your story again and continue it', 'You watch, compare what changed, and begin the next chapter.'],
    ],
    videosTitle: 'Two polished spaces ready for your Holioo videos.',
    videosText: 'Replace files in public/videos/ and public/video-thumbnails/ when your films are ready.',
    captureTitle: 'The details that become your living archive.',
    offerTitle: 'First 5 families free.',
    offer:
      'To launch Holioo with care, the first 5 families can participate for free. A private founding offer created with trust.',
    contactTitle: 'Request your first Holioo session.',
    contact:
      'The form is prepared for Formspree. You can also contact us directly by email.',
    form: ['Full name', 'Email', 'City', 'Preferred language', 'Preferred filming period', 'Message'],
    submit: 'Request a session',
    privacy: 'We never publish family videos without permission.',
    footer: 'Premium yearly family films for the future.',
  },
}

const captureItems = [
  'Children growth',
  'Parents messages',
  'Family dreams',
  'Yearly memories',
  'Home atmosphere',
  'Real voices and emotions',
  'Messages to the future',
]

function Header({ language, setLanguage, t }) {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Holioo home">
        <span>H</span>
        <strong>Holioo</strong>
      </a>
      <nav aria-label="Page sections">
        {['about', 'why', 'process', 'videos', 'contact'].map((id, index) => (
          <a key={id} href={`#${id}`}>
            {t.nav[index]}
          </a>
        ))}
      </nav>
      <div className="language-switcher" aria-label="Language switcher">
        {['fr', 'en'].map((code) => (
          <button
            key={code}
            type="button"
            className={language === code ? 'active' : ''}
            onClick={() => setLanguage(code)}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  )
}

function Hero({ t }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 })

  const handlePointerMove = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    setPointer({ x, y })
  }

  const heroStyle = {
    '--hero-x': `${pointer.x.toFixed(4)}`,
    '--hero-y': `${pointer.y.toFixed(4)}`,
    '--glow-x': `${(pointer.x + 0.5) * 100}%`,
    '--glow-y': `${(pointer.y + 0.5) * 100}%`,
  }

  return (
    <section
      className="hero section-shell"
      id="top"
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setPointer({ x: 0, y: 0 })}
      style={heroStyle}
    >
      <video className="hero-background-video" autoPlay muted loop playsInline aria-hidden="true">
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>
      <div className="hero-video-overlay" aria-hidden="true" />
      <div className="hero-cursor-glow" aria-hidden="true" />

      <div className="hero-copy reveal">
        <p className="eyebrow">{t.hero.eyebrow}</p>
        <h1>{t.hero.title}</h1>
        <p>{t.hero.subtitle}</p>
        <div className="actions">
          <a className="button primary" href="#contact">
            {t.hero.primary}
          </a>
          <a className="button ghost" href="#process">
            {t.hero.secondary}
          </a>
        </div>
        <span className="founding-note">{t.hero.note}</span>
      </div>

      <div className="hero-visual reveal" aria-label="Cinematic family memory preview">
        <div className="hero-visual-orbit" aria-hidden="true" />
        <div className="hero-film-card">
          <div className="hero-film-screen">
            <video autoPlay muted loop playsInline aria-hidden="true">
              <source src="/videos/hero.mp4" type="video/mp4" />
            </video>
            <div className="hero-film-vignette" />
          </div>
          <div className="hero-film-meta">
            <span>Holioo archive</span>
            <strong>01: Future memory</strong>
          </div>
        </div>

        <div className="memory-card memory-card-one">
          <span>Voice</span>
          <strong>Real laughter</strong>
        </div>
        <div className="memory-card memory-card-two">
          <span>Year</span>
          <strong>2025 chapter</strong>
        </div>
        <div className="memory-card memory-card-three">
          <span>Private</span>
          <strong>Family film</strong>
        </div>
      </div>
    </section>
  )
}

function VideoCard({ label, title, poster, src }) {
  return (
    <article className="video-card reveal">
      <div className="video-frame">
        {/* Replace this poster with your own thumbnail in public/video-thumbnails/. */}
        <video controls preload="none" poster={poster} aria-label={title}>
          {/* Replace this source with your real video file in public/videos/. */}
          <source src={src} type="video/mp4" />
        </video>
        <span>Play</span>
      </div>
      <small>{label}</small>
      <h3>{title}</h3>
    </article>
  )
}

function Contact({ t, language }) {
  return (
    <section className="contact section-shell" id="contact">
      <div className="section-title reveal">
        <p className="eyebrow">Booking</p>
        <h2>{t.contactTitle}</h2>
        <p>{t.contact}</p>
        <a className="button primary" href={`mailto:${contactEmail}?subject=Holioo booking request`}>
          Email Holioo
        </a>
        <p className="privacy">{t.privacy}</p>
      </div>
      {/* Paste your real Formspree endpoint in the action below, replacing /f/your-form-id. */}
      <form className="booking-form reveal" action="https://formspree.io/f/your-form-id" method="POST">
        <label>{t.form[0]}<input name="name" type="text" autoComplete="name" required /></label>
        <label>{t.form[1]}<input name="email" type="email" autoComplete="email" required /></label>
        <label>{t.form[2]}<input name="city" type="text" autoComplete="address-level2" /></label>
        <label>{t.form[3]}<select name="preferred_language" defaultValue={language}><option value="fr">Francais</option><option value="en">English</option></select></label>
        <label>{t.form[4]}<input name="preferred_period" type="text" placeholder="Spring 2026" /></label>
        <label className="wide">{t.form[5]}<textarea name="message" rows="5" required /></label>
        <button type="submit">{t.submit}</button>
      </form>
    </section>
  )
}

export default function App() {
  const [language, setLanguage] = useState('fr')
  const t = useMemo(() => copy[language], [language])

  return (
    <>
      <Header language={language} setLanguage={setLanguage} t={t} />
      <main>
        <Hero t={t} />

        <section className="split section-shell" id="about">
          <div className="section-title reveal">
            <p className="eyebrow">About Holioo</p>
            <h2>{t.aboutTitle}</h2>
          </div>
          <article className="glass reveal"><p>{t.about}</p></article>
        </section>

        <section className="split section-shell" id="why">
          <div className="section-title reveal">
            <p className="eyebrow">Why this matters</p>
            <h2>{t.whyTitle}</h2>
            <p>{t.why}</p>
          </div>
          <div className="mini-grid">
            {['Real voices', 'Annual dreams', 'Home atmosphere', 'Private archive'].map((item) => (
              <article className="mini-card reveal" key={item}>{item}</article>
            ))}
          </div>
        </section>

        <section className="section-shell" id="process">
          <div className="section-title reveal">
            <p className="eyebrow">How it works</p>
            <h2>{t.stepsTitle}</h2>
          </div>
          <div className="steps">
            {t.steps.map(([title, text], index) => (
              <article className="step-card reveal" key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-shell" id="videos">
          <div className="section-title reveal">
            <p className="eyebrow">Films</p>
            <h2>{t.videosTitle}</h2>
            <p>{t.videosText}</p>
          </div>
          <div className="videos">
            <VideoCard label="01" title="Featured film" poster="/video-thumbnails/featured-holioo.svg" src="/videos/featured-family-film.mp4" />
            <VideoCard label="02" title="Second excerpt" poster="/video-thumbnails/second-holioo.svg" src="/videos/second-family-film.mp4" />
          </div>
        </section>

        <section className="section-shell">
          <div className="section-title reveal">
            <p className="eyebrow">What we capture</p>
            <h2>{t.captureTitle}</h2>
          </div>
          <div className="bento">
            {captureItems.map((item, index) => (
              <article className={`bento-card reveal ${index === 0 ? 'large' : ''}`} key={item}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{item}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="section-shell offer">
          <div className="offer-card reveal">
            <p className="eyebrow">Founding offer</p>
            <h2>{t.offerTitle}</h2>
            <p>{t.offer}</p>
            <div>{[1, 2, 3, 4, 5].map((slot) => <span key={slot}>{String(slot).padStart(2, '0')}</span>)}</div>
          </div>
        </section>

        <Contact t={t} language={language} />
      </main>
      <footer className="site-footer">
        <strong>Holioo</strong>
        <span>{t.footer}</span>
        <a href="#contact">Booking</a>
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </footer>
    </>
  )
}
