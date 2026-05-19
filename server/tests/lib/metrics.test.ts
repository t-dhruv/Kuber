import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Reset modules + clear registry before each test so prom-client's singleton
// registry doesn't throw "already registered" if other tests also touch prom-client
beforeEach(async () => {
  vi.resetModules();
  const { register } = await import('prom-client');
  register.clear();
});

describe('metrics', () => {
  it('exports all required metric objects', async () => {
    const metrics = await import('../../src/lib/metrics.js');
    expect(metrics.httpRequestsTotal).toBeDefined();
    expect(metrics.httpRequestDurationSeconds).toBeDefined();
    expect(metrics.jobRunsTotal).toBeDefined();
    expect(metrics.jobDurationSeconds).toBeDefined();
    expect(metrics.jobLastRunTimestamp).toBeDefined();
    expect(metrics.transactionsImportedTotal).toBeDefined();
    expect(metrics.aiAdvisorRequestsTotal).toBeDefined();
    expect(metrics.rulesAppliedTotal).toBeDefined();
    expect(metrics.emailsSentTotal).toBeDefined();
  });

  it('/metrics endpoint returns prometheus format', async () => {
    const { metricsHandler } = await import('../../src/lib/metrics.js');
    const app = express();
    app.get('/metrics', metricsHandler);

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('nodejs_version_info');
  });
});

