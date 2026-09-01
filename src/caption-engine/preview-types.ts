import type {
  CaptionDebugLayout,
  CaptionFrameCrop,
  CaptionFrameSize,
  CaptionRenderPlacement,
} from './render-types';

export type RelativeState = 'past' | 'previous' | 'current' | 'next' | 'future';
export type WordState = RelativeState;
export type StateTemplateKey = RelativeState | 'default';

export const CAPTION_FLOW_LAYOUT_MODES = ['stable', 'dynamic'] as const;
export type CaptionFlowLayoutMode = (typeof CAPTION_FLOW_LAYOUT_MODES)[number];

export const PREVIEW_WORD_STATE_LAYOUTS = ['static', 'stacked'] as const;
export type PreviewWordStateLayout = (typeof PREVIEW_WORD_STATE_LAYOUTS)[number];

export interface RenderPreviewStart {
  frameSize: CaptionFrameSize;
  placement: CaptionRenderPlacement;
  videoResolution: { width: number; height: number };
  /** Stable compact-preview crop, in pixels relative to the rendered frame. */
  stablePageCrop?: CaptionFrameCrop;
  /** Structural debug geometry that is available before the first frame. */
  debugLayout?: Omit<CaptionDebugLayout, 'frames'>;
}
