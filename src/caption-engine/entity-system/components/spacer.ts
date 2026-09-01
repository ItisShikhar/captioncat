import type { ResolveContext } from '../types';
import { Component } from './component';

/** Composition-unit extent used when a spacer has no valid parent extent. */
export const SPACER_FALLBACK_EXTENT = 1000;

export function spacerExtentLimit(parentExtent: number): number {
  return Number.isFinite(parentExtent) && parentExtent > 0 ? parentExtent : SPACER_FALLBACK_EXTENT;
}

export function clampSpacerGap(gap: number, parentExtent: number): number {
  const limit = spacerExtentLimit(parentExtent);
  return Math.min(limit, Math.max(-limit, gap));
}

export function isSpacerAnimationTarget(target: string): boolean {
  const separator = target.indexOf('.');
  if (separator <= 0) return false;
  const ownerType = target.slice(0, separator).split('#', 1)[0].toLowerCase();
  if (ownerType !== 'verticalspacer' && ownerType !== 'horizontalspacer') return false;
  const propertyName = target.slice(separator + 1);
  return propertyName === 'enabled' || propertyName === 'spacing' || propertyName === 'unit';
}

/**
 * A layout-only sizing component: contributes a gap, painting nothing itself.
 * Concrete subclasses are `VerticalSpacer` (flow gap on a Page or Viewport;
 * Page spacing replaces the old `rowSpacing`) and `HorizontalSpacer` (flow gap
 * on a Row, Page, or Viewport). On a Row it replaces the old `wordSpacingOffset`. The gap is `spacing` in either `pt`
 * (composition units, like everything else) or `%` of the parent's content box
 * extent along the spacer's axis.
 */
export abstract class Spacer extends Component {
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;
  override readonly isDeletable = true;

  /** Resolve the gap in composition units. `%` uses `parentExtent`. The value is zero when disabled. */
  gap(rctx: ResolveContext, parentExtent: number): number {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) return 0;
    const spacing = Number(this.getProp<number>('spacing')?.resolve(rctx) ?? 0);
    if (!Number.isFinite(spacing)) return 0;
    const unit = String(this.getProp<string>('unit')?.resolve(rctx) ?? 'pt');
    const extent = spacerExtentLimit(parentExtent);
    const gap = unit === '%' ? (extent * spacing) / 100 : spacing;
    return clampSpacerGap(gap, extent);
  }
}

/** Vertical gap between flow children. This component belongs on a Page or Viewport. */
export class VerticalSpacer extends Spacer {
  readonly type = 'verticalSpacer';
  override readonly allowedEntities = ['page', 'viewport'];
}

/** Extra horizontal gap between words. This component belongs on a Row. */
export class HorizontalSpacer extends Spacer {
  readonly type = 'horizontalSpacer';
  override readonly allowedEntities = ['row', 'page', 'viewport'];
}
