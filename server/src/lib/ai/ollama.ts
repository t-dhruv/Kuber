import { OpenAiProvider } from './openai';
import type { AiConfigData, AiProviderClient } from './types';

// Ollama uses an OpenAI-compatible API at http://localhost:11434/v1
// No API key is needed — pass empty string.

export class OllamaProvider extends OpenAiProvider implements AiProviderClient {
  constructor(config: AiConfigData) {
    super(
      config.apiKey || 'ollama',
      config.model || 'llama3.2',
      config.baseUrl || 'http://localhost:11434/v1',
    );
  }
}
