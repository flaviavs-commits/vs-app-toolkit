import { defineConfig } from 'vitest/config'

// Testes do frontend (src/), em Node, sem DOM: `window` e `localStorage` são simulados nos
// testes. Os do backend rodam à parte, em backend/ (`cd backend && npm test`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
