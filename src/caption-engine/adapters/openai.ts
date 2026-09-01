import fs from 'node:fs';
import path from 'node:path';
import { writeTranscriptionDebugResponse } from '../debug-utils';
import type { TranscriptEntry, TranscriptionProvider, TranscriptionProviderAdapter, WordTiming } from '../types';
import { TranscriptionProviderName } from '../types';

const BASE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';

function getApiKey(provider: TranscriptionProvider): string {
  const apiKey = provider.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OpenAI transcription requires an API key in the provider config or OPENAI_API_KEY environment variable.',
    );
  }
  return apiKey;
}

function getAudioBuffer(input: string): Buffer {
  const resolvedPath = path.resolve(input);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error(`OpenAI adapter requires a local audio file path. Received: ${input}`);
  }
  return fs.readFileSync(resolvedPath);
}

type MultipartField = {
  name: string;
  value: string;
};

function buildMultipartFormData(
  audioBuffer: Buffer,
  fileName: string,
  fields: MultipartField[],
): { boundary: string; body: Buffer } {
  const boundary = `----caption-engine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const field of fields) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`),
    );
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
  );
  chunks.push(audioBuffer);
  chunks.push(Buffer.from('\r\n'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return { boundary, body: Buffer.concat(chunks) };
}

function normalizeOpenAITranscript(raw: unknown): TranscriptEntry[] {
  const payload = raw as Record<string, unknown> | null | undefined;
  if (!payload) {
    return [];
  }

  // The OpenAI API can return equal start and end times. The minimum duration keeps the word visible.
  const MIN_WORD_DURATION_SECONDS = 0.15;
  const WORD_GAP_PADDING_SECONDS = 0.01;

  const mapWord = (word: Record<string, unknown>, previousWordEnd?: number, nextWordStart?: number): WordTiming => {
    const confidence = typeof word.confidence === 'number' ? word.confidence : undefined;
    const speakerId =
      typeof word.speaker === 'string'
        ? word.speaker
        : typeof word.speaker_id === 'string'
          ? word.speaker_id
          : undefined;
    const start = typeof word.start === 'number' ? word.start : 0;
    const end = typeof word.end === 'number' ? word.end : 0;

    if (end > start) {
      return {
        text: String(word.word ?? word.text ?? ''),
        start,
        end,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
      };
    }

    if (typeof previousWordEnd === 'number' && typeof nextWordStart === 'number' && nextWordStart > previousWordEnd) {
      const inferredStart = previousWordEnd + WORD_GAP_PADDING_SECONDS;
      const inferredEnd = nextWordStart - WORD_GAP_PADDING_SECONDS;
      return {
        text: String(word.word ?? word.text ?? ''),
        start: inferredStart,
        end: inferredEnd > inferredStart ? inferredEnd : inferredStart + MIN_WORD_DURATION_SECONDS,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
      };
    }

    if (typeof previousWordEnd === 'number') {
      const inferredStart = previousWordEnd + WORD_GAP_PADDING_SECONDS;
      return {
        text: String(word.word ?? word.text ?? ''),
        start: inferredStart,
        end: inferredStart + MIN_WORD_DURATION_SECONDS,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
      };
    }

    if (typeof nextWordStart === 'number') {
      const inferredEnd = Math.max(nextWordStart - WORD_GAP_PADDING_SECONDS, start);
      return {
        text: String(word.word ?? word.text ?? ''),
        start: inferredEnd - WORD_GAP_PADDING_SECONDS,
        end: inferredEnd,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
      };
    }

    if (typeof start === 'number' && start === 0) {
      const inferredStart = Math.max(start - 0.085 * String(word.word ?? word.text ?? '').length, 0);
      return {
        text: String(word.word ?? word.text ?? ''),
        start: inferredStart,
        end: inferredStart + MIN_WORD_DURATION_SECONDS,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(speakerId !== undefined ? { speakerId } : {}),
      };
    }

    return {
      text: String(word.word ?? word.text ?? ''),
      start,
      end: start + MIN_WORD_DURATION_SECONDS,
      ...(confidence !== undefined ? { confidence } : {}),
      ...(speakerId !== undefined ? { speakerId } : {}),
    };
  };

  const mapSegment = (segment: Record<string, unknown>): TranscriptEntry => {
    const rawWords = Array.isArray(segment.words) ? segment.words : undefined;
    const words = Array.isArray(rawWords)
      ? rawWords
          .map((word, index) => {
            const previousWord = rawWords[index - 1] as Record<string, unknown> | undefined;
            const nextWord = rawWords[index + 1] as Record<string, unknown> | undefined;
            const previousWordEnd = typeof previousWord?.end === 'number' ? previousWord.end : undefined;
            const nextWordStart = typeof nextWord?.start === 'number' ? nextWord.start : undefined;
            return mapWord(word as Record<string, unknown>, previousWordEnd, nextWordStart);
          })
          .filter((word: WordTiming) => String(word.text ?? '').trim().length > 0)
      : undefined;
    const speakerId =
      typeof segment.speaker === 'string'
        ? segment.speaker
        : typeof segment.speaker_id === 'string'
          ? segment.speaker_id
          : undefined;
    const speakerLabel =
      typeof segment.speaker === 'string'
        ? segment.speaker
        : typeof segment.speaker_id === 'string'
          ? segment.speaker_id
          : undefined;

    return {
      text: String(segment.text ?? '').trim(),
      start: typeof segment.start === 'number' ? segment.start : 0,
      end: typeof segment.end === 'number' ? segment.end : 0,
      ...(words !== undefined ? { words } : {}),
      ...(speakerId !== undefined ? { speakerId } : {}),
      ...(speakerLabel !== undefined ? { speakerLabel } : {}),
    };
  };

  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  if (segments.length > 0) {
    const mappedSegments = segments.map((segment) => mapSegment(segment as Record<string, unknown>));
    if (mappedSegments.some((segment: TranscriptEntry) => Array.isArray(segment.words) && segment.words.length > 0)) {
      return mappedSegments;
    }
  }

  const words = Array.isArray(payload.words) ? payload.words : [];
  if (words.length > 0) {
    return [
      {
        text: String(payload.text ?? '').trim(),
        start: 0,
        end: 0,
        words: words
          .map((word, index) => {
            const previousWord = words[index - 1] as Record<string, unknown> | undefined;
            const nextWord = words[index + 1] as Record<string, unknown> | undefined;
            const previousWordEnd = typeof previousWord?.end === 'number' ? previousWord.end : undefined;
            const nextWordStart = typeof nextWord?.start === 'number' ? nextWord.start : undefined;
            return mapWord(word as Record<string, unknown>, previousWordEnd, nextWordStart);
          })
          .filter((word: WordTiming) => String(word.text ?? '').trim().length > 0),
      },
    ];
  }

  if (typeof payload.text === 'string') {
    return [
      {
        text: payload.text.trim(),
        start: 0,
        end: 0,
      },
    ];
  }

  return [];
}

export class OpenAIAdapter implements TranscriptionProviderAdapter {
  public readonly name = TranscriptionProviderName.OpenAI;

  public async transcribe(input: string, provider: TranscriptionProvider): Promise<TranscriptEntry[]> {
    const apiKey = getApiKey(provider);

    const timestampGranularities = Array.isArray(provider.options?.timestamp_granularities)
      ? (provider.options.timestamp_granularities as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : typeof provider.options?.timestamp_granularities === 'string'
        ? [provider.options.timestamp_granularities as string]
        : ['word'];
    const requestedResponseFormat = String(provider.options?.response_format ?? 'verbose_json');
    const wantsWordTimestamps = timestampGranularities.includes('word');
    const model = DEFAULT_MODEL;
    const responseFormat =
      wantsWordTimestamps || requestedResponseFormat === 'verbose_json' ? 'verbose_json' : requestedResponseFormat;
    const language = typeof provider.language === 'string' ? provider.language : undefined;
    const prompt = typeof provider.options?.prompt === 'string' ? (provider.options.prompt as string) : undefined;

    const audioBuffer = getAudioBuffer(input);
    const fields: MultipartField[] = [
      { name: 'model', value: model },
      { name: 'response_format', value: responseFormat },
      ...timestampGranularities.map((granularity) => ({ name: 'timestamp_granularities[]', value: granularity })),
    ];

    if (language) {
      fields.push({ name: 'language', value: language });
    }

    if (prompt) {
      fields.push({ name: 'prompt', value: prompt });
    }

    const { boundary, body: multipartBody } = buildMultipartFormData(audioBuffer, path.basename(input), fields);
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body: new Uint8Array(multipartBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI transcription request failed: ${response.status} ${response.statusText} ${errorBody}`);
    }

    const payload = await response.json();
    writeTranscriptionDebugResponse(provider, 'openai', payload);
    return normalizeOpenAITranscript(payload);
  }
}
