/**
 * NotificationDrawer.tsx
 * Slide-in drawer showing proactive AI insights: anomalies, subscriptions, missed payments.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, X, CheckCheck, Trash2, RefreshCw, Loader2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui';

interface Notification {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'alert';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  linkedEntityId?: string;
  linkedEntityType?: string;
}

interface NotificationsResponse {
  items: Notification[];
  unreadCount: number;
}

const SEVERITY_STYLES = {
  alert: {
    icon: <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />,
    border: 'border-l-2 border-red-400',
    bg: 'bg-red-50 dark:bg-red-950/20',
  },
  warning: {
    icon: <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />,
    border: 'border-l-2 border-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
  },
  info: {
    icon: <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />,
    border: 'border-l-2 border-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
  },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
    refetchInterval: 60_000, // refresh every minute
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      notify.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const clearRead = useMutation({
    mutationFn: () => api.delete('/notifications/clear'),
    onSuccess: () => {
      notify.success('Read notifications cleared');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const runChecks = useMutation({
    mutationFn: () => api.post('/notifications/run-checks'),
    onSuccess: (res) => {
      const count = (res.data as { created?: number })?.created ?? 0;
      notify.success(count > 0 ? `Found ${count} new insight${count !== 1 ? 's' : ''}` : 'No new insights found');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => notify.error('Analysis failed'),
  });

  const items = data?.items ?? [];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Bell size={18} />
            <h2 className="font-semibold">Notifications</h2>
            {(data?.unreadCount ?? 0) > 0 && (
              <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                {data!.unreadCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-surface-hover)] rounded">
            <X size={18} />
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
          <Button
            variant="secondary"
            onClick={() => runChecks.mutate()}
            disabled={runChecks.isPending}
            className="text-xs h-7 px-2"
          >
            {runChecks.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
            Analyse now
          </Button>
          <Button
            variant="secondary"
            onClick={() => markAllRead.mutate()}
            disabled={items.every((n) => n.read)}
            className="text-xs h-7 px-2"
          >
            <CheckCheck size={12} className="mr-1" />
            Mark all read
          </Button>
          <Button
            variant="secondary"
            onClick={() => clearRead.mutate()}
            disabled={items.every((n) => !n.read)}
            className="text-xs h-7 px-2"
          >
            <Trash2 size={12} className="mr-1" />
            Clear read
          </Button>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-32 text-[var(--color-text-secondary)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-secondary)] gap-2">
              <Bell size={32} className="opacity-30" />
              <p className="text-sm">No notifications yet</p>
              <p className="text-xs opacity-60">Click &quot;Analyse now&quot; to scan for insights</p>
            </div>
          )}
          {items.map((n) => {
            const style = SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.info;
            return (
              <div
                key={n.id}
                className={`flex gap-3 px-4 py-3 border-b border-[var(--color-border)] cursor-pointer transition-colors
                  ${n.read ? 'opacity-60' : style.bg}
                  ${!n.read ? style.border : ''}
                  hover:bg-[var(--color-surface-hover)]`}
                onClick={() => { if (!n.read) markRead.mutate(n.id); }}
              >
                {style.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{n.body}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
