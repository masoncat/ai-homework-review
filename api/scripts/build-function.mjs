import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outdir = new URL('../bundle/', import.meta.url);

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ['src/fc-entry.ts'],
  bundle: true,
  external: ['@napi-rs/canvas', '@napi-rs/canvas-*'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'bundle/index.js',
});

await writeFile(
  new URL('package.json', outdir),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
);
