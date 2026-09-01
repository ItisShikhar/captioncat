import type { ResolveContext } from '../types';
import { Component } from './component';

export type LayoutHorizontalAlignment = 'start' | 'center' | 'end' | 'left' | 'right' | 'stretch';
export type LayoutVerticalAlignment = 'top' | 'center' | 'middle' | 'bottom' | 'stretch';
export type LayoutSingleItemAlignment = 'start' | 'center' | 'end' | 'justify';
export type LayoutChildrenSizing = 'constrained' | 'allowOverflow';
export type LayoutChildWindowMode = 'all' | 'count';
export type LayoutChildWindowAxis = 'horizontal' | 'vertical';
export type LayoutChildWindowAnchor = 'start' | 'center' | 'end';
export type LayoutChildWindowSelection = 'anchor' | 'motionFocus';
export interface LayoutChildrenAlignment {
  horizontalAlignment?: LayoutHorizontalAlignment;
  verticalAlignment?: LayoutVerticalAlignment;
  horizontalSingleItemAlignment?: LayoutSingleItemAlignment;
  verticalSingleItemAlignment?: LayoutSingleItemAlignment;
}
export interface LayoutChildWindow {
  mode: LayoutChildWindowMode;
  count: number;
  axis: LayoutChildWindowAxis;
  anchor: LayoutChildWindowAnchor;
  selection: LayoutChildWindowSelection;
}

/** Child flow and alignment within this entity's content box. */
export class Layout extends Component {
  readonly type = 'layout';
  override readonly allowedEntities = ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row'];
  override readonly allowedQuantity = 1;

  childrenAlignment(rctx: ResolveContext): LayoutChildrenAlignment {
    const horizontal = this.getProp<string>('childrenAlignment.horizontalAlignment')?.resolve(rctx);
    const vertical = this.getProp<string>('childrenAlignment.verticalAlignment')?.resolve(rctx);
    const alignment: LayoutChildrenAlignment = {};
    if (
      horizontal === 'start' ||
      horizontal === 'center' ||
      horizontal === 'end' ||
      horizontal === 'left' ||
      horizontal === 'right' ||
      horizontal === 'stretch'
    ) {
      alignment.horizontalAlignment = horizontal;
    }
    if (
      vertical === 'top' ||
      vertical === 'center' ||
      vertical === 'middle' ||
      vertical === 'bottom' ||
      vertical === 'stretch'
    ) {
      alignment.verticalAlignment = vertical;
    }
    const horizontalSingleItem = this.getProp<string>('childrenAlignment.horizontalSingleItemAlignment')?.resolve(rctx);
    if (isSingleItemAlignment(horizontalSingleItem)) alignment.horizontalSingleItemAlignment = horizontalSingleItem;
    const verticalSingleItem = this.getProp<string>('childrenAlignment.verticalSingleItemAlignment')?.resolve(rctx);
    if (isSingleItemAlignment(verticalSingleItem)) alignment.verticalSingleItemAlignment = verticalSingleItem;
    return alignment;
  }

  childrenSizing(rctx: ResolveContext): LayoutChildrenSizing {
    return this.getProp<string>('childrenSizing')?.resolve(rctx) === 'allowOverflow' ? 'allowOverflow' : 'constrained';
  }

  childWindow(rctx: ResolveContext): LayoutChildWindow {
    const mode = this.getProp<string>('childWindow.windowMode')?.resolve(rctx) === 'count' ? 'count' : 'all';
    const countValue = Number(this.getProp<number>('childWindow.windowCount')?.resolve(rctx));
    const count = Number.isFinite(countValue) ? Math.max(1, Math.floor(countValue)) : 1;
    const axis = this.getProp<string>('childWindow.windowAxis')?.resolve(rctx) === 'horizontal' ? 'horizontal' : 'vertical';
    const anchorValue = this.getProp<string>('childWindow.windowAnchor')?.resolve(rctx);
    const anchor = anchorValue === 'center' || anchorValue === 'end' ? anchorValue : 'start';
    const selection =
      this.getProp<string>('childWindow.windowSelection')?.resolve(rctx) === 'motionFocus'
        ? 'motionFocus'
        : 'anchor';
    return { mode, count, axis, anchor, selection };
  }
}

function isSingleItemAlignment(value: unknown): value is LayoutSingleItemAlignment {
  return value === 'start' || value === 'center' || value === 'end' || value === 'justify';
}
