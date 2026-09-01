import { createDefaultConfig } from './config';
import { createProviderRegistry, normalizeProviderName, ProviderRegistry } from './providers';
import {
    CaptionEngine,
    RenderResult,
    RenderRequest,
    TranscriptEntry,
    TranscriptionProvider,
    TranscriptionProviderName,
} from './types';

function isValidApiKey(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getProviderApiKey(provider: TranscriptionProvider): string | undefined {
  if (isValidApiKey(provider.apiKey)) {
    return provider.apiKey;
  }

  const providerEnvName = `${provider.provider
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}_API_KEY`;
  return isValidApiKey(process.env[providerEnvName]) ? process.env[providerEnvName] : undefined;
}

export class DefaultCaptionEngine implements CaptionEngine {
  constructor(
    protected readonly config: RenderRequest = createDefaultConfig(),
    protected readonly registry: ProviderRegistry = createProviderRegistry(),
  ) {}

  async render(request: RenderRequest): Promise<RenderResult> {
    const result: RenderResult = {};

    if (request.exports?.transcript) {
      result.transcript = { ...request.exports.transcript };
    }

    if (request.exports?.captions) {
      result.captions = { ...request.exports.captions };
    }

    if (request.renders) {
      result.renders = request.renders.map((render) => ({
        preset: render.preset,
        outputs: {
          ...(render.outputs.pngSequence ? { pngSequence: { directory: render.outputs.pngSequence.directory } } : {}),
          ...(render.outputs.standaloneCaptionMovie
            ? { standaloneCaptionMovie: { path: render.outputs.standaloneCaptionMovie.path } }
            : {}),
          ...(render.outputs.overlayVideo ? { overlayVideo: { path: render.outputs.overlayVideo.path } } : {}),
        },
      }));
    }

    return result;
  }

  async transcribe(input: string, providers?: TranscriptionProvider[]): Promise<TranscriptEntry[]> {
    const effectiveConfig = this.config;
    const candidateProviders: TranscriptionProvider[] = [];
    const configuredProviders = providers ?? effectiveConfig.transcription?.providers ?? [];
    configuredProviders.forEach((provider) => {
      const normalized = normalizeProviderName(provider);
      if (normalized) {
        candidateProviders.push({
          provider: normalized,
          ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
          ...(provider.language ? { language: provider.language } : {}),
          ...(provider.options ? { options: provider.options } : {}),
        });
      }
    });

    if (candidateProviders.length === 0) {
      return [];
    }

    const errors: { provider: TranscriptionProviderName; error: Error }[] = [];
    let attemptedTranscription = false;

    for (const providerConfig of candidateProviders) {
      const adapter = this.registry.resolve(providerConfig);
      if (!adapter) {
        errors.push({ provider: providerConfig.provider, error: new Error(`Unsupported transcription provider: ${providerConfig.provider}`) });
        continue;
      }

      const apiKey = getProviderApiKey(providerConfig);
      if (!isValidApiKey(apiKey)) {
        continue;
      }
      attemptedTranscription = true;

      try {
        return await adapter.transcribe(input, providerConfig);
      } catch (error) {
        errors.push({ provider: providerConfig.provider, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    if (!attemptedTranscription) {
      const providerNames = candidateProviders.map((provider) => provider.provider).join(', ');
      throw new Error(
        `No valid API key was provided for any transcription provider in the fallback list: ${providerNames}. ` +
          `Provide at least one provider entry in the transcription.providers array with an API key or a matching environment variable.`,
      );
    }

    if (errors.length === 0) {
      return [];
    }

    const errorMessages = errors.map((entry) => `${entry.provider}: ${entry.error.message}`).join('; ');
    throw new Error(`All transcription providers failed: ${errorMessages}`);
  }
}
