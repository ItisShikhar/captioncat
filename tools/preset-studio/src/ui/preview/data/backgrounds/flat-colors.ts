import type { StaticPreviewBackground } from './types';

export const flatWhiteBackground: StaticPreviewBackground = {
  id: 'flat-white',
  name: 'Flat white',
  draw: (ctx, width, height) => {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
  },
};

export const flatBlackBackground: StaticPreviewBackground = {
  id: 'flat-black',
  name: 'Flat black',
  draw: (ctx, width, height) => {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
  },
};
