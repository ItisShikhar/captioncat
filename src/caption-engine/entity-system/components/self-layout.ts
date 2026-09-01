import type { ResolveContext } from '../types';
import { Component } from './component';

export type SelfLayoutAspectRatio = 'maintain' | 'stretchToFit' | 'custom';
export type SelfLayoutCustomAspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
export type SelfLayoutHorizontalAlignment = 'auto' | 'start' | 'center' | 'end' | 'left' | 'right' | 'stretch';
export type SelfLayoutVerticalAlignment = 'auto' | 'top' | 'center' | 'bottom' | 'stretch';
export type SelfLayoutSingleItemAlignment = 'start' | 'center' | 'end' | 'justify';

export class SelfLayout extends Component {
  readonly type = 'selfLayout';
  override readonly allowedEntities = [
    'viewport',
    'videoArea',
    'video',
    'compositionArea',
    'page',
    'row',
    'word',
    'background',
    'image',
  ];
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;
  override readonly isDeletable = true;

  enabled(rctx: ResolveContext): boolean {
    return this.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  }

  aspectRatio(rctx: ResolveContext): SelfLayoutAspectRatio {
    const value = this.getProp<string>('aspectRatio')?.resolve(rctx);
    return value === 'stretchToFit' || value === 'custom' ? value : 'maintain';
  }

  customAspectRatio(rctx: ResolveContext): SelfLayoutCustomAspectRatio {
    const value = this.getProp<string>('customAspectRatio')?.resolve(rctx);
    return isCustomAspectRatio(value) ? value : '16:9';
  }

  horizontalAlignment(rctx: ResolveContext): SelfLayoutHorizontalAlignment {
    const value = this.getProp<string>('horizontalAlignment')?.resolve(rctx);
    return value === 'auto' ||
      value === 'start' ||
      value === 'center' ||
      value === 'end' ||
      value === 'left' ||
      value === 'right' ||
      value === 'stretch'
      ? value
      : 'auto';
  }

  verticalAlignment(rctx: ResolveContext): SelfLayoutVerticalAlignment {
    const value = this.getProp<string>('verticalAlignment')?.resolve(rctx);
    return value === 'top' || value === 'center' || value === 'bottom' || value === 'stretch' ? value : 'auto';
  }

  horizontalSingleItemAlignment(rctx: ResolveContext): SelfLayoutSingleItemAlignment {
    return singleItemAlignmentFrom(this.getProp<string>('horizontalSingleItemAlignment')?.resolve(rctx));
  }

  verticalSingleItemAlignment(rctx: ResolveContext): SelfLayoutSingleItemAlignment {
    return singleItemAlignmentFrom(this.getProp<string>('verticalSingleItemAlignment')?.resolve(rctx));
  }
}

function singleItemAlignmentFrom(value: unknown): SelfLayoutSingleItemAlignment {
  if (
    value === 'center' ||
    value === 'end' ||
    value === 'justify'
  ) {
    return value;
  }
  return 'start';
}

function isCustomAspectRatio(value: unknown): value is SelfLayoutCustomAspectRatio {
  return value === '9:16' || value === '16:9' || value === '1:1' || value === '4:3' || value === '3:4';
}