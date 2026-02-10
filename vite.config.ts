import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // GitHub Pages serves project sites at https://<user>.github.io/<repo>/.
  // We set base only for the Pages build so local dev and other builds keep '/'.
  const isPagesBuild = command === 'build' && process.env.GITHUB_PAGES === 'true';

  return {
    base: isPagesBuild ? '/bizcard-ai-scanner/' : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // Optional backend proxy for local dev (`npm run dev:server`)
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
