import { defineConfig, loadEnv } from 'vite'
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

/**
 * Grita quando a build de produção sai sem a site key do App Check.
 *
 * `src/lib/firebase.ts` só inicializa o App Check SE a variável existir. Sem ela a
 * build funciona, sobe e parece saudável — e só em produção, ao clicar, aparece um
 * "permission-denied" que não diz nada. Foi assim que o Titã IA passou dias morto no
 * ar. O aviso não interrompe o build de propósito: quem escolheu desligar o
 * enforceAppCheck nas funções de IA está num estado válido, só precisa saber que o
 * `excluirCliente` continua exigindo.
 */
function avisaAppCheck(mode: string, dir: string): void {
  const env = loadEnv(mode, dir, 'VITE_')
  if (mode !== 'production' || env.VITE_RECAPTCHA_SITE_KEY) return
  console.warn(
    '\n\x1b[33m⚠  VITE_RECAPTCHA_SITE_KEY ausente — esta build sai SEM App Check.\x1b[0m\n' +
    '   As funções com `enforceAppCheck: true` vão recusar toda chamada deste site.\n' +
    '   Hoje isso atinge: excluirCliente (exclusão definitiva no painel SUPER TITAN).\n' +
    '   Para resolver: reCAPTCHA v3 no console e a site key no .env.local.\n',
  )
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  avisaAppCheck(mode, __dirname)
  return {
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
  }
})
