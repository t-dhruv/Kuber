import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  onCancel: () => void;
}

export const StreamingMessage = React.memo(function StreamingMessage({ content, onCancel }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom as tokens arrive
  useEffect(() => {
    const el = contentRef.current?.closest('[data-chat-scroll]');
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [content]);

  return (
    <div className="flex gap-3 px-4 py-3 flex-row items-start">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-purple-500 flex items-center justify-center text-base flex-shrink-0 mt-0.5 shadow-sm">
        <span className="text-lg animate-pulse">✨</span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2.5 max-w-[78%] items-start">
        <div
          ref={contentRef}
          className="rounded-2xl rounded-tl-md px-4 py-3 text-[0.9375rem] leading-relaxed bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] shadow-sm"
        >
          {content ? (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-blockquote:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
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
          )}
          {content && <span className="inline-block w-0.5 h-4 bg-[var(--color-accent)] ml-0.5 align-middle animate-pulse" />}
        </div>

        <button
          onClick={onCancel}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] rounded-full px-3 py-1 transition-colors"
        >
          Stop generating
        </button>
      </div>
    </div>
  );
});
