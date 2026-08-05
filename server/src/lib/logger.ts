import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Reads an optional environment variable, treating blank as absent.
 *
 * A variable declared without a value — `LOG_LEVEL=` in an env file, which is
 * how every optional setting ships in `.env.example` — arrives as an empty
 * string, not as undefined, so `??` never reaches its fallback. Handing that
 * empty string to pino as a level throws at import time and takes the process
 * down before it binds a port.
 */
function envOrUndefined(key: string): string | undefined {
  const raw = process.env[key]?.trim();
  return raw ? raw : undefined;
}

const globalLevel = envOrUndefined('LOG_LEVEL') ?? (isDev ? 'debug' : 'info');
const lokiUrl = envOrUndefined('LOKI_URL');

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
  const override = envOrUndefined(`LOG_LEVEL_${moduleName.toUpperCase()}`);
  const child = logger.child({ module: moduleName });
  if (override) {
    child.level = override;
  }
  return child;
}
