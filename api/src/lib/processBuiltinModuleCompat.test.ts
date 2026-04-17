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

  it('falls back to a local require when createRequire receives an undefined filename', () => {
    Reflect.deleteProperty(process, 'getBuiltinModule');

    ensureProcessBuiltinModuleCompat();

    const moduleBuiltin = process.getBuiltinModule?.('module') as
      | {
          createRequire: (filename?: string | URL) => NodeRequire;
        }
      | undefined;

    expect(moduleBuiltin).toBeDefined();
    expect(() =>
      moduleBuiltin?.createRequire(undefined).resolve('node:fs')
    ).not.toThrow();
  });
});
