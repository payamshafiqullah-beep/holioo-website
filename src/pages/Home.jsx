import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

function CinematicHero() {
  const { t } = useLang()
  const h = t.hero
  return (
    <section className="relative min-h-screen flex items-end pb-20 md:pb-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#2C2825] via-[#3D352D] to-[#4A3F35]" />
      <div className="absolute inset-0 opacity-10" style={{backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`}} />
      <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-[#B8956A]/30 via-[#B8956A]/5 to-transparent" />
      <div className="absolute top-0 left-0 right-0 h-20 bg-[#2C2825]" />
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#2C2825]" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full">
        <div className="max-w-3xl">
          <div className="animate-fade-up delay-100 inline-flex items-center gap-3 mb-10">
            <div className="w-8 h-px bg-gold" />
            <span className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-gold">{h.offer}</span>
          </div>
          <h1 className="animate-fade-up delay-200 font-serif font-light text-cream leading-[1.1] mb-6" style={{fontSize:'clamp(2.5rem,7vw,5.5rem)'}}>
            {h.tagline}
          </h1>
          <div className="animate-fade-up delay-300 w-16 h-px bg-taupe mb-8" />
          <p className="animate-fade-up delay-300 font-sans font-light text-taupe text-lg leading-relaxed mb-12 max-w-xl">{h.sub}</p>
          <div className="animate-fade-up delay-400 flex flex-wrap gap-4">
            <Link to="/reservation" className="btn-gold">{h.cta1}</Link>
            <Link to="/comment-ca-marche" className="inline-block px-7 py-4 border border-taupe/50 text-taupe font-sans text-sm font-medium tracking-wide transition-all duration-300 hover:border-cream hover:text-cream">{h.cta2}</Link>
          </div>
        </div>
      </div>
      <div className="absolute bottom-20 right-10 hidden md:block text-right animate-fade-up delay-500">
        <p className="font-serif text-8xl font-light text-white/5 leading-none">2025</p>
        <p className="font-sans text-xs tracking-[0.3em] uppercase text-stone mt-1">Aujourd'hui</p>
      </div>
    </section>
  )
}

function ConceptSection() {
  const { t } = useLang()
  return (
    <section className="py-24 md:py-36 bg-cream">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          <ScrollReveal>
            <span className="section-label block mb-6">{t.about.mission}</span>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-charcoal leading-tight mb-8">{t.about.missionText}</h2>
            <div className="w-12 h-px bg-taupe mb-8" />
            <p className="font-sans font-light text-warm text-base leading-relaxed mb-4">{t.about.p1}</p>
            <p className="font-sans font-light text-warm text-base leading-relaxed mb-8">{t.about.p3}</p>
            <Link to="/a-propos" className="btn-outline text-xs">{t.nav.about} →</Link>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <div className="grid grid-cols-2 gap-3">
              <div className="cinematic-placeholder aspect-portrait rounded-sm" style={{background:'linear-gradient(160deg,#EDE8E1,#C4B8A8)',aspectRatio:'3/4',minHeight:'200px'}}>
                <div className="absolute inset-0 flex items-end p-5"><p className="font-serif text-xs italic text-charcoal/50 relative z-10">Famille · 2024</p></div>
              </div>
              <div className="cinematic-placeholder rounded-sm mt-8" style={{background:'linear-gradient(160deg,#C4B8A8,#9B8E7E)',aspectRatio:'3/4',minHeight:'200px'}}>
                <div className="absolute inset-0 flex items-end p-5"><p className="font-serif text-xs italic text-cream/60 relative z-10">Souvenir · 2025</p></div>
              </div>
              <div className="cinematic-placeholder col-span-2 rounded-sm" style={{background:'linear-gradient(135deg,#EDE8E1,#B8956A,#9B8E7E)',aspectRatio:'16/9'}}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center relative z-10">
                    <div className="w-10 h-10 border border-charcoal/30 rounded-full flex items-center justify-center mx-auto mb-2">
                      <div className="border-t-4 border-b-4 border-l-8 border-transparent ml-0.5" style={{borderLeftColor:'rgba(44,40,37,0.4)'}} />
                    </div>
                    <p className="font-sans text-xs text-charcoal/40 tracking-widest uppercase">Votre film</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}

function ServicesPreview() {
  const { t } = useLang()
  const shown = t.services.items.slice(0, 4)
  return (
    <section className="py-24 md:py-36 bg-beige">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <ScrollReveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
            <div>
              <span className="section-label block mb-4">{t.services.label}</span>
              <h2 className="font-serif text-4xl md:text-5xl font-light text-charcoal">{t.services.title}</h2>
            </div>
            <Link to="/services" className="btn-outline text-xs self-start">{t.nav.services} →</Link>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-taupe/20">
          {shown.map((item, i) => (
            <ScrollReveal key={i} delay={i * 80}>
              <div className="bg-cream p-10 h-full hover:bg-white transition-colors duration-300">
                <p className="font-serif text-xs text-stone mb-4">0{i+1}</p>
                <h3 className="font-serif text-xl font-medium text-charcoal mb-3">{item.title}</h3>
                <p className="font-sans text-sm font-light text-warm leading-relaxed">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function OfferBanner() {
  const { t } = useLang()
  const o = t.offer
  return (
    <section className="bg-charcoal py-20 md:py-28">
      <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
        <ScrollReveal>
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="w-8 h-px bg-gold" />
            <span className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-gold">{o.label}</span>
            <div className="w-8 h-px bg-gold" />
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-light text-cream leading-tight mb-6">{o.title}</h2>
          <p className="font-sans font-light text-taupe text-base leading-relaxed mb-10 max-w-xl mx-auto">{o.note}</p>
          <Link to="/reservation" className="btn-gold">{o.cta}</Link>
          <p className="font-sans text-xs text-stone mt-6">{o.future}</p>
        </ScrollReveal>
      </div>
    </section>
  )
}

export default function Home() {
  return (<><CinematicHero /><ConceptSection /><ServicesPreview /><OfferBanner /></>)
}
