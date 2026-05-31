import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function Services() {
  const { t } = useLang()
  const s = t.services
  return (
    <div className="pt-20">
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{s.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{s.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>
      <section className="py-20 bg-cream">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-beige">
            {s.items.map((item, i) => (
              <ScrollReveal key={i} delay={(i % 2) * 80}>
                <div className="bg-cream p-10 md:p-12 hover:bg-white transition-colors duration-300">
                  <p className="font-serif text-xs text-stone mb-5">{String(i+1).padStart(2,'0')}</p>
                  <h3 className="font-serif text-2xl font-medium text-charcoal mb-4">{item.title}</h3>
                  <div className="w-8 h-px bg-taupe mb-5" />
                  <p className="font-sans text-sm font-light text-warm leading-relaxed">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
