import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    exclude: [
      'src/__tests__/incidents*.test.ts',
      'src/__tests__/audit.test.ts',
      'src/__tests__/audit-integration.test.ts',
      'src/__tests__/world-model.test.ts',
      'src/__tests__/world-model-constraints.test.ts',
      'src/__tests__/missions.test.ts',
      'src/__tests__/evidence.test.ts',
      'src/__tests__/evidence-bundle.test.ts',
      'src/__tests__/trust.test.ts',
      'src/__tests__/degraded-modes.test.ts',
      'src/__tests__/trust-layer.test.ts',
      'src/__tests__/mission-engine.test.ts',
      'src/__tests__/policy-engine.test.ts',
    ],
    globals: false,
  },
})
