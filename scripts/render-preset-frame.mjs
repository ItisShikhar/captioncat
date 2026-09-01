import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Canvas, ImageData } = require('skia-canvas');
const { EntitySystem, getEcsCaptionPreset } = require('../build/index.js');
const CONTENT_ALPHA_THRESHOLD = 200;

export function createWordTimestamps(text, language) {
  const tokens = EntitySystem.segmentCaptionText(text, language);

  if (tokens.length === 0) {
    throw new Error('Frame text must contain at least one word.');
  }

  const wordIntervalSeconds = 0.45;
  const wordDurationSeconds = 0.65;
  return {
    words: tokens.map((token) => token.text),
    word_start_times_seconds: tokens.map((_, index) => index * wordIntervalSeconds),
    word_end_times_seconds: tokens.map((_, index) => index * wordIntervalSeconds + wordDurationSeconds),
    break_before: tokens.map((token) => token.breakBefore),
  };
}

function validateFrameOptions(options) {
  if (typeof options.presetName !== 'string' || options.presetName.trim().length === 0) {
    throw new Error('A preset name is required.');
  }
  if (typeof options.text !== 'string' || options.text.trim().length === 0) {
    throw new Error(`Preset "${options.presetName}" must define non-empty frame text.`);
  }
  if (!Array.isArray(options.frames) || options.frames.length === 0) {
    throw new Error(`Preset "${options.presetName}" must define at least one requested frame.`);
  }

  for (const field of ['width', 'height', 'fps']) {
    if (!Number.isFinite(options[field]) || options[field] <= 0) {
      throw new Error(`Preset "${options.presetName}" has an invalid ${field}: ${options[field]}.`);
    }
  }

  if (!Number.isInteger(options.width) || !Number.isInteger(options.height)) {
    throw new Error(`Preset "${options.presetName}" width and height must be integers.`);
  }
  if (options.frames.some((frame) => !Number.isSafeInteger(frame) || frame <= 0)) {
    throw new Error(`Preset "${options.presetName}" frames must contain positive safe integers.`);
  }
  if (new Set(options.frames).size !== options.frames.length) {
    throw new Error(`Preset "${options.presetName}" frames must not contain duplicates.`);
  }
  if (typeof options.outputPathForFrame !== 'function') {
    throw new Error(`Preset "${options.presetName}" must define an output path for each frame.`);
  }
}

function copyFrameToCanvasBuffer({ buffer, frameSize, placement, width, height }) {
  const fullFrameBuffer = new Uint8ClampedArray(width * height * 4);
  const sourceRowLength = frameSize.width * 4;
  const targetRowLength = width * 4;
  const xOffset = Math.round(placement.xOffset);
  const yOffset = Math.round(placement.yOffset);

  for (let sourceY = 0; sourceY < frameSize.height; sourceY += 1) {
    const targetY = sourceY + yOffset;
    if (targetY < 0 || targetY >= height) continue;

    const sourceStart = sourceY * sourceRowLength;
    const targetStart = targetY * targetRowLength + Math.max(0, xOffset) * 4;
    const sourceXStart = Math.max(0, -xOffset) * 4;
    const copyWidth = Math.min(frameSize.width - Math.max(0, -xOffset), width - Math.max(0, xOffset));
    if (copyWidth <= 0) continue;

    fullFrameBuffer.set(
      buffer.subarray(sourceStart + sourceXStart, sourceStart + sourceXStart + copyWidth * 4),
      targetStart,
    );
  }

  return fullFrameBuffer;
}

function findContentBounds(buffer, width, height, alphaThreshold = CONTENT_ALPHA_THRESHOLD) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (buffer[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < 0 ? undefined : { minX, minY, maxX, maxY };
}

function cropFrameBuffer(buffer, width, height, padding, alphaThreshold) {
  const bounds = findContentBounds(buffer, width, height, alphaThreshold);
  if (!bounds) return { buffer, width, height };

  const cropMinX = Math.max(0, bounds.minX - padding);
  const cropMinY = Math.max(0, bounds.minY - padding);
  const cropMaxX = Math.min(width - 1, bounds.maxX + padding);
  const cropMaxY = Math.min(height - 1, bounds.maxY + padding);
  const cropWidth = cropMaxX - cropMinX + 1;
  const cropHeight = cropMaxY - cropMinY + 1;
  const croppedBuffer = new Uint8ClampedArray(cropWidth * cropHeight * 4);

  for (let y = 0; y < cropHeight; y += 1) {
    const sourceStart = ((cropMinY + y) * width + cropMinX) * 4;
    const targetStart = y * cropWidth * 4;
    croppedBuffer.set(buffer.subarray(sourceStart, sourceStart + cropWidth * 4), targetStart);
  }

  return { buffer: croppedBuffer, width: cropWidth, height: cropHeight };
}

async function writeFullFramePng({
  buffer,
  frameSize,
  placement,
  width,
  height,
  outputPath,
  cropToContent = false,
  contentPadding = 24,
  contentAlphaThreshold = CONTENT_ALPHA_THRESHOLD,
}) {
  const fullFrameBuffer = copyFrameToCanvasBuffer({ buffer, frameSize, placement, width, height });
  const outputFrame = cropToContent
    ? cropFrameBuffer(fullFrameBuffer, width, height, contentPadding, contentAlphaThreshold)
    : { buffer: fullFrameBuffer, width, height };
  const canvas = new Canvas(outputFrame.width, outputFrame.height, { gpu: false });
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, outputFrame.width, outputFrame.height);
  context.putImageData(new ImageData(outputFrame.buffer, outputFrame.width, outputFrame.height), 0, 0);
  await fs.writeFile(outputPath, await canvas.toBuffer('png'));
}

export async function renderPresetFrames(options) {
  validateFrameOptions(options);
  const preset = getEcsCaptionPreset(options.presetName);
  if (!preset) {
    throw new Error(`Unable to load caption preset "${options.presetName}".`);
  }

  const requestedFrames = options.frames;
  const lastRequestedFrame = Math.max(...requestedFrames);
  const frameBuffers = new Map();
  let lastFrameBuffer;
  let renderedFrameCount = 0;
  const rendered = await EntitySystem.generateSubtitleImagesEcs({
    videoResolution: {
      width: options.width,
      height: options.height,
    },
    timestamps: createWordTimestamps(options.text, options.language),
    design: options.design ?? preset.design,
    stateWindow: options.stateWindow ?? preset.stateWindow,
    captionLayout: options.captionLayout ?? preset.captionLayout,
    fps: options.fps,
    captionScale: 1,
    language: options.language,
    previewWordState: options.previewWordState,
    previewWordStateLayout: options.previewWordStateLayout,
    fitPageToChildren: options.fitPageToChildren,
    allowContentOverflow: options.allowContentOverflow,
    disableLayoutMotion: options.disableLayoutMotion,
    captionHoldThresholdSeconds: preset.timing?.captionHoldThresholdSeconds,
    longWordThreshold: EntitySystem.LONG_WORD_THRESHOLD,
    collectFrames: false,
    stopAfterFrameIndex: lastRequestedFrame - 1,
    onFrame: (frame) => {
      renderedFrameCount = Math.max(renderedFrameCount, frame.frameIndex + 1);
      lastFrameBuffer = frame.buffer;
      if (requestedFrames.includes(frame.frameIndex + 1)) {
        frameBuffers.set(frame.frameIndex + 1, frame.buffer);
      }
    },
  });

  if (!lastFrameBuffer) {
    throw new Error(`Preset "${options.presetName}" generated no frames.`);
  }

  await fs.mkdir(path.dirname(options.outputPathForFrame(requestedFrames[0])), { recursive: true });
  const outputs = [];
  const unavailableFrames = [];
  for (const requestedFrame of requestedFrames) {
    const resolvedFrame = Math.min(requestedFrame, renderedFrameCount);
    const frameBuffer = frameBuffers.get(requestedFrame) ?? lastFrameBuffer;
    if (requestedFrame > renderedFrameCount) unavailableFrames.push(requestedFrame);
    const outputPath = options.outputPathForFrame(requestedFrame);
    await writeFullFramePng({
      buffer: frameBuffer,
      frameSize: rendered.frameSize,
      placement: rendered.placement,
      width: options.width,
      height: options.height,
      outputPath,
      cropToContent: options.cropToContent,
      contentPadding: options.contentPadding,
      contentAlphaThreshold: options.contentAlphaThreshold,
    });
    outputs.push({
      outputPath,
      requestedFrame,
      resolvedFrame,
    });
  }

  return {
    outputs,
    frameCount: renderedFrameCount,
    width: options.width,
    height: options.height,
    unavailableFrames,
  };
}
