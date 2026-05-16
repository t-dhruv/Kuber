import express, { Router } from 'express';
import { vi } from 'vitest';

type TestLogger = {
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
};

type RouteTestOptions = {
  userId?: string;
  householdId?: string;
  log?: TestLogger;
  mountPath?: string;
};

function makeLogger(): TestLogger {
  const log = {
    error: vi.fn(),
    info: vi.fn(),
    child: vi.fn(),
  };
  log.child.mockReturnValue(log);
  return log;
}

export function makeRouteTestApp(router: Router, options: RouteTestOptions = {}) {
  const app = express();
  const {
    userId = 'user-1',
    householdId = 'household-1',
    log = makeLogger(),
    mountPath = '/',
  } = options;

  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = userId;
    req.householdId = householdId;
    req.log = log;
    next();
  });
  app.use(mountPath, router);

  return app;
}
