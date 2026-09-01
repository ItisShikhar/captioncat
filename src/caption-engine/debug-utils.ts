import fs from 'node:fs';
import path from 'node:path';
import { toFsPath } from './path-utils';
import { TranscriptionProvider } from './types';

export function writeTranscriptionDebugResponse(
  provider: TranscriptionProvider | undefined,
  providerName: string,
  payload: unknown,
): void {
  const options = provider?.options as Record<string, unknown> | undefined;
  const shouldWrite = Boolean(options?.debug);
  const outputDir =
    typeof options?.debugOutputDir === 'string' ? options.debugOutputDir : undefined;

  if (!shouldWrite || !outputDir) {
    return;
  }

  try {
    const resolvedOutputDir = toFsPath(outputDir);
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
    const outputPath = path.join(resolvedOutputDir, `${providerName}_transcription_response.json`);
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.warn(`Failed to write transcription debug response for ${providerName}:`, error);
  }
}
