type JobFn = () => Promise<void>;

interface JobEntry {
  name:        string;
  fn:          JobFn;
  lastRunAt?:  Date;
  lastResult?: 'ok' | 'error';
  lastError?:  string;
}

const registry = new Map<string, JobEntry>();

export function registerJob(name: string, fn: JobFn): void {
  registry.set(name, { name, fn });
}

export function getJobs(): Omit<JobEntry, 'fn'>[] {
  return [...registry.values()].map(({ fn: _fn, ...rest }) => rest);
}

export async function triggerJob(name: string): Promise<void> {
  const job = registry.get(name);
  if (!job) throw new Error(`Job ${name} not found`);

  job.lastRunAt = new Date();
  try {
    await job.fn();
    job.lastResult = 'ok';
    delete job.lastError;
  } catch (err) {
    job.lastResult = 'error';
    job.lastError  = String(err);
    throw err;
  }
}

// Exported only for test isolation — not used in production code.
export function clearRegistry(): void {
  registry.clear();
}