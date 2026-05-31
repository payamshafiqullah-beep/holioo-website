import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { LanguageProvider } from './contexts/LanguageContext'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import About from './pages/About'
import Services from './pages/Services'
import HowItWorks from './pages/HowItWorks'
import Offer from './pages/Offer'
import Gallery from './pages/Gallery'
import FAQ from './pages/FAQ'
import Contact from './pages/Contact'
import Booking from './pages/Booking'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'

function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/a-propos" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/comment-ca-marche" element={<HowItWorks />} />
            <Route path="/offre-gratuite" element={<Offer />} />
            <Route path="/galerie" element={<Gallery />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/reservation" element={<Booking />} />
            <Route path="/politique-de-confidentialite" element={<Privacy />} />
            <Route path="/conditions-generales" element={<Terms />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
)
