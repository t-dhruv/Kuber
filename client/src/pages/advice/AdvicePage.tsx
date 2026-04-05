import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useChatStream } from './hooks/useChatStream';
import { ChatMessage } from './components/ChatMessage';
import { StreamingMessage } from './components/StreamingMessage';
import { ChatInput } from './components/ChatInput';
import { ConversationSidebar } from './components/ConversationSidebar';
import { SuggestionChips } from './components/SuggestionChips';

// ─── Advice Library Types ─────────────────────────────────────────────────────

interface AdviceTask {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  completedAt: string | null;
}

interface AdviceTopic {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  sortOrder: number;
  tasks: AdviceTask[];
  completedCount: number;
  totalTasks: number;
}

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'save', label: 'Save' },
  { value: 'spend', label: 'Spend' },
  { value: 'pay-down', label: 'Pay Down' },
  { value: 'invest', label: 'Invest' },
  { value: 'protect', label: 'Protect' },
  { value: 'wellness', label: 'Wellness' },
];

// ─── Topic Detail Panel ────────────────────────────────────────────────────────

function TopicDetailPanel({
  topic,
  onClose,
  onToggleTask,
}: {
  topic: AdviceTopic;
  onClose: () => void;
  onToggleTask: (topicId: string, taskId: string) => void;
}) {
  const pct = topic.totalTasks > 0 ? Math.round((topic.completedCount / topic.totalTasks) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[100vw] h-screen bg-[var(--color-surface)] flex flex-col overflow-hidden"
        style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-[1.75rem]">{topic.icon}</span>
              <h2 className="text-[1.0625rem] font-bold text-[var(--color-text)] m-0">{topic.title}</h2>
            </div>
            <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] text-[1.1rem] px-1.5 py-1 rounded-[var(--radius-sm)]">✕</button>
          </div>
          <p className="text-[0.8125rem] text-[var(--color-text-secondary)] mt-0 mb-4">{topic.description}</p>
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-[var(--color-text-muted)]">Progress</span>
              <span className="text-xs font-semibold text-[var(--color-text)]">{topic.completedCount} of {topic.totalTasks} tasks complete</span>
            </div>
            <div className="h-[6px] rounded-[var(--radius-full)] bg-[var(--color-border)] overflow-hidden">
              <div className="h-full rounded-[var(--radius-full)] transition-[width] duration-300 ease-in-out" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? 'var(--color-success, #22c55e)' : 'var(--color-accent)' }} />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {topic.tasks.map((task) => {
            const done = task.completedAt !== null;
            return (
              <div key={task.id} className="flex gap-3.5 py-3.5 border-b border-[var(--color-border)] items-start">
                <button
                  onClick={() => onToggleTask(topic.id, task.id)}
                  className="shrink-0 w-5 h-5 rounded-[var(--radius-sm)] cursor-pointer flex items-center justify-center mt-[0.125rem] transition-[background,border] duration-150"
                  style={{ border: done ? 'none' : '2px solid var(--color-border)', backgroundColor: done ? 'var(--color-accent)' : 'transparent' }}
                  title={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {done && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-1" style={{ color: done ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}>{task.title}</div>
                  <div className="text-[0.8125rem] text-[var(--color-text-muted)] leading-[1.5]">{task.description}</div>
                  {done && task.completedAt && <div className="text-[0.6875rem] text-[var(--color-text-muted)] mt-1">Completed {new Date(task.completedAt).toLocaleDateString()}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Advice Library Tab ────────────────────────────────────────────────────────

function AdviceLibraryTab() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState<AdviceTopic | null>(null);

  const { data: topics, isLoading, isError } = useQuery<AdviceTopic[]>({
    queryKey: ['advice', 'topics'],
    queryFn: () => api.get('/advice/topics').then((r) => r.data),
  });

  const toggleTask = useMutation({
    mutationFn: ({ topicId, taskId }: { topicId: string; taskId: string }) =>
      api.put(`/advice/topics/${topicId}/tasks/${taskId}`).then((r) => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['advice', 'topics'] }); },
  });

  function handleToggleTask(topicId: string, taskId: string) {
    toggleTask.mutate({ topicId, taskId });
    if (selectedTopic && selectedTopic.id === topicId) {
      const updatedTasks = selectedTopic.tasks.map((t) =>
        t.id === taskId ? { ...t, completedAt: t.completedAt === null ? new Date().toISOString() : null } : t
      );
      const newCount = updatedTasks.filter((t) => t.completedAt !== null).length;
      setSelectedTopic({ ...selectedTopic, tasks: updatedTasks, completedCount: newCount });
    }
  }

  useEffect(() => {
    if (!topics || !selectedTopic) return;
    const fresh = topics.find((t) => t.id === selectedTopic.id);
    if (fresh) setSelectedTopic(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, selectedTopic?.id]);

  const filtered = (topics ?? []).filter((t) => categoryFilter === 'all' || t.category === categoryFilter);

  if (isLoading) return <div className="flex justify-center items-center h-[200px] text-[var(--color-text-muted)] text-sm">Loading advice topics...</div>;
  if (isError) return <div className="flex justify-center items-center h-[200px] text-[var(--color-danger,#ef4444)] text-sm">Failed to load advice topics.</div>;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => {
          const active = categoryFilter === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className="rounded-[var(--radius-full)] text-[0.8125rem] cursor-pointer transition-all duration-150"
              style={{
                padding: '0.3rem 0.875rem',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text)',
                fontWeight: active ? 600 : 400,
              }}
            >{cat.label}</button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center text-[var(--color-text-muted)] text-sm py-12">No topics in this category yet.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filtered.map((topic) => {
            const pct = topic.totalTasks > 0 ? Math.round((topic.completedCount / topic.totalTasks) * 100) : 0;
            const done = topic.completedCount === topic.totalTasks && topic.totalTasks > 0;
            return (
              <div
                key={topic.id}
                className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-5 flex flex-col gap-3"
                style={{ border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border)'}` }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[1.75rem] shrink-0">{topic.icon}</span>
                  <div>
                    <div className="text-[0.9375rem] font-bold text-[var(--color-text)]">{topic.title}</div>
                    <div className="text-[0.6875rem] font-semibold text-[var(--color-accent)] uppercase tracking-[0.04em] mt-[0.125rem]">{topic.category.replace('-', ' ')}</div>
                  </div>
                </div>
                <p className="text-[0.8125rem] text-[var(--color-text-muted)] leading-[1.5] m-0 flex-1">{topic.description}</p>
                <div>
                  <div className="flex justify-between mb-[0.3rem]">
                    <span className="text-[0.6875rem] text-[var(--color-text-muted)]">{topic.completedCount}/{topic.totalTasks} tasks</span>
                    {done && <span className="text-[0.6875rem] font-semibold text-[var(--color-success,#22c55e)]">Complete</span>}
                  </div>
                  <div className="h-[5px] rounded-[var(--radius-full)] bg-[var(--color-border)] overflow-hidden">
                    <div className="h-full rounded-[var(--radius-full)] transition-[width] duration-300 ease-in-out" style={{ width: `${pct}%`, backgroundColor: done ? 'var(--color-success, #22c55e)' : 'var(--color-accent)' }} />
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTopic(topic)}
                  className="py-2 px-4 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-transparent text-[var(--color-accent)] text-[0.8125rem] font-semibold cursor-pointer transition-all duration-150"
                >View checklist</button>
              </div>
            );
          })}
        </div>
      )}
      {selectedTopic && <TopicDetailPanel topic={selectedTopic} onClose={() => setSelectedTopic(null)} onToggleTask={handleToggleTask} />}
    </div>
  );
}

// ─── AI Chat Tab ──────────────────────────────────────────────────────────────

function AiChatTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { messages, conversationId, isStreaming, error, send, cancel, startNewConversation, loadConversation } = useChatStream();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: aiSettings } = useQuery<{ provider: string }>({
    queryKey: ['settings', 'ai'],
    queryFn: () => api.get('/settings/ai').then((r) => r.data),
    retry: false,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [messages]);

  // Invalidate conversations list whenever a new conversation is created
  useEffect(() => {
    if (conversationId) {
      queryClient.invalidateQueries({ queryKey: ['advisor', 'conversations'] });
    }
  }, [conversationId, queryClient]);

  const isNotConfigured = !aiSettings?.provider || aiSettings.provider === 'none';
  const hasMessages = messages.length > 0;

  // Determine conversation title
  const title = messages.find((m) => m.role === 'user')?.content.slice(0, 50) ?? 'New conversation';

  function handleSend(text: string) {
    send(text);
  }

  function handleLoadConversation(id: string) {
    loadConversation(id);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <ConversationSidebar
          activeConversationId={conversationId}
          onSelect={handleLoadConversation}
          onNewChat={startNewConversation}
        />
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <span className="text-sm font-medium text-[var(--color-text)] truncate flex-1">{hasMessages ? title : 'AI Advisor'}</span>
          <button
            onClick={startNewConversation}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors"
          >
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          data-chat-scroll="true"
          className="flex-1 overflow-y-auto py-4"
        >
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-3xl">
                ✨
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">How can I help?</h2>
                <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
                  I have access to your real financial data. Ask me anything about your spending, budgets, goals, or investments.
                </p>
              </div>
              <SuggestionChips onSelect={handleSend} />
            </div>
          )}

          {hasMessages && messages.filter((m) => !m.streaming).map((msg, i) => (
            <ChatMessage key={msg.id ?? `msg-${i}`} message={msg} />
          ))}

          {isStreaming && (
            <StreamingMessage
              content={messages.find((m) => m.streaming)?.content ?? ''}
              onCancel={cancel}
            />
          )}

          {error && !isStreaming && (
            <div className="mx-4 mt-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          {isNotConfigured && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => navigate('/settings')}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Go to Settings → AI Advisor
              </button>
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}

// ─── Main AdvicePage ──────────────────────────────────────────────────────────

type Tab = 'chat' | 'library';

export default function AdvicePage() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab header */}
      <div className="flex gap-1 px-4 py-3 border-b border-[var(--color-border)] shrink-0">
        {([['chat', '✨ AI Advisor'], ['library', '📚 Advice Library']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="py-1.5 px-3.5 rounded-[var(--radius-md)] border-none text-sm cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: tab === key ? 'var(--color-accent)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--color-text-muted)',
              fontWeight: tab === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'chat' ? <AiChatTab /> : <AdviceLibraryTab />}
      </div>
    </div>
  );
}
