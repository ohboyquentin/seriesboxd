import ReactDOM from 'react-dom/client'
import SeriesBoxd from './App.jsx'

// Polices servies par l'app elle-même (plus d'appel à Google Fonts)
import '@fontsource/dm-sans/300.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/playfair-display/700.css'

ReactDOM.createRoot(document.getElementById('root')).render(<SeriesBoxd />)

// Service worker : uniquement en production (en dev il gênerait le rechargement à chaud)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker :', e))
  })
}
