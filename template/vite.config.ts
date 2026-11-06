import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // A CSP do vercel.json (font-src 'self', img-src 'self') não aceita data:. Sem isso o Vite embute fontes e
  // imagens pequenas como data: no CSS e o navegador as bloqueia (visto no ar na Comunicação Clara).
  build: { assetsInlineLimit: 0 },
})
