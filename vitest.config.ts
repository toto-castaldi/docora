import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,              // enables describe/it/expect without imports
        environment: 'node',        // Node.js environment (not jsdom)
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',           
            reporter: ['text', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts'] // entry point doesn't need coverage
        }
    }
});