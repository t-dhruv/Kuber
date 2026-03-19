import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

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

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
}: {
  message: Message;
  userInitial: string;
  onSuggestion: (text: string) => void;
}) {
  const isUser = message.role === 'user';

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
          backgroundColor: isUser ? 'var(--color-accent)' : 'var(--color-accent)',
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

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdvicePage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | undefined>();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['advisor', 'conversations'],
    queryFn: () => api.get('/advisor/conversations').then((r) => r.data.data ?? r.data),
    retry: false,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

      try {
        const resp = await api.post('/advisor/chat', {
          message: trimmed,
          conversationId,
        });
        const body = resp.data.data ?? resp.data;
        const assistantMsg: Message = {
          id: genId(),
          role: 'assistant',
          content: body.reply ?? body.message ?? 'Sorry, I could not process that.',
          suggestions: body.suggestions,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (body.conversationId) setConversationId(body.conversationId);
      } catch {
        const errorMsg: Message = {
          id: genId(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [loading, conversationId]
  );

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
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Derive user initial from auth — fallback to 'U'
  const userInitial = 'U';

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 3.5rem)',
        overflow: 'hidden',
        gap: 0,
      }}
    >
      {/* ── Left sidebar: conversation history ── */}
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
          {/* Current (unsaved) session */}
          <div
            onClick={startNewConversation}
            style={{
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              marginBottom: '0.25rem',
              backgroundColor: !activeConvId ? 'var(--color-accent-light)' : 'transparent',
              border: !activeConvId ? '1px solid var(--color-accent)' : '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              if (activeConvId) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
            }}
            onMouseLeave={(e) => {
              if (activeConvId) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: !activeConvId ? 'var(--color-accent)' : 'var(--color-text)',
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

          {/* Past conversations */}
          {conversations && conversations.length > 0 ? (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                style={{
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  marginBottom: '0.25rem',
                  backgroundColor: activeConvId === conv.id ? 'var(--color-accent-light)' : 'transparent',
                  border:
                    activeConvId === conv.id
                      ? '1px solid var(--color-accent)'
                      : '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (activeConvId !== conv.id)
                    e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  if (activeConvId !== conv.id)
                    e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {conv.title}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                    marginTop: '0.125rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {conv.lastMessage}
                </div>
              </div>
            ))
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

      {/* ── Right main: chat interface ── */}
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
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              userInitial={userInitial}
              onSuggestion={handleSuggestion}
            />
          ))}

          {loading && <TypingIndicator />}

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
            disabled={loading}
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
            disabled={!input.trim() || loading}
            style={{
              backgroundColor: input.trim() && !loading ? 'var(--color-accent)' : 'var(--color-border)',
              color: input.trim() && !loading ? '#fff' : 'var(--color-text-muted)',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
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
