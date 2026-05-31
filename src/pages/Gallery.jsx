import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function Gallery() {
  const { t } = useLang()
  const g = t.gallery
  const layouts = ['16/9','3/4','16/9','3/4','16/9','3/4']
  const bgs = [
    'linear-gradient(135deg,#EDE8E1,#C4B8A8)',
    'linear-gradient(160deg,#C4B8A8,#9B8E7E)',
    'linear-gradient(135deg,#EDE8E1,#B8956A)',
    'linear-gradient(160deg,#9B8E7E,#6B5E4E)',
    'linear-gradient(135deg,#EDE8E1,#9B8E7E)',
    'linear-gradient(160deg,#C4B8A8,#B8956A)',
  ]
  return (
    <div className="pt-20">
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{g.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{g.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>

      <section className="py-20 bg-cream">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <ScrollReveal>
            <div className="text-center mb-16">
              <p className="font-serif text-xl font-light italic text-stone">{g.empty}</p>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {g.placeholders.map((label, i) => (
              <ScrollReveal key={i} delay={i * 60}>
                <div className="cinematic-placeholder rounded-sm overflow-hidden group cursor-pointer" style={{background:bgs[i],aspectRatio:layouts[i]}}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-charcoal/20">
                    <div className="w-10 h-10 border border-cream/60 rounded-full flex items-center justify-center mb-3">
                      <div className="border-t-4 border-b-4 border-l-8 border-transparent ml-0.5" style={{borderLeftColor:'rgba(248,244,239,0.8)'}} />
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-end p-5">
                    <p className="font-sans text-xs font-light text-charcoal/50 relative z-10 tracking-widest uppercase">{label}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal>
            <div className="mt-12 p-8 bg-beige border border-taupe/30 text-center">
              <p className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-stone mb-2">Portfolio</p>
              <p className="font-sans text-sm font-light text-warm">
                {/* Replace with real gallery note */}
                Les exemples vidéo et photos de nos premières familles seront ajoutés ici.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  )
}
