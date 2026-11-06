/** @type {import('tailwindcss').Config} */

// As cores vêm de variáveis CSS em canais RGB (src/index.css): claro no :root, escuro em
// :root[data-tema="escuro"]. Os nomes são papéis (fundo, superficie, texto, marca…), não cores:
// bg-marca, text-marca-texto, border-borda-controle, bg-superficie/70.
const canal = (nome) => `rgb(var(--${nome}) / <alpha-value>)`
const PAPEIS = [
  'fundo', 'superficie', 'superficie-2', 'borda', 'borda-controle',
  'texto', 'apoio', 'apagado', 'marca', 'marca-texto', 'tinta', 'selecionado',
  'sucesso', 'aviso', 'erro', 'info',
]

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // dark: segue o tema escolhido no app (data-tema no <html>), não só o do sistema.
  darkMode: ['selector', '[data-tema="escuro"]'],
  theme: {
    extend: {
      colors: Object.fromEntries(PAPEIS.map((p) => [p, canal(p)])),
      // Uma família por app, servida pelo próprio app (@fontsource-variable, importada em src/main.tsx).
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.28s ease-out',
      },
    },
  },
  plugins: [],
}
