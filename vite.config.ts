import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'

/**
 * Carimbo da versão que foi compilada — commit + data, congelados no bundle.
 *
 * Existe porque `firebase deploy` publica a pasta `dist/`, e descobrir QUAL versão está no
 * ar virou caça a detalhe de tela ("o subtítulo mudou?"). Com o carimbo, Configurações
 * responde isso de cara, e dá para comparar com o `git log` da máquina.
 */
function buildId(): string {
  const date = new Date().toLocaleDateString('pt-BR')
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return `${sha} · ${date}`
  } catch {
    // Sem git (ex.: build a partir de um zip) o carimbo ainda diz a data.
    return `local · ${date}`
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
