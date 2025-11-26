import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

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
  onSuccess: async () => {
    // Copy OpenAPI spec JSON files to dist
    const specs = ['coingecko-pro.json'];
    const destDir = join('dist', 'openapi-specs');
    mkdirSync(destDir, { recursive: true });
    
    for (const spec of specs) {
      const src = join('src', 'openapi-specs', spec);
      const dest = join(destDir, spec);
      copyFileSync(src, dest);
      console.log(`Copied ${spec} to ${destDir}`);
    }
  },
});
