import { ElevenLabsAdapter } from './adapters/elevenlabs';
import { OpenAIAdapter } from './adapters/openai';
import { SarvamAdapter } from './adapters/sarvam';
import { TranscriptionProvider, TranscriptionProviderAdapter, TranscriptionProviderName } from './types';

export class ProviderRegistry {
  private readonly providers = new Map<TranscriptionProviderName, TranscriptionProviderAdapter>();

  register(adapter: TranscriptionProviderAdapter): void {
    this.providers.set(adapter.name, adapter);
  }

  resolve(provider: TranscriptionProviderName | TranscriptionProvider | undefined): TranscriptionProviderAdapter | undefined {
    if (!provider) {
      return undefined;
    }

    const providerName = typeof provider === 'object' ? provider.provider : provider;
    return this.providers.get(providerName);
  }
}

export function createProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new OpenAIAdapter());
  registry.register(new ElevenLabsAdapter());
  registry.register(new SarvamAdapter());
  return registry;
}

export const BUILT_IN_PROVIDER_NAMES: TranscriptionProviderName[] = [
  TranscriptionProviderName.OpenAI,
  TranscriptionProviderName.ElevenLabs,
  TranscriptionProviderName.Sarvam,
];

export function normalizeProviderName(provider: TranscriptionProviderName | TranscriptionProvider | undefined): TranscriptionProviderName | undefined {
  if (provider === undefined || provider === null) {
    return undefined;
  }

  if (typeof provider === 'object') {
    return provider.provider;
  }

  const normalized = provider.trim().toLowerCase();
  const knownProviders = Object.values(TranscriptionProviderName) as TranscriptionProviderName[];
  return knownProviders.includes(normalized as TranscriptionProviderName)
    ? (normalized as TranscriptionProviderName)
    : undefined;
}
