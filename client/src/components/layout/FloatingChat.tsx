import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChatStream, type ChatMessage } from '@/pages/advice/hooks/useChatStream';
import { MessageCircle, X, Send, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { SUGGESTIONS } from '@/pages/advice/components/SuggestionChips';

function ChatMessageItem({ message, onCopy }: { message: ChatMessage; onCopy: (content: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${
        isUser ? 'bg-[var(--color-surface-hover)]' : 'bg-gradient-to-br from-[var(--color-accent)] to-purple-500'
      }`}>
        {isUser ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-muted)]">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        ) : <span>✨</span>}
      </div>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[0.8125rem] leading-relaxed ${
        isUser ? 'bg-[var(--color-accent)] text-white rounded-tr-md' : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-md'
      }`}>
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingContent({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex gap-1 items-center py-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] inline-block"
            style={{ animation: `typing-bounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
          />
        ))}
        <style>{`
          @keyframes typing-bounce {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
            40% { transform: translateY(-4px); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: aiSettings } = useQuery<{ provider: string }>({
    queryKey: ['settings', 'ai'],
    queryFn: () => api.get('/settings/ai-config').then((r) => r.data),
    retry: false,
  });

  const isNotConfigured = !aiSettings?.provider || aiSettings.provider === 'none';

  const {
    messages,
    isStreaming,
    error,
    send,
    cancel,
    startNewConversation,
  } = useChatStream();

  const isDisabled = isStreaming || isNotConfigured;

  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [messages, isStreaming]);

  function handleSend(text?: string) {
    const toSend = text || inputValue.trim();
    if (!toSend || isDisabled) return;
    send(toSend);
    if (!text) setInputValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-purple-500 text-white shadow-lg hover:shadow-xl hover:shadow-[var(--color-accent)]/30 transition-all flex items-center justify-center z-40"
      >
        <MessageCircle size={24} />
      </button>

      {/* Chat Popup */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 w-[380px] h-[520px] bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-purple-500 flex items-center justify-center text-lg">✨</div>
              <div>
                <span className="text-sm font-semibold text-[var(--color-text)]">AI Advisor</span>
                {isNotConfigured ? (
                  <span className="text-[0.6875rem] text-[var(--color-text-muted)] block">Not configured</span>
                ) : (
                  <span className="text-[0.6875rem] text-[var(--color-text-muted)]">Online</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={startNewConversation}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors"
                title="New conversation"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {!hasMessages && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-purple-500 flex items-center justify-center text-2xl shadow-lg">
                  ✨
                </div>
                <div>
                  <p className="text-[0.875rem] font-medium text-[var(--color-text)]">Your AI Financial Advisor</p>
                  <p className="text-[0.75rem] text-[var(--color-text-muted)] mt-1">
                    Ask about spending, budgets, goals, or investments
                  </p>
                </div>
                {isNotConfigured ? (
                  <a
                    href="/settings"
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
                  >
                    Configure in Settings
                  </a>
                ) : (
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-full">
                    {SUGGESTIONS.slice(0, 3).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="px-2.5 py-1 text-[0.6875rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
                      >
                        {s.split('?')[0]}?
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hasMessages && messages.filter((m) => !m.streaming).map((msg, i) => (
              <ChatMessageItem key={msg.id ?? `msg-${i}`} message={msg} onCopy={() => {}} />
            ))}

            {isStreaming && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-purple-500 flex items-center justify-center text-sm shrink-0">
                  <span className="animate-pulse">✨</span>
                </div>
                <div className="rounded-2xl rounded-tl-md px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] max-w-[85%]">
                  <StreamingContent content={messages.find((m) => m.streaming)?.content ?? ''} />
                </div>
              </div>
            )}

            {error && !isStreaming && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex gap-2 items-end">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isNotConfigured ? 'Configure AI first' : 'Ask something...'}
                disabled={isDisabled}
                rows={1}
                className="flex-1 resize-none bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
                style={{ maxHeight: '80px', minHeight: '36px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isDisabled || !inputValue.trim()}
                className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-purple-500 text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}