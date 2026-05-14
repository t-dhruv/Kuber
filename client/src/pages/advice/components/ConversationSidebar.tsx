import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui';

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
}

interface Props {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

function groupConversations(convs: Conversation[]): Array<{ label: string; items: Conversation[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86_400_000);

  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const older: Conversation[] = [];

  for (const c of convs) {
    const d = new Date(c.updatedAt);
    if (d >= startOfToday) today.push(c);
    else if (d >= startOfYesterday) yesterday.push(c);
    else if (d >= startOfWeek) thisWeek.push(c);
    else older.push(c);
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'This Week', items: thisWeek },
    { label: 'Older', items: older },
  ].filter((g) => g.items.length > 0);
}

export function ConversationSidebar({ activeConversationId, onSelect, onNewChat }: Props) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ['advisor', 'conversations'],
    queryFn: () => api.get('/advisor/conversations').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/advisor/conversations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advisor', 'conversations'] });
      setDeleteTarget(null);
    },
  });

  function confirmDeleteConversation() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
    if (activeConversationId === deleteTarget.id) onNewChat();
  }

  const groups = groupConversations(conversations ?? []);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)] w-64 flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-[var(--color-border)]">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">Loading</div>
        )}
        {!isLoading && groups.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No conversations yet</div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 py-1.5 text-[0.6875rem] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              {group.label}
            </div>
            {group.items.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-start gap-2 mx-1 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                      : 'hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 px-2 py-2 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                    onClick={() => onSelect(conv.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                        {conv.title || 'Untitled'}
                      </div>
                      {conv.lastMessage && (
                        <div className="text-[0.6875rem] text-[var(--color-text-muted)] truncate mt-0.5">
                          {conv.lastMessage}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(conv)}
                    className="mr-2 mt-2 flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--color-danger-light,#fee2e2)] text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteConversation}
        title="Delete Conversation"
        message={<>Delete <strong>{deleteTarget?.title || 'Untitled'}</strong>? This cannot be undone.</>}
        confirmLabel="Delete conversation"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
