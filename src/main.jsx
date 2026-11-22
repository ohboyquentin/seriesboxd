import ReactDOM from 'react-dom/client'
import SeriesBoxd from './seriesboxd.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(<SeriesBoxd />)

// Service worker : uniquement en production (en dev il gênerait le rechargement à chaud)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker :', e))
  })
}
