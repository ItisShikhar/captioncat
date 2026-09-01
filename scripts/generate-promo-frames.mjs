import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPresetFrames } from './render-preset-frame.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfigPath = path.join(projectRoot, 'scripts', 'promo-frame-config.json');

function configPathFromArgs() {
  const configFlagIndex = process.argv.indexOf('--config');
  if (configFlagIndex < 0) return defaultConfigPath;

  const configArgument = process.argv[configFlagIndex + 1];
  if (!configArgument || configArgument.startsWith('--')) {
    throw new Error('The --config option requires a JSON file path.');
  }
  return path.resolve(process.cwd(), configArgument);
}

function isSafeFileSegment(value) {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(value);
}

function validatePositiveNumber(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Promo frame config has an invalid ${field}: ${value}.`);
  }
}

function validatePromoConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Promo frame config must contain a JSON object.');
  }

  for (const field of ['width', 'height', 'fps']) {
    validatePositiveNumber(config[field], field);
  }
  if (!Array.isArray(config.frames) || config.frames.length === 0) {
    throw new Error('Promo frame config must define at least one frame.');
  }
  if (!Number.isInteger(config.width) || !Number.isInteger(config.height)) {
    throw new Error('Promo frame config width and height must be integers.');
  }
  if (config.frames.some((frame) => !Number.isSafeInteger(frame) || frame <= 0)) {
    throw new Error('Promo frame config frames must contain positive safe integers.');
  }
  if (new Set(config.frames).size !== config.frames.length) {
    throw new Error('Promo frame config frames must not contain duplicates.');
  }
  if (typeof config.outputDirectory !== 'string' || config.outputDirectory.trim().length === 0) {
    throw new Error('Promo frame config must define a non-empty outputDirectory.');
  }
  if (!Array.isArray(config.entries) || config.entries.length === 0) {
    throw new Error('Promo frame config must define at least one entry.');
  }

  const outputNames = new Set();
  for (const [index, entry] of config.entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Promo frame entry ${index + 1} must be a JSON object.`);
    }
    for (const field of ['preset', 'language', 'text']) {
      if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
        throw new Error(`Promo frame entry ${index + 1} must define non-empty ${field}.`);
      }
    }
    for (const field of ['preset', 'language']) {
      if (!isSafeFileSegment(entry[field])) {
        throw new Error(
          `Promo frame entry ${index + 1} has an invalid ${field} for its output filename: ${entry[field]}.`,
        );
      }
    }

    const outputName = `${entry.preset}-${entry.language}.png`;
    if (outputNames.has(outputName)) {
      throw new Error(`Promo frame entries contain a duplicate output filename: ${outputName}.`);
    }
    outputNames.add(outputName);
  }
}

async function loadPromoConfig(configPath) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  validatePromoConfig(config);
  return config;
}

async function main() {
  const configPath = configPathFromArgs();
  const config = await loadPromoConfig(configPath);
  const outputDirectory = path.resolve(projectRoot, config.outputDirectory);
  const fallbacks = [];

  for (const [index, entry] of config.entries.entries()) {
    const result = await renderPresetFrames({
      presetName: entry.preset,
      language: entry.language,
      text: entry.text,
      frames: config.frames,
      width: config.width,
      height: config.height,
      fps: config.fps,
      outputPathForFrame: (frame) => path.join(outputDirectory, `${entry.preset}-${entry.language}-frame-${frame}.png`),
    });
    console.log(
      `[${index + 1}/${config.entries.length}] ${entry.preset} (${entry.language}) -> ` +
        `${result.outputs.length} frames ` +
        `(${result.width}x${result.height}, requested ${config.frames.join(', ')}, available ${result.frameCount})`,
    );
    if (result.unavailableFrames.length > 0) {
      fallbacks.push({
        preset: entry.preset,
        language: entry.language,
        requestedFrames: result.unavailableFrames,
        availableFrameCount: result.frameCount,
      });
    }
  }

  if (fallbacks.length > 0) {
    console.warn('\nRequested frames beyond the available range used the last frame:');
    for (const fallback of fallbacks) {
      console.warn(
        `- ${fallback.preset} (${fallback.language}): ` +
          `frame indexes ${fallback.requestedFrames.join(', ')}; ` +
          `available frames 1-${fallback.availableFrameCount}.`,
      );
    }
  }
}

await main();
