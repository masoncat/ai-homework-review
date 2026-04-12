import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const githubPagesBase =
  process.env.GITHUB_ACTIONS === 'true' ? '/ai-homework-review/' : '/';

export default defineConfig({
  base: githubPagesBase,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'shared/**/*.test.ts'],
    exclude: ['.worktrees/**', 'node_modules/**', 'api/**'],
  },
});
