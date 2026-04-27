import type { AiConfig } from '@prisma/client';
import { decrypt } from '../encryption';
import { AnthropicProvider } from './anthropic';
import { CustomProvider } from './custom';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { OpenAiProvider } from './openai';
import { NvidiaProvider } from './nvidia';
import { OpenRouterProvider } from './openrouter';
import type { AiConfigData, AiProvider, AiProviderClient } from './types';

export * from './types';

// 5-minute client cache to avoid re-instantiating on every request
interface CacheEntry { client: AiProviderClient; expiresAt: number }
const clientCache = new Map<string, CacheEntry>();

export function invalidateAiCache(householdId: string): void {
  clientCache.delete(householdId);
}

export function getAiClient(config: AiConfig): AiProviderClient {
  const provider = config.provider as AiProvider;
  if (provider === 'none' || !provider) {
    throw new Error('AI provider not configured. Go to Settings → AI Advisor to set up.');
  }

  const cached = clientCache.get(config.householdId);
  if (cached && Date.now() < cached.expiresAt) return cached.client;

  const apiKey  = decrypt(config.encryptedApiKey);
  let parsedHeaders: Record<string, string> | null = null;
  if ((config as any).headers) {
    try { parsedHeaders = JSON.parse((config as any).headers); } catch { /* ignore bad JSON */ }
  }
  const data: AiConfigData = {
    provider,
    model:   config.model,
    apiKey,
    baseUrl: config.baseUrl,
    headers: parsedHeaders,
  };

  let client: AiProviderClient;
  switch (provider) {
    case 'anthropic':   client = new AnthropicProvider(apiKey, data.model); break;
    case 'openai':      client = new OpenAiProvider(apiKey, data.model); break;
    case 'gemini':      client = new GeminiProvider(apiKey, data.model); break;
    case 'openrouter':  client = new OpenRouterProvider(data); break;
    case 'nvidia':      client = new NvidiaProvider(data); break;
    case 'ollama':      client = new OllamaProvider(data); break;
    case 'custom':      client = new CustomProvider(data); break;
    default: throw new Error(`Unknown AI provider: ${provider}`);
  }

  clientCache.set(config.householdId, { client, expiresAt: Date.now() + 5 * 60 * 1000 });
  return client;
}

export async function getAiClientForHousehold(
  householdId: string,
  prisma: { aiConfig: { findUnique: (args: any) => Promise<AiConfig | null> } },
): Promise<AiProviderClient> {
  const config = await prisma.aiConfig.findUnique({ where: { householdId } });
  if (!config || config.provider === 'none') {
    throw new Error('AI provider not configured. Go to Settings → AI Advisor to set up.');
  }
  return getAiClient(config);
}
