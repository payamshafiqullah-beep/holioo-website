import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function About() {
  const { t } = useLang()
  const a = t.about
  return (
    <div className="pt-20">
      {/* Header */}
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{a.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{a.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>

      {/* Mission */}
      <section className="py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <ScrollReveal>
            <h2 className="font-serif text-3xl md:text-4xl font-light text-charcoal mb-8 leading-tight italic">"{a.missionText}"</h2>
            <div className="w-12 h-px bg-taupe mb-8" />
            <p className="font-sans font-light text-warm leading-relaxed mb-5">{a.p1}</p>
            <p className="font-sans font-light text-warm leading-relaxed mb-5">{a.p2}</p>
            <p className="font-sans font-light text-warm leading-relaxed">{a.p3}</p>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <div className="bg-beige p-12 border border-taupe/30">
              <div className="grid grid-cols-2 gap-8">
                {[
                  { num: '4', label: 'Membres' }, { num: '2', label: a.team1 },
                  { num: '2', label: a.team2 }, { num: '5', label: 'Familles offertes' }
                ].map((item, i) => (
                  <div key={i}>
                    <p className="font-serif text-5xl font-light text-gold mb-2">{item.num}</p>
                    <p className="font-sans text-xs font-light text-warm leading-snug">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 bg-beige">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <ScrollReveal><h2 className="font-serif text-3xl md:text-4xl font-light text-charcoal mb-16">Notre équipe</h2></ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { role: a.team1, n: '× 2', desc: 'Direction artistique, mise en scène, cadrage et captation sonore.' },
              { role: a.team2, n: '× 2', desc: 'Montage cinématographique, étalonnage, musique et livraison finale.' }
            ].map((m, i) => (
              <ScrollReveal key={i} delay={i * 100}>
                <div className="bg-cream p-10 border border-beige">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-charcoal flex items-center justify-center">
                      <p className="font-serif text-cream text-xs">{m.n}</p>
                    </div>
                    <h3 className="font-serif text-xl text-charcoal">{m.role}</h3>
                  </div>
                  <p className="font-sans text-sm font-light text-warm leading-relaxed">{m.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
