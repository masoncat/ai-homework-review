import { afterEach, describe, expect, it } from 'vitest';
import { ensureProcessBuiltinModuleCompat } from './processBuiltinModuleCompat.js';

const originalGetBuiltinModule = process.getBuiltinModule;

afterEach(() => {
  if (originalGetBuiltinModule) {
    process.getBuiltinModule = originalGetBuiltinModule;
  } else {
    Reflect.deleteProperty(process, 'getBuiltinModule');
  }
});

describe('ensureProcessBuiltinModuleCompat', () => {
  it('polyfills process.getBuiltinModule for runtimes that do not provide it', () => {
    Reflect.deleteProperty(process, 'getBuiltinModule');

    ensureProcessBuiltinModuleCompat();

    expect(typeof process.getBuiltinModule).toBe('function');
    expect(process.getBuiltinModule?.('fs')).toBeDefined();
  });
});
