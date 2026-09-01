import type { StaticPreviewBackground } from './types';

export const noiseBackground: StaticPreviewBackground = {
  id: 'noise',
  name: 'Noise',
  draw: (ctx, width, height) => {
    const image = ctx.createImageData(width, height);
    let state = 0x6d2b79f5;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      state = (state * 1664525 + 1013904223) >>> 0;
      image.data[offset] = (state >>> 24) & 0xff;
      state = (state * 1664525 + 1013904223) >>> 0;
      image.data[offset + 1] = (state >>> 24) & 0xff;
      state = (state * 1664525 + 1013904223) >>> 0;
      image.data[offset + 2] = (state >>> 24) & 0xff;
      image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  },
};
