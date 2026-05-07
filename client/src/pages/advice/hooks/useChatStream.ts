import { useState, useRef, useCallback } from 'react';
import { api, getAccessToken } from '@/lib/api';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  streaming?: boolean;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  conversationId: string | null;
  isStreaming: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  cancel: () => void;
  startNewConversation: () => void;
  loadConversation: (id: string) => Promise<void>;
}

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  // Keep ref in sync with state so callbacks can read it
  const updateConversationId = (id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
  };

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    // Remove the trailing streaming indicator
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  }, []);

  const startNewConversation = useCallback(() => {
    cancel();
    updateConversationId(null);
    setMessages([]);
    setError(null);
  }, [cancel]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      setError(null);
      const res = await api.get(`/advisor/conversations/${id}/messages`);
      const loaded: ChatMessage[] = (res.data as Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));
      setMessages(loaded);
      updateConversationId(id);
    } catch (err) {
      console.error('[useChatStream] loadConversation error', err);
      setError('Failed to load conversation');
    }
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setError(null);

    // Append the user message immediately
    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Placeholder streaming assistant message
    const assistantPlaceholder: ChatMessage = {
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedContent = '';

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/v1/advisor/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: text,
          ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw) as {
              token?: string;
              done?: boolean;
              conversationId?: string;
              messageId?: string;
              error?: string;
            };

            if (event.token) {
              accumulatedContent += event.token;
              setMessages((prev) => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (next[lastIdx]?.streaming) {
                  next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                }
                return next;
              });
            }

            if (event.error) {
              setMessages((prev) => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (next[lastIdx]?.streaming) {
                  next[lastIdx] = { ...next[lastIdx], content: event.error!, streaming: false };
                }
                return next;
              });
            }

            if (event.done) {
              if (event.conversationId) {
                updateConversationId(event.conversationId);
              }
              setMessages((prev) => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (next[lastIdx]?.streaming) {
                  next[lastIdx] = {
                    ...next[lastIdx],
                    id: event.messageId,
                    streaming: false,
                  };
                }
                return next;
              });
            }
          } catch {
            // Ignore parse errors for non-data lines (keepalive, etc.)
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        // User cancelled — already handled in cancel()
      } else {
        console.error('[useChatStream] send error', err);
        setError('Failed to send message. Please try again.');
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx]?.streaming) {
            next[lastIdx] = { ...next[lastIdx], streaming: false, content: accumulatedContent || 'Sorry, something went wrong.' };
          }
          return next;
        });
      }
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  return { messages, conversationId, isStreaming, error, send, cancel, startNewConversation, loadConversation };
}
