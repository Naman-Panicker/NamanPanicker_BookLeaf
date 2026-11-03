import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  // The shared package ships TypeScript source, so bundle it into the server.
  noExternal: [/^@bookleaf\//],
  clean: true,
});
