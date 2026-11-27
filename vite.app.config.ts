import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The S.I.M.S. app's page, built into the app's folder for Home Assistant to
// serve through ingress. Every address in it is relative, since ingress
// serves the page under a path of its own.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  root: fileURLToPath(new URL('./src/app', import.meta.url)),
  base: './',
  plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
  define: { 'process.env.NODE_ENV': '"production"', __CARD_VERSION__: JSON.stringify(version) },
  resolve: { alias: { '#': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('./sims/app/www', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
  },
})
