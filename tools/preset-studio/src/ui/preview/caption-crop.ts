import type { RenderPreviewFrame, RenderPreviewResult } from '@captioncat/caption-engine/browser';

export interface CaptionCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function findAlphaCrop(frame: RenderPreviewFrame): CaptionCrop | null {
  if (frame.kind !== 'raw') return frame.alphaBounds ?? null;
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    const rowOffset = y * frame.width * 4;
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.buffer[rowOffset + x * 4 + 3] <= 10) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function unionCrop(first: CaptionCrop | null, second: CaptionCrop): CaptionCrop {
  if (!first) return second;
  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function findWordCrop(result: RenderPreviewResult, frameIndex: number, frame: RenderPreviewFrame): CaptionCrop | null {
  const debugFrame = result.debugLayout?.frames[frameIndex];
  const scale = result.debugLayout?.scale;
  if (!debugFrame || !scale || scale <= 0) return null;

  const padding = 24 * scale;
  let crop: CaptionCrop | null = null;
  if (debugFrame.words.length > 0) {
    const points = debugFrame.words.flatMap((word) => [word.topLeft, word.topRight, word.bottomRight, word.bottomLeft]);
    const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x * scale)) - padding));
    const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y * scale)) - padding));
    const maxX = Math.min(frame.width, Math.ceil(Math.max(...points.map((point) => point.x * scale)) + padding));
    const maxY = Math.min(frame.height, Math.ceil(Math.max(...points.map((point) => point.y * scale)) + padding));
    if (maxX > minX && maxY > minY) crop = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // Word quads do not include page-background band or block padding. Use the
  // engine's ink bounds so compact previews do not crop the rendered bands.
  const contentBounds = debugFrame.contentBounds;
  if (contentBounds) {
    const minX = Math.max(0, Math.floor(contentBounds.left * scale));
    const minY = Math.max(0, Math.floor(contentBounds.top * scale));
    const maxX = Math.min(frame.width, Math.ceil(contentBounds.right * scale));
    const maxY = Math.min(frame.height, Math.ceil(contentBounds.bottom * scale));
    if (maxX > minX && maxY > minY) {
      crop = unionCrop(crop, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
  }

  for (const transform of debugFrame.transforms) {
    if (transform.entity !== 'marker' || !transform.contentBounds) continue;
    const bounds = transform.contentBounds;
    const minX = Math.max(0, Math.floor(bounds.left * scale - padding));
    const minY = Math.max(0, Math.floor(bounds.top * scale - padding));
    const maxX = Math.min(frame.width, Math.ceil(bounds.right * scale + padding));
    const maxY = Math.min(frame.height, Math.ceil(bounds.bottom * scale + padding));
    if (maxX > minX && maxY > minY) {
      crop = unionCrop(crop, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
  }

  return crop;
}

export function findStableWordCrop(result: RenderPreviewResult): CaptionCrop | null {
  let crop: CaptionCrop | null = null;
  for (let frameIndex = 0; frameIndex < result.frames.length; frameIndex += 1) {
    const frameCrop = findWordCrop(result, frameIndex, result.frames[frameIndex]);
    if (frameCrop) crop = unionCrop(crop, frameCrop);
  }
  if (crop) return crop;
  for (const frame of result.frames) {
    const frameCrop = findAlphaCrop(frame);
    if (frameCrop) crop = unionCrop(crop, frameCrop);
  }
  return crop;
}

export function findStablePageCrop(result: RenderPreviewResult): CaptionCrop | null {
  let crop: CaptionCrop | null = null;
  for (let frameIndex = 0; frameIndex < result.frames.length; frameIndex += 1) {
    const debugFrame = result.debugLayout?.frames[frameIndex];
    const frame = result.frames[frameIndex];
    const scale = result.debugLayout?.scale;
    if (!debugFrame || !scale || scale <= 0) continue;

    const page = debugFrame.page;
    const minX = Math.max(0, Math.floor(page.left * scale));
    const minY = Math.max(0, Math.floor(page.top * scale));
    const maxX = Math.min(frame.width, Math.ceil(page.right * scale));
    const maxY = Math.min(frame.height, Math.ceil(page.bottom * scale));
    if (maxX > minX && maxY > minY) {
      crop = unionCrop(crop, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }

    const contentBounds = debugFrame.contentBounds;
    if (contentBounds) {
      const contentMinX = Math.max(0, Math.floor(contentBounds.left * scale));
      const contentMinY = Math.max(0, Math.floor(contentBounds.top * scale));
      const contentMaxX = Math.min(frame.width, Math.ceil(contentBounds.right * scale));
      const contentMaxY = Math.min(frame.height, Math.ceil(contentBounds.bottom * scale));
      if (contentMaxX > contentMinX && contentMaxY > contentMinY) {
        crop = unionCrop(crop, {
          x: contentMinX,
          y: contentMinY,
          width: contentMaxX - contentMinX,
          height: contentMaxY - contentMinY,
        });
      }
    }
  }
  if (crop) return crop;
  for (const frame of result.frames) {
    const frameCrop = findAlphaCrop(frame);
    if (frameCrop) crop = unionCrop(crop, frameCrop);
  }
  return crop;
}