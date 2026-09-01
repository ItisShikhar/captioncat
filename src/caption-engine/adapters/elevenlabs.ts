import fs from 'node:fs';
import path from 'node:path';
import { writeTranscriptionDebugResponse } from '../debug-utils';
import {
  TranscriptEntry,
  TranscriptionProvider,
  TranscriptionProviderAdapter,
  TranscriptionProviderName,
  WordTiming,
} from '../types';

const BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'scribe_v1';

function getApiKey(provider: TranscriptionProvider): string {
  const apiKey = provider.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ElevenLabs transcription requires an API key in the provider config or ELEVENLABS_API_KEY environment variable.',
    );
  }
  return apiKey;
}

function normalizeElevenLabsTranscript(raw: any): TranscriptEntry[] {
  if (!raw) {
    return [];
  }

  const mapWord = (word: any): WordTiming => ({
    text: word.word ?? word.text ?? '',
    start: typeof word.start === 'number' ? word.start : 0,
    end: typeof word.end === 'number' ? word.end : 0,
    speakerId: word.speaker ?? word.speaker_id,
  });

  const mapSegment = (segment: any): TranscriptEntry => {
    const words = Array.isArray(segment.words) ? segment.words.map(mapWord) : undefined;

    return {
      text: String(segment.text ?? '').trim(),
      start: typeof segment.start === 'number' ? segment.start : 0,
      end: typeof segment.end === 'number' ? segment.end : 0,
      words,
      speakerId: segment.speaker ?? segment.speaker_id,
      speakerLabel: segment.speaker ?? segment.speaker_id,
    };
  };

  if (Array.isArray(raw.segments) && raw.segments.length > 0) {
    return raw.segments.map(mapSegment);
  }

  if (Array.isArray(raw.words) && raw.words.length > 0) {
    return [
      {
        text: String(raw.text ?? '').trim(),
        start: 0,
        end: 0,
        words: raw.words.map(mapWord),
      },
    ];
  }

  if (typeof raw.text === 'string') {
    return [
      {
        text: raw.text.trim(),
        start: 0,
        end: 0,
      },
    ];
  }

  return [];
}

async function buildFormData(input: string, provider?: TranscriptionProvider): Promise<FormData> {
  const resolvedPath = path.resolve(input);
  const audioBuffer = await fs.promises.readFile(resolvedPath);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }), path.basename(resolvedPath));
  form.append('model_id', DEFAULT_MODEL);

  if (provider?.language) {
    form.append('language_code', provider.language);
  }

  const responseFormat = String(provider?.options?.response_format ?? 'json');
  form.append('response_format', responseFormat);

  const timestampGranularities = Array.isArray(provider?.options?.timestamp_granularities)
    ? (provider.options.timestamp_granularities as unknown[]).map(String)
    : ['word', 'segment'];
  for (const granularity of timestampGranularities) {
    form.append('timestamp_granularities[]', granularity);
  }

  if (provider?.options?.prompt) {
    form.append('prompt', String(provider.options.prompt));
  }

  if (provider?.options?.temperature !== undefined) {
    form.append('temperature', String(provider.options.temperature));
  }

  return form;
}

export class ElevenLabsAdapter implements TranscriptionProviderAdapter {
  public readonly name = TranscriptionProviderName.ElevenLabs;

  public async transcribe(input: string, provider: TranscriptionProvider): Promise<TranscriptEntry[]> {
    const apiKey = getApiKey(provider);

    const form = await buildFormData(input, provider);
    const response = await fetch(`${BASE_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: form as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs transcription failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const body = await response.json();
    writeTranscriptionDebugResponse(provider, 'elevenlabs', body);
    return normalizeElevenLabsTranscript(body);
  }
}
