import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { z } from 'zod';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = z
    .url({ protocol: /^https?$/ })
    .safeParse(env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000');
  if (!target.success)
    throw new Error('API_PROXY_TARGET must be an HTTP(S) URL');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Vite otherwise inherits server.proxy for preview. Production uses Nginx.
    preview: { proxy: {} },
    server: {
      port: Number(env.DEV_SERVER_PORT ?? 5173),
      strictPort: true,
      watch: { usePolling: env.WATCH_USE_POLLING === 'true' },
      proxy: {
        '/api': {
          target: target.data,
          changeOrigin: true,
          cookieDomainRewrite: '',
        },
      },
    },
  };
});
