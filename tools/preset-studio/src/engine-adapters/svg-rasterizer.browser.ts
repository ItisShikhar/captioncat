export interface SvgRasterizeOptions {
  cropTransparent?: boolean;
  maxDimension?: number;
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('SVG rasterization requires a browser document.'));
  }
  const image = document.createElement('img');
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('A bundled SVG could not be decoded on the preview host.'));
    };
    image.src = objectUrl;
  });
}

function alphaBounds(context: CanvasRenderingContext2D, width: number, height: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const padding = 1;
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + padding + 1);
  const bottom = Math.min(height, maxY + padding + 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export async function rasterizeSvgForWorker(
  svg: string,
  { cropTransparent = false, maxDimension = 2048 }: SvgRasterizeOptions = {},
): Promise<string> {
  const image = await loadSvgImage(svg.replaceAll('currentColor', '#ffffff'));
  const sourceWidth = Math.max(1, image.naturalWidth);
  const sourceHeight = Math.max(1, image.naturalHeight);
  const scale = maxDimension / Math.max(sourceWidth, sourceHeight);
  const width = Math.max(1, Math.ceil(sourceWidth * scale));
  const height = Math.max(1, Math.ceil(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The preview host cannot create an SVG rasterization canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  if (!cropTransparent) return canvas.toDataURL('image/png');
  const bounds = alphaBounds(context, width, height);
  if (!bounds) throw new Error('A bundled SVG did not produce any visible pixels.');
  const cropped = document.createElement('canvas');
  cropped.width = bounds.width;
  cropped.height = bounds.height;
  const croppedContext = cropped.getContext('2d');
  if (!croppedContext) throw new Error('The preview host cannot create a cropped SVG canvas.');
  croppedContext.imageSmoothingEnabled = true;
  croppedContext.imageSmoothingQuality = 'high';
  croppedContext.drawImage(
    canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return cropped.toDataURL('image/png');
}
