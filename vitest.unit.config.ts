import { defineConfig } from 'vitest/config'

/**
 * Testes de unidade — rodam sem emulador e sem rede.
 *
 * Separado de `vitest.config.ts` (Security Rules) porque aquele sobe os emuladores por
 * fora, num único ambiente serializado. O que se testa aqui é lógica pura, e lógica pura
 * não deveria precisar de infraestrutura para reprovar.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
