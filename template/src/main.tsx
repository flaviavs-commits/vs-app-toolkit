import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// A fonte do app, servida pelo próprio app (sem Google Fonts). Troque o pacote e o
// fontFamily do tailwind.config.js juntos.
import '@fontsource-variable/inter'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
