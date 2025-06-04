import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the root of your project
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: '/VUE-APP/',
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      port: 5173,
      proxy: mode === 'development' ? {
        '/api': 'http://localhost:3000',
      } : undefined
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL)
    }
  }
})
