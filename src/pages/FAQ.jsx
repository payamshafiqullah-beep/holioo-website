import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

function FAQItem({ q, a, i }) {
  const [open, setOpen] = useState(false)
  return (
    <ScrollReveal delay={i * 40}>
      <div className="border-b border-beige">
        <button
          className="w-full flex items-start justify-between py-6 text-left gap-4"
          onClick={() => setOpen(!open)}
        >
          <span className="font-sans text-sm font-light text-charcoal leading-relaxed pr-4">{q}</span>
          <span className={`flex-shrink-0 w-5 h-5 border border-taupe flex items-center justify-center transition-transform duration-300 mt-0.5 ${open ? 'rotate-45' : ''}`}>
            <span className="font-serif text-taupe text-lg leading-none" style={{marginTop:'-2px'}}>+</span>
          </span>
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-48 pb-6' : 'max-h-0'}`}>
          <p className="font-sans text-sm font-light text-warm leading-relaxed max-w-2xl">{a}</p>
        </div>
      </div>
    </ScrollReveal>
  )
}

export default function FAQ() {
  const { t } = useLang()
  const f = t.faq
  return (
    <div className="pt-20">
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{f.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{f.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>
      <section className="py-20 bg-cream">
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          {f.items.map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} i={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
