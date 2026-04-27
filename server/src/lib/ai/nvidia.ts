import { OpenAiProvider } from './openai';
import type { AiConfigData, AiProviderClient } from './types';

export class NvidiaProvider extends OpenAiProvider implements AiProviderClient {
  constructor(config: AiConfigData) {
    super(config.apiKey, config.model, config.baseUrl || 'https://integrate.api.nvidia.com/v1');
  }
}
