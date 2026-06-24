import { useState } from 'react'
import './App.css'

const steps = [
  ['01', 'Choose a date', 'Pick a calm day at home and tell us who will be part of your recording.'],
  ['02', 'Record at home', 'We bring the camera, sound, lights, and gentle prompts so everyone feels relaxed.'],
  ['03', 'Receive your family film', 'Your edited video is delivered privately in a beautiful, easy-to-share format.'],
  ['04', 'Keep it for the future', 'Store voices, stories, and messages that your family can return to for years.'],
]

const benefits = [
  'Preserve the sound of the voices you love',
  'Leave heartfelt messages for children and grandchildren',
  'Create a private family archive that grows over time',
  'Offer a meaningful gift for birthdays, weddings, or anniversaries',
]

const packages = [
  {
    name: 'Basic Memory',
    price: 'From $450',
    description: 'A focused recording for one person or couple who want to preserve a personal message.',
    features: ['Up to 60 minutes at home', 'Guided interview', 'Edited 5–7 minute film'],
  },
  {
    name: 'Family Film',
    price: 'From $850',
    description: 'Our most loved package for parents, children, and grandparents recording together.',
    features: ['Half-day home session', 'Professional lighting and sound', 'Edited 10–15 minute family film'],
    highlighted: true,
  },
  {
    name: 'Premium Archive',
    price: 'Custom',
    description: 'A deeper documentary-style keepsake with multiple voices, locations, and legacy moments.',
    features: ['Full-day production', 'Extended family participation', 'Private digital archive'],
  },
]

const faqs = [
  ['How long does it take?', 'Most home sessions take two to four hours, depending on the package and number of family members.'],
  ['Where do we film?', 'We usually film in your home, where the atmosphere feels familiar, personal, and comfortable.'],
  ['Is the video private?', 'Yes. Your videos are delivered through a private link and are never shared publicly without permission.'],
  ['Can children participate?', 'Absolutely. We keep the process gentle, playful, and flexible so children can be themselves.'],
  ['How do we receive the video?', 'You receive a polished digital film, plus optional downloadable files for safekeeping.'],
]

function Header() {
  return (
    <header className="site-header">
      <a className="logo" href="#home" aria-label="Holioo home">
        <span className="logo-mark">H</span>
        <span>Holioo</span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#how-it-works">How It Works</a>
        <a href="#packages">Packages</a>
        <a href="#about">About</a>
        <a href="#faq">FAQ</a>
      </nav>
      <a className="button button-small" href="#contact">Book a Session</a>
    </header>
  )
}

function HeroVisual() {
  return (
    <div className="hero-visual">
      <video
        className="hero-video"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        preload="auto"
      >
        <source src="/videos/hero-camera-explode.mp4" type="video/mp4" />
      </video>
    </div>
  )
}

function App() {
  const [formStatus, setFormStatus] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    setFormStatus('Thank you. We will reply soon to plan your family recording session.')
  }

  return (
    <>
      <Header />
      <main id="home">
        <section className="hero section-grid">
          <div className="hero-copy">
            <p className="eyebrow">Family video memories, recorded with care</p>
            <h1>Preserve the voices, stories, and love your family will want forever.</h1>
            <p className="hero-subtitle">
              Holioo helps families record emotional video messages at home with a professional setup,
              gentle guidance, and a finished film made for the future.
            </p>
            <div className="cta-row">
              <a className="button" href="#contact">Book a Session</a>
              <a className="button button-secondary" href="#how-it-works">See How It Works</a>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section className="problem section-narrow" id="about">
          <p className="eyebrow">Why record now</p>
          <h2>Memories fade. Voices change. Family stories can disappear quietly with time.</h2>
          <p>
            A video message captures more than words. It keeps the pauses, laughter, expressions,
            and warmth that photos and written notes cannot hold. Recording now gives your family a
            living memory to revisit when it matters most.
          </p>
        </section>

        <section className="service section-grid">
          <div className="image-panel" role="img" aria-label="Placeholder image of a family interview filmed at home" />
          <div>
            <p className="eyebrow">What we do</p>
            <h2>A simple, guided recording experience in the comfort of your home.</h2>
            <p>
              Your family sits together at home while our team creates a calm, professional filming
              setup. We guide the conversation with thoughtful prompts, record beautiful sound and
              image, then deliver a private final video you can keep, gift, or archive.
            </p>
          </div>
        </section>

        <section className="how" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">How it works</p>
            <h2>Four gentle steps from first call to family keepsake.</h2>
          </div>
          <div className="steps-grid">
            {steps.map(([number, title, text]) => (
              <article className="card step-card" key={title}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="benefits section-grid">
          <div>
            <p className="eyebrow">Emotional benefits</p>
            <h2>A film your family can feel, not just watch.</h2>
          </div>
          <div className="benefit-list">
            {benefits.map((benefit) => <p key={benefit}>{benefit}</p>)}
          </div>
        </section>

        <section className="trust">
          <div className="trust-card"><strong>Professional filming</strong><span>Camera, lighting, and sound handled for you.</span></div>
          <div className="trust-card"><strong>Private and secure</strong><span>Your videos stay private unless you choose to share.</span></div>
          <div className="trust-card"><strong>Simple process</strong><span>We plan the session and guide every step.</span></div>
          <div className="trust-card"><strong>Family-friendly</strong><span>Warm prompts and a relaxed pace for every age.</span></div>
        </section>

        <section className="packages" id="packages">
          <div className="section-heading">
            <p className="eyebrow">Packages / Pricing</p>
            <h2>Choose the memory experience that fits your family.</h2>
          </div>
          <div className="packages-grid">
            {packages.map((pkg) => (
              <article className={`card package-card ${pkg.highlighted ? 'highlighted' : ''}`} key={pkg.name}>
                <h3>{pkg.name}</h3>
                <p className="price">{pkg.price}</p>
                <p>{pkg.description}</p>
                <ul>
                  {pkg.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <a className="button button-full" href="#contact">Request details</a>
              </article>
            ))}
          </div>
        </section>

        <section className="faq" id="faq">
          <div className="section-heading">
            <p className="eyebrow">FAQ</p>
            <h2>Questions families often ask.</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta" id="contact">
          <p className="eyebrow">Contact / Book a Session</p>
          <h2>Give your family the gift of hearing your love in your own voice.</h2>
          <p>Tell us who you would like to record, and we will help you plan a warm, meaningful session at home.</p>
          <form className="contact-form" aria-label="Session request form" onSubmit={handleSubmit}>
            <input type="text" name="name" placeholder="Your name" aria-label="Your name" />
            <input type="email" name="email" placeholder="Email address" aria-label="Email address" />
            <textarea name="message" placeholder="Tell us about your family or preferred date" aria-label="Message" rows="4" />
            <button className="button" type="submit">Request a Session</button>
            {formStatus && <p className="form-status" role="status">{formStatus}</p>}
          </form>
        </section>
      </main>
    </>
  )
}

export default App
