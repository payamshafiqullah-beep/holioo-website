import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function HowItWorks() {
  const { t } = useLang()
  const h = t.how
  return (
    <div className="pt-20">
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{h.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{h.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>
      <section className="py-20 bg-cream">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <div className="space-y-0">
            {h.steps.map((step, i) => (
              <ScrollReveal key={i} delay={i * 60}>
                <div className="flex gap-8 md:gap-16 py-12 border-b border-beige last:border-b-0">
                  <div className="flex-shrink-0 pt-1">
                    <p className="font-serif text-5xl md:text-6xl font-light text-beige leading-none">{step.n}</p>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-serif text-2xl md:text-3xl font-light text-charcoal mb-4">{step.title}</h3>
                    <p className="font-sans text-sm font-light text-warm leading-relaxed max-w-xl">{step.desc}</p>
                    {i === 2 && (
                      <div className="mt-4 p-5 bg-beige border-l-2 border-gold">
                        <p className="font-sans text-xs font-light text-warm">{t.booking.fields.qNote}</p>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal>
            <div className="mt-16 text-center">
              <Link to="/reservation" className="btn-primary">{t.offer.cta}</Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  )
}
