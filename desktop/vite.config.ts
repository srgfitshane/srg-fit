import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for the Tauri-hosted webview. Fixed dev port (1420) so the
// Rust side knows where to point devUrl. Strict port so Vite errors out
// instead of silently moving the dev server when 1420 is taken.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    hmr: { protocol: 'ws', host: 'localhost', port: 1421 },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
  },
})
