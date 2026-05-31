import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function Booking() {
  const { t } = useLang()
  const b = t.booking
  const f = b.fields
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({
    name:'', email:'', phone:'', city:'', people:'1',
    lang:'fr', location:'', date:'', questions:'maybe', consent:false
  })
  const handle = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm({...form, [e.target.name]: val})
  }
  const submit = (e) => { e.preventDefault(); setSent(true) }

  return (
    <div className="pt-20">
      <section className="py-24 md:py-32 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{b.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight mb-4" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{b.title}</h1>
          <p className="font-sans font-light text-taupe text-base">{b.sub}</p>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>

      <section className="py-20 bg-cream">
        <div className="max-w-2xl mx-auto px-6 md:px-10">
          {sent ? (
            <ScrollReveal>
              <div className="text-center py-20">
                <div className="w-16 h-16 border border-gold flex items-center justify-center mx-auto mb-8">
                  <span className="text-gold text-2xl">✓</span>
                </div>
                <h2 className="font-serif text-3xl font-light text-charcoal mb-4">{b.success}</h2>
              </div>
            </ScrollReveal>
          ) : (
            <ScrollReveal>
              <form onSubmit={submit} className="space-y-10">
                {/* Basic info */}
                <div className="space-y-8">
                  <input name="name" value={form.name} onChange={handle} required placeholder={f.name} className="input-elegant" />
                  <input name="email" type="email" value={form.email} onChange={handle} required placeholder={f.email} className="input-elegant" />
                  <input name="phone" value={form.phone} onChange={handle} required placeholder={f.phone} className="input-elegant" />
                  <input name="city" value={form.city} onChange={handle} required placeholder={f.city} className="input-elegant" />
                  <input name="people" type="number" min="1" max="30" value={form.people} onChange={handle} required placeholder={f.people} className="input-elegant" />
                </div>

                {/* Language */}
                <div>
                  <p className="font-sans text-xs tracking-[0.15em] uppercase text-stone mb-4">{f.lang}</p>
                  <div className="flex gap-6">
                    {['fr','en'].map(l => (
                      <label key={l} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="lang" value={l} checked={form.lang===l} onChange={handle} className="accent-charcoal" />
                        <span className="font-sans text-sm text-charcoal">{l.toUpperCase()}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <input name="location" value={form.location} onChange={handle} placeholder={f.location} className="input-elegant" />
                <input name="date" value={form.date} onChange={handle} placeholder={f.date} className="input-elegant" />

                {/* Questions choice */}
                <div>
                  <p className="font-sans text-xs tracking-[0.15em] uppercase text-stone mb-4">{f.questions}</p>
                  <div className="flex flex-col gap-3">
                    {[['yes',f.qYes],['no',f.qNo],['maybe',f.qMaybe]].map(([val,label]) => (
                      <label key={val} className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" name="questions" value={val} checked={form.questions===val} onChange={handle} className="accent-charcoal" />
                        <span className="font-sans text-sm text-charcoal">{label}</span>
                      </label>
                    ))}
                  </div>
                  {form.questions === 'yes' && (
                    <div className="mt-4 p-5 bg-beige border-l-2 border-gold">
                      <p className="font-sans text-xs font-light text-warm">{f.qNote}</p>
                    </div>
                  )}
                </div>

                {/* Consent */}
                <label className="flex items-start gap-4 cursor-pointer">
                  <input type="checkbox" name="consent" checked={form.consent} onChange={handle} required className="mt-1 accent-charcoal flex-shrink-0" />
                  <span className="font-sans text-sm font-light text-warm leading-relaxed">{f.consent}</span>
                </label>

                <button type="submit" className="btn-gold w-full text-center py-4">{f.submit}</button>
              </form>
            </ScrollReveal>
          )}
        </div>
      </section>
    </div>
  )
}
