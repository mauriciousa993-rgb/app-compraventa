import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Obtener IP local para desarrollo en móviles
const getLocalIP = () => {
  // En development, los navegadores automáticamente usan la IP correcta
  // Solo necesitamos configurar el proxy correctamente
  return 'localhost';
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Escuchar en todas las interfaces
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
