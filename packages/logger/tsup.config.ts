import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  outDir: 'dist',
  outExtension({ format }) {
    return { js: format === 'esm' ? '.js' : '.cjs' };
  },
  target: 'node20',
  platform: 'node',
  external: [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ],
});
