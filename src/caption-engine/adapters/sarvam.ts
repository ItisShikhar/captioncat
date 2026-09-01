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

const BASE_URL = 'https://api.sarvam.ai';
const DEFAULT_MODEL = 'saaras:v3';

function ensureLocalAudio(input: string): string {
  const resolvedPath = path.resolve(input);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error(`Sarvam adapter requires a local audio file path. Received: ${input}`);
  }
  return resolvedPath;
}

function getApiKey(provider: TranscriptionProvider): string {
  const apiKey = provider.apiKey ?? process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Sarvam transcription requires an API key in the provider config or SARVAM_API_KEY environment variable.',
    );
  }
  return apiKey;
}

function ensureSuccess(response: Response, operation: string): Promise<void> {
  if (response.ok) {
    return Promise.resolve();
  }
  return response.text().then((body) => {
    throw new Error(`Sarvam API error during ${operation}: HTTP ${response.status} ${response.statusText} - ${body}`);
  });
}

function parseSarvamTranscriptPayload(data: any): TranscriptEntry[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  if (Array.isArray(data)) {
    return data.flatMap(parseSarvamTranscriptPayload);
  }

  const diarized = data.diarized_transcript ?? data.diarized_output;
  if (diarized) {
    const entries = Array.isArray(diarized) ? diarized : diarized.entries;
    if (Array.isArray(entries) && entries.length > 0) {
      return entries
        .map((entry: any) => {
          const text = String(entry.transcript ?? entry.text ?? '').trim();
          if (!text) {
            return null;
          }

          return {
            text,
            start:
              typeof entry.start_time_seconds === 'number'
                ? entry.start_time_seconds
                : typeof entry.start === 'number'
                  ? entry.start
                  : 0,
            end:
              typeof entry.end_time_seconds === 'number'
                ? entry.end_time_seconds
                : typeof entry.end === 'number'
                  ? entry.end
                  : 0,
            speakerId: entry.speaker_id ?? entry.speaker ?? undefined,
            speakerLabel: entry.speaker_id ?? entry.speaker ?? undefined,
          } as TranscriptEntry;
        })
        .filter((entry: TranscriptEntry | null): entry is TranscriptEntry => entry !== null);
    }
  }

  if (
    data.timestamps &&
    Array.isArray(data.timestamps.words) &&
    Array.isArray(data.timestamps.word_start_times_seconds) &&
    Array.isArray(data.timestamps.word_end_times_seconds)
  ) {
    const words: WordTiming[] = data.timestamps.words.map((word: any, index: number) => ({
      text: String(word ?? '').trim(),
      start: Number(data.timestamps.word_start_times_seconds[index] ?? 0),
      end: Number(data.timestamps.word_end_times_seconds[index] ?? 0),
    }));

    const text = String(data.transcript ?? words.map((word) => word.text).join(' ')).trim();
    return [
      {
        text,
        start: words.length > 0 ? words[0].start : 0,
        end: words.length > 0 ? words[words.length - 1].end : 0,
        words,
      },
    ];
  }

  if (typeof data.transcript === 'string' && data.transcript.trim().length > 0) {
    return [
      {
        text: data.transcript.trim(),
        start: 0,
        end: 0,
      },
    ];
  }

  return [];
}

function extractOutputFilename(statusData: any, inputFilename: string): string {
  if (statusData?.job_details && Array.isArray(statusData.job_details)) {
    for (const detail of statusData.job_details) {
      const inputs = Array.isArray(detail.inputs) ? detail.inputs : [];
      const outputs = Array.isArray(detail.outputs) ? detail.outputs : [];
      const state = detail.state ?? '';
      if (inputs.some((inp: any) => inp?.file_name === inputFilename)) {
        if (state && state !== 'Success' && state !== '') {
          throw new Error(`Sarvam transcription failed for '${inputFilename}': ${state}`);
        }
        if (outputs.length > 0) {
          const output = outputs[0];
          return output.file_name ?? output.file_id ?? inputFilename.replace(path.extname(inputFilename), '.json');
        }
      }
    }
  }

  return inputFilename.replace(path.extname(inputFilename), '.json');
}

export class SarvamAdapter implements TranscriptionProviderAdapter {
  public readonly name = TranscriptionProviderName.Sarvam;

  public async transcribe(input: string, provider: TranscriptionProvider): Promise<TranscriptEntry[]> {
    const providerConfig: TranscriptionProvider = {
      provider: TranscriptionProviderName.Sarvam,
      ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
    };
    const apiKey = getApiKey(providerConfig);
    const resolvedInput = ensureLocalAudio(input);
    const filename = path.basename(resolvedInput);
    const headers = {
      'api-subscription-key': apiKey,
      'content-type': 'application/json',
    };

    const model = DEFAULT_MODEL;
    const languageCode = provider.language ?? 'unknown';
    const withDiarization = provider.options?.withDiarization ?? true;
    const numSpeakers = provider.options?.numSpeakers;
    const inputAudioCodec = provider.options?.inputAudioCodec;

    const initResponse = await fetch(`${BASE_URL}/speech-to-text/job/v1`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        job_parameters: {
          model,
          language_code: languageCode,
          with_diarization: withDiarization,
          ...(typeof numSpeakers === 'number' ? { num_speakers: numSpeakers } : {}),
          ...(typeof inputAudioCodec === 'string' ? { input_audio_codec: inputAudioCodec } : {}),
        },
      }),
    });
    await ensureSuccess(initResponse, 'initiate job');
    const initBody = await initResponse.json();
    const jobId = String(initBody.job_id ?? initBody.jobId ?? '');
    if (!jobId) {
      throw new Error(`Sarvam transcription did not return a job ID. Response: ${JSON.stringify(initBody)}`);
    }

    const uploadResponse = await fetch(`${BASE_URL}/speech-to-text/job/v1/upload-files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id: jobId, files: [filename] }),
    });
    await ensureSuccess(uploadResponse, 'get upload URL');
    const uploadBody = await uploadResponse.json();
    const uploadUrl = uploadBody.upload_urls?.[filename]?.file_url ?? uploadBody.upload_urls?.[filename]?.url;
    if (!uploadUrl) {
      throw new Error(`Sarvam did not return an upload URL for '${filename}'. Response: ${JSON.stringify(uploadBody)}`);
    }

    const audioData = await fs.promises.readFile(resolvedInput);
    const uploadHeaders: Record<string, string> = {};
    const storageType = String(initBody.storage_container_type ?? '').toLowerCase();
    if (storageType.includes('azure')) {
      uploadHeaders['x-ms-blob-type'] = 'BlockBlob';
    }

    const uploadFileResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: audioData as unknown as BodyInit,
    });
    if (!uploadFileResponse.ok) {
      const text = await uploadFileResponse.text();
      throw new Error(
        `Sarvam file upload failed: HTTP ${uploadFileResponse.status} ${uploadFileResponse.statusText} - ${text}`,
      );
    }

    const startResponse = await fetch(`${BASE_URL}/speech-to-text/job/v1/${jobId}/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    await ensureSuccess(startResponse, 'start job');

    const deadline = Date.now() + 60 * 60 * 1000;
    let statusData: any = null;
    while (Date.now() < deadline) {
      const statusResponse = await fetch(`${BASE_URL}/speech-to-text/job/v1/${jobId}/status`, {
        method: 'GET',
        headers,
      });
      await ensureSuccess(statusResponse, 'get job status');
      statusData = await statusResponse.json();
      const state = String(statusData.job_state ?? '');
      if (state === 'Completed') {
        break;
      }
      if (state === 'Failed') {
        throw new Error(`Sarvam job ${jobId} failed: ${String(statusData.error_message ?? 'Unknown error')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    if (!statusData) {
      throw new Error('Sarvam job status polling failed to return data.');
    }

    const outputFilename = extractOutputFilename(statusData, filename);
    const downloadResponse = await fetch(`${BASE_URL}/speech-to-text/job/v1/download-files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id: jobId, files: [outputFilename] }),
    });
    await ensureSuccess(downloadResponse, 'get download URL');
    const downloadBody = await downloadResponse.json();
    const fileUrl =
      downloadBody.download_urls?.[outputFilename]?.file_url ?? downloadBody.download_urls?.[outputFilename]?.url;
    if (!fileUrl) {
      throw new Error(
        `Sarvam did not return a download URL for '${outputFilename}'. Response: ${JSON.stringify(downloadBody)}`,
      );
    }

    const transcriptResponse = await fetch(fileUrl, { method: 'GET' });
    await ensureSuccess(transcriptResponse, 'download transcript');
    const transcriptData = await transcriptResponse.json();
    writeTranscriptionDebugResponse(provider, 'sarvam', transcriptData);
    return parseSarvamTranscriptPayload(transcriptData);
  }
}
