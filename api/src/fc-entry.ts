import { ensureProcessBuiltinModuleCompat } from './lib/processBuiltinModuleCompat.js';

ensureProcessBuiltinModuleCompat();

export async function handler(
  ...args: Parameters<typeof import('./index.js').handler>
) {
  const mod = await import('./index.js');
  return mod.handler(...args);
}
