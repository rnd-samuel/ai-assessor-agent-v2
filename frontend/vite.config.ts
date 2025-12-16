// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // --- THIS IS THE FIX ---
  // This tells Vite to build using relative paths (e.g., "./assets/")
  // instead of absolute paths (e.g., "/assets/").
  base: '/'
  // --- END OF FIX ---
})