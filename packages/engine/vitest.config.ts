import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      enabled: false,
      provider: 'v8',
    },
  },
});
