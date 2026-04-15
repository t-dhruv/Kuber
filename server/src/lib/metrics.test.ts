import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('metrics', () => {
  it('exports all required metric objects', async () => {
    const metrics = await import('./metrics.js');
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
    const { metricsHandler } = await import('./metrics.js');
    const app = express();
    app.get('/metrics', metricsHandler);

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('nodejs_version_info');
  });
});
