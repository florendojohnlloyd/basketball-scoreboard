import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.e2e.test.{ts,tsx}', 'e2e/**'],
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer')
    },
    projects: [
      {
        // Renderer tests — use jsdom environment
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true
        },
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'src/shared'),
            '@renderer': resolve(__dirname, 'src/renderer')
          }
        }
      },
      {
        // Main process tests — use node environment
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
          setupFiles: ['./vitest.setup.ts'],
          globals: true
        },
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'src/shared')
          }
        }
      }
    ]
  }
})
