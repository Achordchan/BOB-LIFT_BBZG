import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/admin',
  base: '/admin-app/',
  plugins: [react()],
  build: {
    outDir: '../../public/admin-app',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // 只拆核心公共包，避免 rc-* / dayjs 与 antd 交叉进不同 chunk
          if (
            id.includes('node_modules/antd')
            || id.includes('node_modules/@ant-design')
            || id.includes('node_modules/rc-')
            || id.includes('node_modules/@rc-component')
            || id.includes('node_modules/dayjs')
          ) {
            return 'antd';
          }
          if (
            id.includes('node_modules/react-dom')
            || id.includes('node_modules/react/')
            || id.includes('node_modules/scheduler')
          ) {
            return 'react-vendor';
          }
        }
      }
    }
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
