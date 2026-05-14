export type Status = 'ok' | 'error' | 'running' | 'disabled';

const styles: Record<Status, string> = {
  ok:       'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  error:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  running:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  disabled: 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]',
};

const labels: Record<Status, string> = {
  ok: 'OK', error: 'Error', running: 'Running', disabled: 'Disabled',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
