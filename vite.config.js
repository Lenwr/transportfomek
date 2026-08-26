import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const vercelOrigin = env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : ''
  const appOrigin = (vercelOrigin || env.VITE_APP_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '')

  return {
    plugins: [
      vue(),
      {
        name: 'transport-fomek-social-metadata',
        transformIndexHtml(html) {
          return html.replaceAll('__APP_ORIGIN__', appOrigin)
        },
      },
    ],
    build: { chunkSizeWarningLimit: 2000 },
  }
})
