import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function Offer() {
  const { t } = useLang()
  const o = t.offer
  return (
    <div className="pt-20">
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="w-8 h-px bg-gold" />
            <span className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-gold">{o.label}</span>
          </div>
          <h1 className="font-serif font-light text-cream leading-tight mb-6" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{o.title}</h1>
          <p className="font-sans font-light text-taupe text-lg">{o.sub}</p>
        </div>
      </section>

      <section className="py-24 bg-cream">
        <div className="max-w-5xl mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            <ScrollReveal>
              <h2 className="font-serif text-3xl font-light text-charcoal mb-8">{o.text}</h2>
              <div className="space-y-4 mb-10">
                {o.includes.map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-5 h-5 border border-gold flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 bg-gold" />
                    </div>
                    <p className="font-sans text-sm font-light text-charcoal">{item}</p>
                  </div>
                ))}
              </div>
              <Link to="/reservation" className="btn-gold block text-center">{o.cta}</Link>
              <p className="font-sans text-xs text-stone mt-4 text-center">{o.future}</p>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <div className="space-y-6">
                <div className="bg-beige p-8 border border-taupe/30">
                  <p className="font-serif text-xs text-stone tracking-widest uppercase mb-4">Note</p>
                  <p className="font-sans text-sm font-light text-warm leading-relaxed">{o.note}</p>
                </div>
                <div className="bg-beige p-8 border border-taupe/30">
                  <p className="font-serif text-xs text-stone tracking-widest uppercase mb-4">Consentement</p>
                  <p className="font-sans text-sm font-light text-warm leading-relaxed">{o.consent}</p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </div>
  )
}
