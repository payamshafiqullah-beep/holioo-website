import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext'
import ScrollReveal from '../components/ScrollReveal'

export default function Contact() {
  const { t } = useLang()
  const c = t.contact
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name:'', email:'', phone:'', message:'' })
  const handle = (e) => setForm({...form, [e.target.name]: e.target.value})
  const submit = (e) => { e.preventDefault(); setSent(true) }

  return (
    <div className="pt-20">
      <section className="py-24 md:py-36 bg-charcoal">
        <div className="max-w-4xl mx-auto px-6 md:px-10">
          <span className="section-label text-stone block mb-6">{c.label}</span>
          <h1 className="font-serif font-light text-cream leading-tight" style={{fontSize:'clamp(2.5rem,6vw,4.5rem)'}}>{c.title}</h1>
          <div className="w-12 h-px bg-gold mt-8" />
        </div>
      </section>

      <section className="py-20 bg-cream">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
            <ScrollReveal>
              <p className="font-sans font-light text-warm leading-relaxed mb-12">{c.sub}</p>
              <div className="space-y-6 mb-10">
                {/* Replace email */}
                <div>
                  <p className="font-sans text-xs tracking-[0.2em] uppercase text-stone mb-2">Email</p>
                  <a href={`mailto:${c.email}`} className="font-serif text-lg text-charcoal hover:text-warm transition-colors">{c.email}</a>
                </div>
                {/* Replace phone */}
                <div>
                  <p className="font-sans text-xs tracking-[0.2em] uppercase text-stone mb-2">Téléphone</p>
                  <a href="tel:+33XXXXXXXXX" className="font-serif text-lg text-charcoal hover:text-warm transition-colors">{c.phone}</a>
                </div>
                {/* WhatsApp - replace href */}
                <div>
                  <a href="https://wa.me/33XXXXXXXXX" target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-3 px-6 py-3 border border-taupe text-charcoal font-sans text-sm hover:bg-charcoal hover:text-cream hover:border-charcoal transition-all duration-300">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    {c.whatsapp}
                  </a>
                </div>
              </div>
              <p className="font-sans text-xs text-stone">{c.zone}</p>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              {sent ? (
                <div className="bg-beige p-12 text-center">
                  <div className="w-12 h-12 border border-gold flex items-center justify-center mx-auto mb-6">
                    <span className="text-gold text-xl">✓</span>
                  </div>
                  <p className="font-serif text-xl text-charcoal">{t.booking.success}</p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-8">
                  <input name="name" value={form.name} onChange={handle} required placeholder={c.name} className="input-elegant" />
                  <input name="email" type="email" value={form.email} onChange={handle} required placeholder={c.emailField} className="input-elegant" />
                  <input name="phone" value={form.phone} onChange={handle} placeholder={c.phoneField} className="input-elegant" />
                  <textarea name="message" value={form.message} onChange={handle} required placeholder={c.message} rows={5} className="input-elegant resize-none" />
                  <button type="submit" className="btn-primary w-full text-center">{c.send}</button>
                </form>
              )}
            </ScrollReveal>
          </div>
        </div>
      </section>
    </div>
  )
}
