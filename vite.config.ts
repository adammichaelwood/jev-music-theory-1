import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Dev-server proxy: the browser posts to /api/v1/systemone with a dummy bearer;
// we swap in the real key from .env here so it never reaches the page.
// A deployed build points the SDK's baseURL at a Worker that does the same job.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.TYPESAFE_API_KEY
  return {
    base: env.GH_PAGES ? '/jev-music-theory-1/' : '/',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'https://api.typesafe.ai',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              if (key) req.setHeader('authorization', `Bearer ${key}`)
            })
          },
        },
      },
    },
    test: { include: ['src/**/*.test.ts'] },
  }
})
