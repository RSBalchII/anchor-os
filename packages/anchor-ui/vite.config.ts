import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: true, // Listen on all addresses (0.0.0.0)
    strictPort: true,
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://localhost:3160',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:3160',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
