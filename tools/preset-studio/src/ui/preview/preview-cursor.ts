import figmaCursors from '../../../../../assets/json/figma-cursors.json';

const CURSOR_HOTSPOTS = {
  'default-arrow': { x: 2, y: 3 },
  'ew-resize': { x: 20, y: 20 },
  'diagonal-resize-2': { x: 20, y: 20 },
  'nwse-resize-2': { x: 20, y: 20 },
  hand: { x: 20, y: 12 },
} as const;
type PreviewCursorName = keyof typeof CURSOR_HOTSPOTS;

function createCursorValue(cursorName: PreviewCursorName): string {
  const hotspot = CURSOR_HOTSPOTS[cursorName];
  return `url("${figmaCursors[cursorName]}") ${hotspot.x} ${hotspot.y}, auto`;
}

export const DEFAULT_ARROW_CURSOR = createCursorValue('default-arrow');
export const EW_RESIZE_CURSOR = createCursorValue('ew-resize');
export const HAND_CURSOR = createCursorValue('hand');
export const NESW_RESIZE_CURSOR = createCursorValue('diagonal-resize-2');
export const NWSE_RESIZE_CURSOR = createCursorValue('nwse-resize-2');
