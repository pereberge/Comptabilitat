import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { port: 5180, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } },
});