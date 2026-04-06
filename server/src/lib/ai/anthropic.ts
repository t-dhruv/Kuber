import Anthropic from '@anthropic-ai/sdk';
import type { AiCompletionOptions, AiCompletionResult, AiProviderClient } from './types';

export class AnthropicProvider implements AiProviderClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model  = model || 'claude-sonnet-4-5-20251001';
  }

  async complete(opts: AiCompletionOptions): Promise<AiCompletionResult> {
    const messages = opts.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      system: opts.systemPrompt
        ? [{ type: 'text' as const, text: opts.systemPrompt, cache_control: { type: 'ephemeral' as const } }]
        : undefined,
      messages,
    });

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      content,
      tokenCount: {
        input:  response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }

  async completeStream(
    opts: AiCompletionOptions,
    onToken: (token: string) => void,
  ): Promise<AiCompletionResult> {
    const messages = opts.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      system: opts.systemPrompt
        ? [{ type: 'text' as const, text: opts.systemPrompt, cache_control: { type: 'ephemeral' as const } }]
        : undefined,
      messages,
    }, { signal: opts.signal });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onToken(event.delta.text);
        fullContent += event.delta.text;
      }
      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }

    return { content: fullContent, tokenCount: { input: inputTokens, output: outputTokens } };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
