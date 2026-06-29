import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/admin',
  base: '/admin-app/',
  plugins: [react()],
  build: {
    outDir: '../../public/admin-app',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/music': 'http://127.0.0.1:3000',
      '/logout': 'http://127.0.0.1:3000'
    }
  }
});
