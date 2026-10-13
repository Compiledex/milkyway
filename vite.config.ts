import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works under any sub-path (e.g. GitHub Pages /<repo>/).
  base: './',
  plugins: [react()],
})
