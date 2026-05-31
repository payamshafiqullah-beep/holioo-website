import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext'

export default function Header() {
  const { lang, setLang, t } = useLang()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [loc])

  const navItems = [
    { href: '/', key: 'home' },
    { href: '/a-propos', key: 'about' },
    { href: '/services', key: 'services' },
    { href: '/comment-ca-marche', key: 'how' },
    { href: '/offre-gratuite', key: 'offer' },
    { href: '/galerie', key: 'gallery' },
    { href: '/faq', key: 'faq' },
    { href: '/contact', key: 'contact' },
  ]

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      scrolled ? 'bg-cream/95 backdrop-blur-sm border-b border-beige shadow-sm' : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-6 md:px-10 flex items-center justify-between h-16 md:h-20">
        <Link to="/" className="flex flex-col leading-none group">
          <span className="font-serif text-lg md:text-xl font-light text-charcoal tracking-wide group-hover:text-warm transition-colors">
            Message pour Demain
          </span>
          <span className="font-sans text-[10px] tracking-[0.2em] uppercase text-stone mt-0.5">
            Films cinématographiques
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {navItems.map(item => (
            <Link key={item.key} to={item.href} className="nav-link">
              {t.nav[item.key]}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-1">
            <button onClick={() => setLang('fr')} className={`font-sans text-xs font-medium tracking-widest transition-colors duration-200 ${lang === 'fr' ? 'text-charcoal' : 'text-taupe hover:text-stone'}`}>FR</button>
            <span className="text-taupe text-xs">/</span>
            <button onClick={() => setLang('en')} className={`font-sans text-xs font-medium tracking-widest transition-colors duration-200 ${lang === 'en' ? 'text-charcoal' : 'text-taupe hover:text-stone'}`}>EN</button>
          </div>
          <Link to="/reservation" className="hidden md:block btn-primary text-xs py-2.5 px-5">{t.nav.book}</Link>
          <button className="lg:hidden flex flex-col gap-1.5 p-1" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <span className={`block w-5 h-px bg-charcoal transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-px bg-charcoal transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-px bg-charcoal transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`lg:hidden transition-all duration-300 overflow-hidden ${menuOpen ? 'max-h-screen' : 'max-h-0'}`}>
        <div className="bg-cream/98 backdrop-blur-sm border-t border-beige px-6 py-6 flex flex-col gap-5">
          {navItems.map(item => (
            <Link key={item.key} to={item.href} className="nav-link text-base">{t.nav[item.key]}</Link>
          ))}
          <Link to="/reservation" className="btn-primary text-center mt-2">{t.nav.book}</Link>
        </div>
      </div>
    </header>
  )
}
