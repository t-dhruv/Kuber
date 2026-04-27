import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType } from '../hooks/useChatStream';

interface Props {
  message: ChatMessageType;
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function ChatMessage({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  function handleCopy() {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start group`}>
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5 shadow-sm ${
        isUser ? 'bg-[var(--color-surface-hover)]' : 'bg-gradient-to-br from-[var(--color-accent)] to-purple-500'
      }`}>
        {isUser ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-muted)]">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <span className="text-lg">✨</span>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1.5 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed shadow-sm ${
            isUser
              ? 'bg-gradient-to-br from-[var(--color-accent)] to-[#7c3aed] text-white rounded-tr-md'
              : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-md'
          }`}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-blockquote:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer: timestamp + copy */}
        <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          {message.createdAt && (
            <span className="text-[0.6875rem] text-[var(--color-text-muted)]">
              {fmtTime(message.createdAt)}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[0.6875rem] text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-1.5 py-0.5 rounded border border-transparent hover:border-[var(--color-border)]"
            title="Copy message"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
