import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

// ─── Shared Types ─────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
}

interface ServerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Nice to meet you! I'm your AI financial advisor. I can help you understand your spending, budgets, and financial health.\n\nDisclaimer: AI responses are for informational purposes only and do not constitute financial advice.",
  suggestions: [
    'How is my budget?',
    'What did I spend most on?',
    'Am I saving enough?',
    'Show my net worth',
  ],
  timestamp: new Date(),
};

const NOT_CONFIGURED_SNIPPET = 'Settings → AI Advisor';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'save', label: 'Save' },
  { value: 'spend', label: 'Spend' },
  { value: 'pay-down', label: 'Pay Down' },
  { value: 'invest', label: 'Invest' },
  { value: 'protect', label: 'Protect' },
  { value: 'wellness', label: 'Wellness' },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.75rem 1rem' }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          flexShrink: 0,
        }}
      >
        ✨
      </div>
      <div
        style={{
          backgroundColor: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.625rem 0.875rem',
          display: 'flex',
          gap: '0.3rem',
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: 'var(--color-text-muted)',
              display: 'inline-block',
              animation: 'typing-bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes typing-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  userInitial,
  onSuggestion,
  onGoToSettings,
}: {
  message: Message;
  userInitial: string;
  onSuggestion: (text: string) => void;
  onGoToSettings: () => void;
}) {
  const isUser = message.role === 'user';
  const isNotConfigured = !isUser && message.content.includes(NOT_CONFIGURED_SNIPPET);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: '0.5rem',
        alignItems: 'flex-start',
        padding: '0.25rem 1rem',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isUser ? '0.75rem' : '1rem',
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {isUser ? userInitial : '✨'}
      </div>

      {/* Content */}
      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {/* Bubble */}
        <div
          style={{
            backgroundColor: isUser ? 'var(--color-accent)' : 'var(--color-surface-hover)',
            color: isUser ? '#fff' : 'var(--color-text)',
            borderRadius: isUser
              ? 'var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)'
              : 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
            padding: '0.625rem 0.875rem',
            fontSize: '0.875rem',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>

        {/* Settings link for unconfigured state */}
        {isNotConfigured && (
          <button
            onClick={onGoToSettings}
            style={{
              alignSelf: 'flex-start',
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-accent)',
              backgroundColor: 'var(--color-accent-light)',
              color: 'var(--color-accent)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Go to Settings → AI Advisor
          </button>
        )}

        {/* Suggestions */}
        {!isNotConfigured && message.suggestions && message.suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.125rem' }}>
            {message.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--color-accent)',
                  backgroundColor: 'var(--color-accent-light)',
                  color: 'var(--color-accent)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-accent)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-accent-light)';
                  e.currentTarget.style.color = 'var(--color-accent)';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {fmtTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          backgroundColor: 'var(--color-surface)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.75rem' }}>{topic.icon}</span>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                {topic.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                fontSize: '1.1rem',
                padding: '0.25rem 0.375rem',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0 0 1rem' }}>
            {topic.description}
          </p>

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Progress</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>
                {topic.completedCount} of {topic.totalTasks} tasks complete
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: pct === 100 ? 'var(--color-success, #22c55e)' : 'var(--color-accent)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem' }}>
          {topic.tasks.map((task) => {
            const done = task.completedAt !== null;
            return (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  gap: '0.875rem',
                  padding: '0.875rem 0',
                  borderBottom: '1px solid var(--color-border)',
                  alignItems: 'flex-start',
                }}
              >
                <button
                  onClick={() => onToggleTask(topic.id, task.id)}
                  style={{
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    borderRadius: 'var(--radius-sm)',
                    border: done ? 'none' : '2px solid var(--color-border)',
                    backgroundColor: done ? 'var(--color-accent)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '0.125rem',
                    transition: 'background 0.15s, border 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!done) e.currentTarget.style.borderColor = 'var(--color-accent)';
                  }}
                  onMouseLeave={(e) => {
                    if (!done) e.currentTarget.style.borderColor = 'var(--color-border)';
                  }}
                  title={done ? 'Mark incomplete' : 'Mark complete'}
                >
                  {done && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: done ? 'var(--color-text-muted)' : 'var(--color-text)',
                      textDecoration: done ? 'line-through' : 'none',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {task.title}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {task.description}
                  </div>
                  {done && task.completedAt && (
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      Completed {new Date(task.completedAt).toLocaleDateString()}
                    </div>
                  )}
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advice', 'topics'] });
    },
  });

  function handleToggleTask(topicId: string, taskId: string) {
    toggleTask.mutate({ topicId, taskId });
    // Optimistically update the selectedTopic in state so the panel feels instant
    if (selectedTopic && selectedTopic.id === topicId) {
      const taskIndex = selectedTopic.tasks.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) return;
      const task = selectedTopic.tasks[taskIndex];
      const nowDone = task.completedAt === null;
      const updatedTasks = selectedTopic.tasks.map((t) =>
        t.id === taskId ? { ...t, completedAt: nowDone ? new Date().toISOString() : null } : t
      );
      const newCount = updatedTasks.filter((t) => t.completedAt !== null).length;
      setSelectedTopic({ ...selectedTopic, tasks: updatedTasks, completedCount: newCount });
    }
  }

  // Sync selectedTopic with fresh query data when it arrives
  useEffect(() => {
    if (!topics || !selectedTopic) return;
    const fresh = topics.find((t) => t.id === selectedTopic.id);
    if (fresh) setSelectedTopic(fresh);
  // selectedTopic.id is a stable selector — we intentionally omit the full
  // object from deps to avoid an update loop (setting state from derived state).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, selectedTopic?.id]);

  const filtered = (topics ?? []).filter(
    (t) => categoryFilter === 'all' || t.category === categoryFilter
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        Loading advice topics...
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--color-danger, #ef4444)', fontSize: '0.875rem' }}>
        Failed to load advice topics.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
      {/* Category filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {CATEGORIES.map((cat) => {
          const active = categoryFilter === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              style={{
                padding: '0.3rem 0.875rem',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text)',
                fontSize: '0.8125rem',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Topic grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '3rem 0' }}>
          No topics in this category yet.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {filtered.map((topic) => {
            const pct = topic.totalTasks > 0 ? Math.round((topic.completedCount / topic.totalTasks) * 100) : 0;
            const done = topic.completedCount === topic.totalTasks && topic.totalTasks > 0;
            return (
              <div
                key={topic.id}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {/* Icon + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem', flexShrink: 0 }}>{topic.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text)' }}>
                      {topic.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: 'var(--color-accent)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginTop: '0.125rem',
                      }}
                    >
                      {topic.category.replace('-', ' ')}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-muted)',
                    lineHeight: 1.5,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {topic.description}
                </p>

                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                      {topic.completedCount}/{topic.totalTasks} tasks
                    </span>
                    {done && (
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-success, #22c55e)' }}>
                        Complete
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      height: 5,
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: done ? 'var(--color-success, #22c55e)' : 'var(--color-accent)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* View button */}
                <button
                  onClick={() => setSelectedTopic(topic)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-accent)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-accent)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-accent)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-accent)';
                  }}
                >
                  View checklist
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Topic detail panel */}
      {selectedTopic && (
        <TopicDetailPanel
          topic={selectedTopic}
          onClose={() => setSelectedTopic(null)}
          onToggleTask={handleToggleTask}
        />
      )}
    </div>
  );
}

// ─── AI Chat Tab ──────────────────────────────────────────────────────────────

function AiChatTab({ onGoToSettings }: { onGoToSettings: () => void }) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | undefined>();
  const [loadingConv, setLoadingConv] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancel any in-flight SSE stream when the component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['advisor', 'conversations'],
    queryFn: () => api.get('/advisor/conversations').then((r) => r.data),
    retry: false,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingContent]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: genId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setStreamingContent('');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch('/api/v1/advisor/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ message: trimmed, conversationId }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.startsWith('data: ') ? part.slice(6) : part;
            if (!line.trim()) continue;

            let evt: { token?: string; done?: boolean; conversationId?: string; messageId?: string; error?: string };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }

            if (evt.error) {
              const errorMsg: Message = {
                id: genId(),
                role: 'assistant',
                content: evt.error,
                timestamp: new Date(),
              };
              setStreamingContent('');
              setMessages((prev) => [...prev, errorMsg]);
              return;
            }

            if (evt.token) {
              accumulated += evt.token;
              setStreamingContent(accumulated);
            }

            if (evt.done) {
              const assistantMsg: Message = {
                id: evt.messageId ?? genId(),
                role: 'assistant',
                content: accumulated,
                timestamp: new Date(),
              };
              setStreamingContent('');
              setMessages((prev) => [...prev, assistantMsg]);
              if (evt.conversationId) {
                setConversationId(evt.conversationId);
                setActiveConvId(evt.conversationId);
                queryClient.invalidateQueries({ queryKey: ['advisor', 'conversations'] });
              }
            }
          }
        }
      } catch {
        const errorMsg: Message = {
          id: genId(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        };
        setStreamingContent('');
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
        setStreamingContent('');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [loading, conversationId, queryClient, accessToken]
  );

  async function loadConversation(convId: string) {
    if (loadingConv) return;
    setLoadingConv(true);
    try {
      const resp = await api.get(`/advisor/conversations/${convId}/messages`);
      const serverMsgs: ServerMessage[] = resp.data;
      const loaded: Message[] = serverMsgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(loaded.length > 0 ? loaded : [INITIAL_WELCOME]);
      setConversationId(convId);
      setActiveConvId(convId);
    } catch {
      // Leave current messages intact on error
    } finally {
      setLoadingConv(false);
    }
  }

  async function deleteConversation(e: React.MouseEvent, convId: string) {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(convId);
    try {
      await api.delete(`/advisor/conversations/${convId}`);
      queryClient.invalidateQueries({ queryKey: ['advisor', 'conversations'] });
      if (activeConvId === convId) {
        startNewConversation();
      }
    } catch {
      // silently ignore
    } finally {
      setDeletingId(undefined);
    }
  }

  function handleSuggestion(text: string) {
    sendMessage(text);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function startNewConversation() {
    setMessages([INITIAL_WELCOME]);
    setConversationId(undefined);
    setActiveConvId(undefined);
    setInput('');
    setStreamingContent('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const userInitial = 'U';

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left sidebar: conversation history */}
      <aside
        style={{
          width: 300,
          flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Conversations
          </span>
          <button
            onClick={startNewConversation}
            title="New conversation"
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.3rem 0.625rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {!activeConvId && (
            <div
              style={{
                padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '0.25rem',
                backgroundColor: 'var(--color-accent-light)',
                border: '1px solid var(--color-accent)',
              }}
            >
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                New conversation
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                Current session
              </div>
            </div>
          )}

          {conversations && conversations.length > 0 ? (
            conversations.map((conv) => {
              const isActive = activeConvId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: loadingConv ? 'wait' : 'pointer',
                    marginBottom: '0.25rem',
                    backgroundColor: isActive ? 'var(--color-accent-light)' : 'transparent',
                    border: isActive ? '1px solid var(--color-accent)' : '1px solid transparent',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {conv.title || 'Conversation'}
                    </div>
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        color: 'var(--color-text-muted)',
                        marginTop: '0.125rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {fmtRelative(conv.updatedAt)}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => deleteConversation(e, conv.id)}
                    disabled={deletingId === conv.id}
                    title="Delete conversation"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: deletingId === conv.id ? 'wait' : 'pointer',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.8125rem',
                      padding: '0.125rem 0.25rem',
                      borderRadius: 'var(--radius-sm)',
                      flexShrink: 0,
                      opacity: 0.6,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--color-danger, #ef4444)';
                      e.currentTarget.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--color-text-muted)';
                      e.currentTarget.style.opacity = '0.6';
                    }}
                  >
                    {deletingId === conv.id ? '…' : '✕'}
                  </button>
                </div>
              );
            })
          ) : (
            <div
              style={{
                padding: '2rem 0.75rem',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.8125rem',
              }}
            >
              No past conversations
            </div>
          )}
        </div>
      </aside>

      {/* Right main: chat interface */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        {/* Chat header */}
        <div
          style={{
            height: '3.25rem',
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1rem',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '1rem' }}>✨</span>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
            Kuber AI Assistant
          </span>
          <button
            onClick={startNewConversation}
            title="New conversation"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: '1.1rem',
              padding: '0.25rem 0.375rem',
              borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            ✕
          </button>
        </div>

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {loadingConv ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              Loading conversation...
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                userInitial={userInitial}
                onSuggestion={handleSuggestion}
                onGoToSettings={onGoToSettings}
              />
            ))
          )}

          {loading && streamingContent ? (
            /* Streaming bubble — shows tokens as they arrive */
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '0.5rem',
                alignItems: 'flex-start',
                padding: '0.25rem 1rem',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  flexShrink: 0,
                }}
              >
                ✨
              </div>
              <div style={{ maxWidth: '75%' }}>
                <div
                  style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text)',
                    borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                    padding: '0.625rem 0.875rem',
                    fontSize: '0.875rem',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {streamingContent}
                  <span
                    style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '1em',
                      backgroundColor: 'var(--color-accent)',
                      marginLeft: '1px',
                      verticalAlign: 'text-bottom',
                      animation: 'streaming-cursor 0.8s step-end infinite',
                    }}
                  />
                  <style>{`
                    @keyframes streaming-cursor {
                      0%, 100% { opacity: 1; }
                      50% { opacity: 0; }
                    }
                  `}</style>
                </div>
              </div>
            </div>
          ) : loading ? (
            <TypingIndicator />
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            padding: '0.75rem 1rem',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your money..."
            disabled={loading || loadingConv}
            style={{
              flex: 1,
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || loadingConv}
            style={{
              backgroundColor:
                input.trim() && !loading && !loadingConv
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
              color:
                input.trim() && !loading && !loadingConv ? '#fff' : 'var(--color-text-muted)',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: input.trim() && !loading && !loadingConv ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              flexShrink: 0,
            }}
          >
            Send →
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = 'chat' | 'library';

export default function AdvicePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  function goToSettings() {
    navigate('/settings?tab=ai');
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 3.5rem)',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          padding: '0 1.5rem',
          gap: '0',
        }}
      >
        {([
          { key: 'chat', label: '✨ AI Chat' },
          { key: 'library', label: '📚 Advice Library' },
        ] as { key: Tab; label: string }[]).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '0.875rem 1.25rem',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontSize: '0.875rem',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'chat' ? (
          <AiChatTab onGoToSettings={goToSettings} />
        ) : (
          <AdviceLibraryTab />
        )}
      </div>
    </div>
  );
}
