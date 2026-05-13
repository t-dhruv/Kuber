import { OpenAiProvider } from './openai';
import type { AiConfigData, AiProviderClient } from './types';

// Custom provider: OpenAI-compatible API at any baseUrl with optional extra headers.
// API key is optional (pass empty string if not needed).

export class CustomProvider extends OpenAiProvider implements AiProviderClient {
  constructor(config: AiConfigData) {
    if (!config.baseUrl) {
      throw new Error('Custom provider requires a Base URL');
    }
    super(
      config.apiKey || 'custom',
      config.model || 'default',
      config.baseUrl,
      config.headers ?? null,
    );
  }
}
