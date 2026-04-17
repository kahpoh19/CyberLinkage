import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => {
  const appBuildId = process.env.VITE_APP_BUILD_ID || (command === 'build' ? Date.now().toString() : 'dev')

  return {
    define: {
      __CYBERLINKAGE_BUILD_ID__: JSON.stringify(appBuildId),
    },
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
