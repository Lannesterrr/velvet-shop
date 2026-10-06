import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Куда проксировать API в режиме разработки
  const apiTarget = env.VITE_API_PROXY ?? 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: true,
      // Разрешаем открывать dev-сервер через туннель (ngrok / cloudflared)
      allowedHosts: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      // Не считаем gzip-размеры при сборке — экономит память на слабых хостингах
      reportCompressedSize: false,
    },
  };
});
