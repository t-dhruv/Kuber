import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('createModuleLogger returns a child logger with module field', async () => {
    const { createModuleLogger } = await import('../../src/lib/logger.js');
    const log = createModuleLogger('test-module');
    expect(log.bindings()).toMatchObject({ module: 'test-module' });
  });

  it('createModuleLogger applies LOG_LEVEL_<MODULE> override', async () => {
    process.env.LOG_LEVEL_MYMOD = 'debug';
    const { createModuleLogger } = await import('../../src/lib/logger.js');
    const log = createModuleLogger('mymod');
    expect(log.level).toBe('debug');
  });

  it('createModuleLogger falls back to global level when no override', async () => {
    delete process.env.LOG_LEVEL_IMPORT;
    process.env.LOG_LEVEL = 'warn';
    const { createModuleLogger } = await import('../../src/lib/logger.js');
    const log = createModuleLogger('import');
    expect(log.level).toBe('warn');
  });

  // pino throws if it is handed a level it does not recognise, and an empty
  // string is not one it recognises. An empty string is also exactly what an
  // unset-but-present variable looks like: `.env.example` ships `LOG_LEVEL=`
  // with no value, Compose's `env_file` passes that through as '' rather than
  // omitting it, and `??` only falls back on undefined. The server exited
  // before binding a port, so the documented install produced a dead Instance.
  it('falls back to the default level when LOG_LEVEL is present but empty', async () => {
    process.env.LOG_LEVEL = '';
    const { logger } = await import('../../src/lib/logger.js');
    expect(logger.level).toBe('debug');
  });

  it('falls back to the default level when LOG_LEVEL is only whitespace', async () => {
    process.env.LOG_LEVEL = '   ';
    const { logger } = await import('../../src/lib/logger.js');
    expect(logger.level).toBe('debug');
  });

  it('ignores an empty per-module override rather than failing', async () => {
    process.env.LOG_LEVEL = 'warn';
    process.env.LOG_LEVEL_EMPTYMOD = '';
    const { createModuleLogger } = await import('../../src/lib/logger.js');
    const log = createModuleLogger('emptymod');
    expect(log.level).toBe('warn');
  });
});

