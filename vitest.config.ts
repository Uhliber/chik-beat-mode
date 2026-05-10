import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/game/**/*.ts'],
      exclude: [
        'src/game/**/*.test.ts',
        'src/game/__tests__/**',
        'src/game/transport/**',
        'src/game/SimulationController.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
