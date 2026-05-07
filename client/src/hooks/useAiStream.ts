/**
 * useAiStream.ts
 * Shared hook for streaming AI responses via SSE (Server-Sent Events).
 * Used by Budget Coach, Wealth Coach, and any other page-embedded AI panel.
 *
 * Usage:
 *   const { streaming, content, error, ask, cancel } = useAiStream('/advisor/budget-coach/stream');
 *   ask({ budgetData: ..., question: 'How can I save more?' });
 */

import { useState, useRef, useCallback } from 'react';
import { getAccessToken } from '@/lib/api';

interface UseAiStreamOptions {
  /** API path relative to /api/v1 — must accept POST and respond with SSE */
  endpoint: string;
}

interface UseAiStreamResult {
  /** True while tokens are being received */
  streaming: boolean;
  /** Accumulated response text so far (or final text when done) */
  content: string;
  /** Error message if the request failed */
  error: string | null;
  /** Send a prompt — payload is merged into the POST body */
  ask: (payload: Record<string, unknown>) => void;
  /** Cancel an in-flight request */
  cancel: () => void;
  /** Reset content and error back to empty */
  reset: () => void;
}

export function useAiStream({ endpoint }: UseAiStreamOptions): UseAiStreamResult {
  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setContent('');
    setError(null);
  }, [cancel]);

  const ask = useCallback(
    async (payload: Record<string, unknown>) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreaming(true);
      setContent('');
      setError(null);

      try {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/v1${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          let msg = `Request failed (${response.status})`;
          try { msg = JSON.parse(text)?.error ?? msg; } catch { /* ignore */ }
          setError(msg);
          setStreaming(false);
          return;
        }

        if (!response.body) {
          setError('No response body');
          setStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by \n\n
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.startsWith('data: ') ? part.slice(6) : part;
            if (!line.trim()) continue;

            let evt: { token?: string; done?: boolean; error?: string };
            try { evt = JSON.parse(line); } catch { continue; }

            if (evt.error) {
              setError(evt.error);
              setStreaming(false);
              return;
            }

            if (evt.token) {
              accumulated += evt.token;
              setContent(accumulated);
            }

            if (evt.done) {
              setStreaming(false);
              return;
            }
          }
        }

        // Stream ended without explicit done event
        setStreaming(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // intentional cancel
        setError('Connection lost. Please try again.');
        setStreaming(false);
      }
    },
    [endpoint]
  );

  return { streaming, content, error, ask, cancel, reset };
}
