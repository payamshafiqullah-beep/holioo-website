import { Link } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext'

export default function Footer() {
  const { t, lang, setLang } = useLang()
  const nav = t.nav

  return (
    <footer className="bg-charcoal text-cream">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-2">
            <p className="font-serif text-2xl font-light text-cream mb-3">Message pour Demain</p>
            <p className="font-sans text-sm font-light text-taupe leading-relaxed mb-6 max-w-xs">{t.footer.tagline}</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setLang('fr')} className={`font-sans text-xs tracking-widest transition-colors ${lang==='fr'?'text-cream':'text-stone hover:text-taupe'}`}>FR</button>
              <span className="text-stone text-xs">/</span>
              <button onClick={() => setLang('en')} className={`font-sans text-xs tracking-widest transition-colors ${lang==='en'?'text-cream':'text-stone hover:text-taupe'}`}>EN</button>
            </div>
          </div>

          {/* Pages */}
          <div>
            <p className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-stone mb-5">Pages</p>
            <nav className="flex flex-col gap-3">
              {[
                {href:'/',key:'home'},{href:'/a-propos',key:'about'},
                {href:'/services',key:'services'},{href:'/offre-gratuite',key:'offer'},
                {href:'/galerie',key:'gallery'},{href:'/faq',key:'faq'},
              ].map(item => (
                <Link key={item.key} to={item.href} className="font-sans text-sm font-light text-taupe hover:text-cream transition-colors">{nav[item.key]}</Link>
              ))}
            </nav>
          </div>

          {/* Contact */}
          <div>
            <p className="font-sans text-xs font-medium tracking-[0.2em] uppercase text-stone mb-5">Contact</p>
            <div className="flex flex-col gap-3">
              {/* Replace with real email */}
              <a href="mailto:contact@messagepourdemain.fr" className="font-sans text-sm font-light text-taupe hover:text-cream transition-colors">contact@messagepourdemain.fr</a>
              {/* Replace with real phone */}
              <a href="tel:+33XXXXXXXXX" className="font-sans text-sm font-light text-taupe hover:text-cream transition-colors">+33 (0)X XX XX XX XX</a>
              <p className="font-sans text-xs text-stone leading-relaxed mt-1">Dijon · Nevers · ~70 km</p>
              {/* Social placeholders */}
              <div className="flex gap-4 mt-2">
                {['Instagram','Facebook'].map(s => (
                  <a key={s} href="#" className="font-sans text-xs text-stone hover:text-taupe transition-colors">{s}</a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-warm/20 pt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <p className="font-sans text-xs font-light text-stone">{t.footer.rights}</p>
          <div className="flex gap-6">
            <Link to="/politique-de-confidentialite" className="font-sans text-xs text-stone hover:text-taupe transition-colors">{t.footer.privacy}</Link>
            <Link to="/conditions-generales" className="font-sans text-xs text-stone hover:text-taupe transition-colors">{t.footer.terms}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
