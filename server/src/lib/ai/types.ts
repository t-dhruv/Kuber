export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'nvidia' | 'custom' | 'none';

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiCompletionOptions {
  messages: AiMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface AiCompletionResult {
  content: string;
  tokenCount?: { input: number; output: number };
}

export interface AiProviderClient {
  complete(options: AiCompletionOptions): Promise<AiCompletionResult>;
  completeStream(options: AiCompletionOptions, onToken: (token: string) => void): Promise<AiCompletionResult>;
  validateApiKey(): Promise<boolean>;
}

export interface AiConfigData {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  headers?: Record<string, string> | null;
}
