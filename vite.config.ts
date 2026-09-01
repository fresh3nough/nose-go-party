import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
