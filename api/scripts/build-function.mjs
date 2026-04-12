import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outdir = new URL('../bundle/', import.meta.url);

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
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
