import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiCompletionOptions, AiCompletionResult, AiMessage, AiProviderClient } from './types';

export class GeminiProvider implements AiProviderClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model || 'gemini-1.5-flash';
  }

  private toGeminiHistory(messages: AiMessage[]) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }

  async complete(opts: AiCompletionOptions): Promise<AiCompletionResult> {
    const genModel = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: opts.systemPrompt,
    });

    const history = this.toGeminiHistory(opts.messages.slice(0, -1));
    const lastMsg = opts.messages[opts.messages.length - 1];
    const chat = genModel.startChat({ history });
    const result = await chat.sendMessage(lastMsg?.content ?? '');
    const text   = result.response.text();

    return { content: text };
  }

  async completeStream(
    opts: AiCompletionOptions,
    onToken: (token: string) => void,
  ): Promise<AiCompletionResult> {
    const genModel = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: opts.systemPrompt,
    });

    const history = this.toGeminiHistory(opts.messages.slice(0, -1));
    const lastMsg = opts.messages[opts.messages.length - 1];
    const chat = genModel.startChat({ history });
    const result = await chat.sendMessageStream(lastMsg?.content ?? '');

    let fullContent = '';
    for await (const chunk of result.stream) {
      if (opts.signal?.aborted) break;
      const token = chunk.text();
      if (token) { onToken(token); fullContent += token; }
    }

    return { content: fullContent };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const genModel = this.genAI.getGenerativeModel({ model: this.model });
      await genModel.generateContent('hi');
      return true;
    } catch {
      return false;
    }
  }
}
