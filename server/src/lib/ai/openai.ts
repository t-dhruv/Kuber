import OpenAI from 'openai';
import type { AiCompletionOptions, AiCompletionResult, AiProviderClient } from './types';

export class OpenAiProvider implements AiProviderClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string | null) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl ?? undefined });
    this.model  = model || 'gpt-4o-mini';
  }

  async complete(opts: AiCompletionOptions): Promise<AiCompletionResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    for (const m of opts.messages) {
      if (m.role === 'system') continue;
      messages.push({ role: m.role, content: m.content });
    }

    const response = await this.client.chat.completions.create({
      model:       this.model,
      messages,
      max_tokens:  opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      tokenCount: {
        input:  response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async completeStream(
    opts: AiCompletionOptions,
    onToken: (token: string) => void,
  ): Promise<AiCompletionResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    for (const m of opts.messages) {
      if (m.role === 'system') continue;
      messages.push({ role: m.role, content: m.content });
    }

    let fullContent = '';

    const stream = await this.client.chat.completions.create({
      model:       this.model,
      messages,
      max_tokens:  opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (token) { onToken(token); fullContent += token; }
    }

    return { content: fullContent };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}
