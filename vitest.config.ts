import { defineConfig } from 'vitest/config'

/**
 * Config própria dos testes de Security Rules — separada do `vite.config.ts` para
 * o Vitest não arrastar o plugin do React nem o carimbo de build.
 *
 * Os testes falam com os emuladores por rede, e cada `assertFails` espera o
 * round-trip de uma negação: os timeouts do padrão (5 s) são curtos demais.
 */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Um único ambiente de emulador; arquivos em paralelo disputariam o mesmo estado.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
