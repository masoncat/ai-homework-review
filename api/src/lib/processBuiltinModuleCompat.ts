import * as nodeModule from 'node:module';
import { createRequire } from 'node:module';

export function ensureProcessBuiltinModuleCompat() {
  if (typeof process.getBuiltinModule === 'function') {
    return;
  }

  const localRequire = createRequire(
    `${process.cwd().replace(/\\/g, '/')}/__fc_runtime_compat__.cjs`
  );

  process.getBuiltinModule = ((name: string) => {
    try {
      if (name === 'module') {
        return {
          ...nodeModule,
          createRequire: (filename?: string | URL) => {
            if (filename) {
              return createRequire(filename);
            }

            return localRequire;
          },
        };
      }

      return localRequire(name);
    } catch {
      return undefined;
    }
  }) as typeof process.getBuiltinModule;
}
