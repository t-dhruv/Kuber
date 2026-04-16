import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response } from 'express';

// Collect Node.js default metrics (heap, event loop lag, GC, etc.)
collectDefaultMetrics({ register });

// ── HTTP Metrics ─────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── Background Job Metrics ────────────────────────────────────────────────────

export const jobRunsTotal = new Counter({
  name: 'job_runs_total',
  help: 'Total background job executions',
  labelNames: ['job', 'status'],
  registers: [register],
});

export const jobDurationSeconds = new Histogram({
  name: 'job_duration_seconds',
  help: 'Background job duration in seconds',
  labelNames: ['job'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [register],
});

export const jobLastRunTimestamp = new Gauge({
  name: 'job_last_run_timestamp',
  help: 'Unix timestamp of the last job run (seconds)',
  labelNames: ['job'],
  registers: [register],
});

// ── Business Metrics ──────────────────────────────────────────────────────────

export const transactionsImportedTotal = new Counter({
  name: 'transactions_imported_total',
  help: 'Total transactions imported',
  labelNames: ['household_id', 'source'],
  registers: [register],
});

export const aiAdvisorRequestsTotal = new Counter({
  name: 'ai_advisor_requests_total',
  help: 'Total AI advisor requests',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const rulesAppliedTotal = new Counter({
  name: 'rules_applied_total',
  help: 'Total categorization rules applied',
  labelNames: ['household_id'],
  registers: [register],
});

export const emailsSentTotal = new Counter({
  name: 'emails_sent_total',
  help: 'Total emails sent',
  labelNames: ['type', 'status'],
  registers: [register],
});

// ── /metrics endpoint handler ─────────────────────────────────────────────────

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
