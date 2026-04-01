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
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        style={{ width: 480, maxWidth: '100vw', height: '100vh', backgroundColor: 'var(--color-surface)', boxShadow: '-4px 0 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.75rem' }}>{topic.icon}</span>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{topic.title}</h2>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '1.1rem', padding: '0.25rem 0.375rem', borderRadius: 'var(--radius-sm)' }}>✕</button>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0 0 1rem' }}>{topic.description}</p>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Progress</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{topic.completedCount} of {topic.totalTasks} tasks complete</span>
            </div>
            <div style={{ height: 6, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)', backgroundColor: pct === 100 ? 'var(--color-success, #22c55e)' : 'var(--color-accent)', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem' }}>
          {topic.tasks.map((task) => {
            const done = task.completedAt !== null;
            return (
              <div key={task.id} style={{ display: 'flex', gap: '0.875rem', padding: '0.875rem 0', borderBottom: '1px solid var(--color-border)', alignItems: 'flex-start' }}>
                <button
                  onClick={() => onToggleTask(topic.id, task.id)}
                  style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 'var(--radius-sm)', border: done ? 'none' : '2px solid var(--color-border)', backgroundColor: done ? 'var(--color-accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '0.125rem', transition: 'background 0.15s, border 0.15s' }}
                  title={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {done && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: done ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none', marginBottom: '0.25rem' }}>{task.title}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{task.description}</div>
                  {done && task.completedAt && <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Completed {new Date(task.completedAt).toLocaleDateString()}</div>}
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

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading advice topics...</div>;
  if (isError) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--color-danger, #ef4444)', fontSize: '0.875rem' }}>Failed to load advice topics.</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {CATEGORIES.map((cat) => {
          const active = categoryFilter === cat.value;
          return (
            <button key={cat.value} onClick={() => setCategoryFilter(cat.value)} style={{ padding: '0.3rem 0.875rem', borderRadius: 'var(--radius-full)', border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`, backgroundColor: active ? 'var(--color-accent)' : 'transparent', color: active ? '#fff' : 'var(--color-text)', fontSize: '0.8125rem', fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s' }}>{cat.label}</button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '3rem 0' }}>No topics in this category yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {filtered.map((topic) => {
            const pct = topic.totalTasks > 0 ? Math.round((topic.completedCount / topic.totalTasks) * 100) : 0;
            const done = topic.completedCount === topic.totalTasks && topic.totalTasks > 0;
            return (
              <div key={topic.id} style={{ backgroundColor: 'var(--color-surface)', border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem', flexShrink: 0 }}>{topic.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text)' }}>{topic.title}</div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.125rem' }}>{topic.category.replace('-', ' ')}</div>
                  </div>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0, flex: 1 }}>{topic.description}</p>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{topic.completedCount}/{topic.totalTasks} tasks</span>
                    {done && <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-success, #22c55e)' }}>Complete</span>}
                  </div>
                  <div style={{ height: 5, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)', backgroundColor: done ? 'var(--color-success, #22c55e)' : 'var(--color-accent)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
                <button onClick={() => setSelectedTopic(topic)} style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent)', backgroundColor: 'transparent', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>View checklist</button>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

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

  const isNotConfigured = messages.some((m) => m.role === 'assistant' && m.content.includes('Settings → AI Advisor'));
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab header */}
      <div style={{ display: 'flex', gap: '0.25rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {([['chat', '✨ AI Advisor'], ['library', '📚 Advice Library']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: tab === key ? 'var(--color-accent)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--color-text-muted)',
              fontSize: '0.875rem',
              fontWeight: tab === key ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat' ? <AiChatTab /> : <AdviceLibraryTab />}
      </div>
    </div>
  );
}
