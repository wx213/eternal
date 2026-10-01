import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 端口被占用时直接失败，避免漂移到 5174/5175 导致后端 CORS 白名单不匹配
    strictPort: true,
    proxy: {
      // 开发环境把 /api 代理到后端，规避跨域
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // SSE 是长连接：模型思考期间没有数据往来，默认超时会掐断流式回复
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
