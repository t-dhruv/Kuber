import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerJob, getJobs, triggerJob, clearRegistry } from '../../src/lib/cronRegistry';

describe('cronRegistry', () => {
  beforeEach(() => clearRegistry());

  it('registers a job and lists it with no run history', () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    registerJob('test-job', fn);
    const jobs = getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('test-job');
    expect(jobs[0].lastRunAt).toBeUndefined();
    expect(jobs[0].lastResult).toBeUndefined();
  });

  it('triggerJob calls the fn and records lastRunAt + lastResult=ok', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    registerJob('test-job', fn);

    await triggerJob('test-job');

    expect(fn).toHaveBeenCalledOnce();
    const jobs = getJobs();
    expect(jobs[0].lastResult).toBe('ok');
    expect(jobs[0].lastRunAt).toBeInstanceOf(Date);
    expect(jobs[0].lastError).toBeUndefined();
  });

  it('triggerJob records lastResult=error and re-throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    registerJob('failing-job', fn);

    await expect(triggerJob('failing-job')).rejects.toThrow('boom');
    const jobs = getJobs();
    expect(jobs[0].lastResult).toBe('error');
    expect(jobs[0].lastError).toBe('Error: boom');
  });

  it('triggerJob throws when job name not registered', async () => {
    await expect(triggerJob('ghost')).rejects.toThrow('Job ghost not found');
  });

  it('getJobs does not expose the fn property', () => {
    registerJob('test-job', vi.fn());
    const jobs = getJobs();
    expect((jobs[0] as Record<string, unknown>).fn).toBeUndefined();
  });
});
