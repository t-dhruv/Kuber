import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const globalLevel = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');
const lokiUrl = process.env.LOKI_URL;

const pinoOpts: pino.LoggerOptions = {
  level: globalLevel,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
};

function buildStream(): pino.DestinationStream | undefined {
  if (isDev) {
    return pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    });
  }
  if (lokiUrl) {
    return pino.transport({
      targets: [
        { target: 'pino/file', level: globalLevel, options: { destination: 1 } },
        {
          target: 'pino-loki',
          level: globalLevel,
          options: {
            host: lokiUrl,
            labels: { container_name: 'kuber_server', app: 'kuber' },
            interval: 5,
            timeout: 5000,
            silenceErrors: true,
            replaceTimestamp: false,
          },
        },
      ],
    });
  }
  return undefined;
}

const stream = buildStream();
export const logger = stream ? pino(pinoOpts, stream) : pino(pinoOpts);

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
