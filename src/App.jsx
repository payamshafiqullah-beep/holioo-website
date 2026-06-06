import './App.css'

const contactEmail = 'r.joyanda97@gmail.com'

const filmMoments = [
  'Children growth',
  'Parents messages',
  'Family dreams',
  'Goals for next year',
  'Home atmosphere',
  'Real emotions and voices',
]

const steps = [
  {
    title: 'We visit your home',
    text: 'A calm, natural filming session in the place where your family life actually happens.',
  },
  {
    title: 'We film each family member',
    text: 'Parents, children, siblings, little gestures, favorite corners, and the voices you want to remember.',
  },
  {
    title: 'You answer simple emotional questions',
    text: 'Warm prompts help every person share memories, dreams, and messages to their future self.',
  },
  {
    title: 'Next year, you watch and compare',
    text: 'You receive a new chapter and see how everyone has grown, changed, hoped, and become.',
  },
]

const questions = [
  'What made you happy this year?',
  'What do you want to remember forever?',
  'What is your dream for next year?',
  'What message do you want to send to your future self?',
]

function Header() {
  return (
    <header className="site-header" aria-label="Primary navigation">
      <a className="brand-mark" href="#top" aria-label="Family Year Film home">
        <span className="brand-symbol">FY</span>
        <span>
          Family Year Film
          <small>cinematic memory studio</small>
        </span>
      </a>
      <nav className="nav-links" aria-label="Page sections">
        <a href="#why">Why</a>
        <a href="#process">How</a>
        <a href="#free">Free places</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>
  )
}

function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="Animated family film memory cards">
      <div className="film-stage">
        <div className="memory-card memory-card-main">
          <span className="card-kicker">Chapter 01</span>
          <strong>Home, this year</strong>
          <p>Small voices, big dreams, honest moments.</p>
          <div className="frame-window">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="memory-card memory-card-top">
          <span className="record-dot" />
          <strong>Future message</strong>
          <p>Open in one year</p>
        </div>
        <div className="memory-card memory-card-bottom">
          <span>2026</span>
          <strong>Watch together</strong>
        </div>
        <div className="film-strip" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="hero-section section-shell" id="top">
      <div className="hero-copy reveal">
        <p className="eyebrow">First 5 families can participate for free</p>
        <h1>Your family story, beautifully filmed every year.</h1>
        <p className="hero-subtitle">
          A cinematic yearly film for your family - memories, dreams, growth,
          and messages to your future selves.
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#contact">
            Join the first 5 free families
          </a>
          <a className="btn btn-secondary" href="#process">
            How it works
          </a>
        </div>
        <div className="hero-proof" aria-label="Service highlights">
          <span>At-home filming</span>
          <span>Yearly tradition</span>
          <span>Private family keepsake</span>
        </div>
      </div>
      <HeroVisual />
    </section>
  )
}

function WhySection() {
  return (
    <section className="why-section section-shell" id="why">
      <div className="section-heading reveal">
        <p className="eyebrow">Why this exists</p>
        <h2>Life changes quietly. Most families only notice it later.</h2>
      </div>
      <div className="why-grid">
        <article className="story-panel reveal">
          <p>
            Children grow into new voices. Parents carry new hopes. Homes shift,
            routines change, and the little things that once felt ordinary
            become priceless.
          </p>
          <p>
            Family Year Film captures the real atmosphere of your life once a
            year, so your future family can return to the emotions, dreams, and
            honest words of this exact season.
          </p>
        </article>
        <div className="mini-bento reveal">
          <div>
            <strong>Real voices</strong>
            <span>not posed perfection</span>
          </div>
          <div>
            <strong>Year by year</strong>
            <span>a living archive</span>
          </div>
          <div>
            <strong>At home</strong>
            <span>where the story breathes</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProcessSection() {
  return (
    <section className="process-section section-shell" id="process">
      <div className="section-heading reveal">
        <p className="eyebrow">How it works</p>
        <h2>A simple ritual, designed to become more meaningful every year.</h2>
      </div>
      <div className="steps-grid">
        {steps.map((step, index) => (
          <article className="step-card reveal" key={step.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function WhatWeFilm() {
  return (
    <section className="bento-section section-shell" id="moments">
      <div className="section-heading reveal">
        <p className="eyebrow">What we film</p>
        <h2>The emotional details that become your family time capsule.</h2>
      </div>
      <div className="bento-grid">
        {filmMoments.map((moment, index) => (
          <article
            className={`bento-card reveal ${index === 0 ? 'bento-large' : ''}`}
            key={moment}
          >
            <span className="bento-index">{String(index + 1).padStart(2, '0')}</span>
            <h3>{moment}</h3>
          </article>
        ))}
      </div>
    </section>
  )
}

function FreeFamilies() {
  return (
    <section className="free-section section-shell" id="free">
      <div className="free-card reveal">
        <div>
          <p className="eyebrow">Founding family offer</p>
          <h2>First 5 families free.</h2>
          <p>
            We are opening the first chapter with a small group of families who
            want to help shape this experience. No pressure, no gimmicks - just
            an intimate cinematic session created with care.
          </p>
        </div>
        <div className="free-counter" aria-label="Five founding family places">
          <span>01</span>
          <span>02</span>
          <span>03</span>
          <span>04</span>
          <span>05</span>
        </div>
      </div>
    </section>
  )
}

function QuestionsSection() {
  return (
    <section className="questions-section section-shell">
      <div className="section-heading reveal">
        <p className="eyebrow">Example questions</p>
        <h2>Gentle prompts that bring out real memories.</h2>
      </div>
      <div className="questions-list">
        {questions.map((question) => (
          <article className="question-card reveal" key={question}>
            <span>Question</span>
            <h3>{question}</h3>
          </article>
        ))}
      </div>
    </section>
  )
}

function StorySection() {
  return (
    <section className="story-section">
      <div className="story-cinematic reveal">
        <p className="eyebrow">One year later</p>
        <h2>
          Imagine sitting together next year, watching the people you love speak
          from the past.
        </h2>
        <p>
          The same sofa. A different year. A child who sounds a little older. A
          parent who remembers what mattered. A dream that came true, or changed
          into something better. The film becomes more than a memory - it
          becomes proof that your family is growing in ways worth noticing.
        </p>
      </div>
    </section>
  )
}

function ContactSection() {
  return (
    <section className="contact-section section-shell" id="contact">
      <div className="contact-copy reveal">
        <p className="eyebrow">Start your first film</p>
        <h2>Tell us about your family and the year you want to remember.</h2>
        <p>
          The form is a visual guide for now. To apply for one of the first 5
          free family places, send a short email and we will reply personally.
        </p>
        <a className="btn btn-primary" href={`mailto:${contactEmail}?subject=Family Year Film - first 5 free families`}>
          Email {contactEmail}
        </a>
      </div>
      <form className="contact-form reveal" aria-label="Contact form preview">
        <label>
          Your name
          <input type="text" placeholder="Full name" />
        </label>
        <label>
          Email
          <input type="email" placeholder="you@example.com" />
        </label>
        <label>
          Family story
          <textarea placeholder="Tell us who you are, where you live, and why this film matters." />
        </label>
        <a className="form-submit" href={`mailto:${contactEmail}?subject=Family Year Film inquiry`}>
          Send by email
        </a>
      </form>
    </section>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <p>Family Year Film</p>
      <span>Cinematic memories for your future.</span>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhySection />
        <ProcessSection />
        <WhatWeFilm />
        <FreeFamilies />
        <QuestionsSection />
        <StorySection />
        <ContactSection />
      </main>
      <Footer />
    </>
  )
}
