import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

let appVersion = 'v1.0.0'
try {
  appVersion = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch (e) {
  try {
    appVersion = execSync('git describe --tags --always', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch (err) {
    appVersion = 'v1.0.0'
  }
}
if (!appVersion) appVersion = 'v1.0.0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-v${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-v${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-v${Date.now()}.[ext]`,
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false, // Ignorar certificado autofirmado local
      },
      '/uploads': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
