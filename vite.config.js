
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: Using './' ensures the app finds its files regardless of the repository name
  base: "./", 
  define: {
    // This prevents "process is not defined" error in the browser
    'process.env': {} 
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: true
  }
})
