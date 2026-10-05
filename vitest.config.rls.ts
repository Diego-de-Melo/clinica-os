import { defineConfig } from "vitest/config";

/**
 * Suíte de integração contra o Supabase local (exige Docker + `supabase start`).
 * Roda por fora de `npm test` para que contribuidores sem Docker continuem verdes.
 *
 *   npm run test:rls
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    pool: "forks",
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
