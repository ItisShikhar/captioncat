import { formatFontFamilyForCanvas } from '#platform/font-loader.js';
import {
  normalizeFontStyle,
  resolveFontEmojiSettings,
  resolveFontWeight,
} from '../../../font-registry';
import type { ResolveContext } from '../types';
import type { TextRunStyle } from '../text-layout';
import { Component } from './component';

/** Font properties (family/size/weight/style) owned by a Text component. */
export class Font extends Component {
  readonly type = 'font';
  override readonly allowedEntities = ['word'];
  override readonly allowedQuantity = 1;

  private buildFontString(
    rctx: ResolveContext,
    familyValue: string | string[] | null | undefined,
    size: number,
    weight = resolveFontWeight(this.getProp('weight')?.resolve(rctx)),
    style = normalizeFontStyle(this.getProp<string>('style')?.resolve(rctx)),
  ): string {
    const family = formatFontFamilyForCanvas(familyValue);
    const parts: string[] = [];
    if (style && style !== 'normal') parts.push(style);
    if (weight !== 400) parts.push(String(weight));
    parts.push(`${size}px`);
    parts.push(family);
    return parts.join(' ');
  }

  /** Build the CSS font string (`[style] [weight] <size>px <family>`). */
  fontString(rctx: ResolveContext): string {
    const family = this.getProp<string | string[]>('family')?.resolve(rctx) ?? null;
    return this.buildFontString(rctx, family, this.size(rctx));
  }

  /** Resolved font size in px (defaults to 60). */
  size(rctx: ResolveContext): number {
    const authoredSize = Number(this.getProp<number>('size')?.resolve(rctx) ?? 60);
    const scale = Number.isFinite(rctx.fontScale) && (rctx.fontScale ?? 0) > 0 ? rctx.fontScale! : 1;
    return authoredSize * scale;
  }

  /** Resolve the font and baseline treatment used for a normal or emoji text run. */
  textRunStyle(rctx: ResolveContext, isEmoji: boolean): TextRunStyle {
    if (!isEmoji) {
      return { font: this.fontString(rctx), baselineOffset: 0, alignment: 'baseline' };
    }

    const configuredFamily = this.getProp<string | string[]>('emojis.family')?.resolve(rctx);
    const textFamily = this.getProp<string | string[]>('family')?.resolve(rctx) ?? null;
    const configuredFamilies = Array.isArray(configuredFamily)
      ? configuredFamily.filter((family) => family.trim().length > 0)
      : typeof configuredFamily === 'string' && configuredFamily.trim().length > 0
        ? [configuredFamily]
        : [];
    const emojiFamily = configuredFamilies.length > 0 ? configuredFamilies : textFamily;
    const registryEmojiSettings = resolveFontEmojiSettings(textFamily);
    const scaleValue = Number(
      this.getProp<number>('emojis.sizeScale')?.resolve(rctx) ?? registryEmojiSettings.sizeScale,
    );
    const sizeScale = Number.isFinite(scaleValue) ? Math.min(1.5, Math.max(0.5, scaleValue)) : registryEmojiSettings.sizeScale;
    const offsetValue = Number(
      this.getProp<number>('emojis.baselineOffset')?.resolve(rctx) ??
        registryEmojiSettings.baselineOffset,
    );
    const baselineOffset =
      (Number.isFinite(offsetValue)
        ? Math.min(0.5, Math.max(-0.5, offsetValue))
        : registryEmojiSettings.baselineOffset) * this.size(rctx);
    const alignmentValue =
      this.getProp<string>('emojis.alignmentMode')?.resolve(rctx) ??
      registryEmojiSettings.alignmentMode;
    const alignment = alignmentValue === 'baseline' ? 'baseline' : 'optical';
    return {
      font: this.buildFontString(rctx, emojiFamily, this.size(rctx) * sizeScale, 400, 'normal'),
      baselineOffset,
      alignment,
    };
  }
}
