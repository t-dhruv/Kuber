import { OpenAiProvider } from './openai';
import type { AiConfigData, AiProviderClient } from './types';

export class OpenRouterProvider extends OpenAiProvider implements AiProviderClient {
  constructor(config: AiConfigData) {
    super(config.apiKey, config.model, config.baseUrl || 'https://openrouter.ai/api/v1');
  }
}
