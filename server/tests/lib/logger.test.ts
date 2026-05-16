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
});

