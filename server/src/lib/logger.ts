import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const globalLevel = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

export const logger = pino({
  level: globalLevel,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Creates a module-scoped child logger.
 * Respects LOG_LEVEL_<MODULE_UPPERCASE> env var for per-module level override.
 *
 * Usage:
 *   const log = createModuleLogger('import');
 *   log.info({ filename }, 'Processing file');
 *   log.error({ err }, 'Import failed');
 */
export function createModuleLogger(moduleName: string): pino.Logger {
  // Read env at call time so per-module overrides work after module load
  const override = process.env[`LOG_LEVEL_${moduleName.toUpperCase()}`];
  const child = logger.child({ module: moduleName });
  if (override) {
    child.level = override;
  }
  return child;
}
