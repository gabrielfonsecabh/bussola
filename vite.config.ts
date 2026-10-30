import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cloudflarePages } from './scripts/cloudflare.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflarePages()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // O chunk inicial carrega React, Router, TanStack Query e o client do
    // Supabase, que é o piso desta stack. As telas são `lazy` por rota, então
    // o que cresce daqui para frente entra em chunk próprio. O limite existe
    // para o aviso voltar a significar alguma coisa em vez de virar ruído.
    chunkSizeWarningLimit: 700,
  },
})
