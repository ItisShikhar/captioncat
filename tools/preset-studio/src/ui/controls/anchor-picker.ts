export const ANCHOR_VALUES = [
  'topLeft',
  'topCenter',
  'topRight',
  'centerLeft',
  'center',
  'centerRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
] as const;

export type AnchorValue = (typeof ANCHOR_VALUES)[number];

export interface AnchorCoordinate {
  row: number;
  column: number;
}

export interface AnchorPickerLayout {
  rows: readonly number[];
  columns: readonly number[];
  cells: readonly (AnchorValue | null)[][];
  anchors: readonly AnchorValue[];
}

const ANCHOR_COORDINATES: Record<AnchorValue, AnchorCoordinate> = {
  topLeft: { row: 0, column: 0 },
  topCenter: { row: 0, column: 1 },
  topRight: { row: 0, column: 2 },
  centerLeft: { row: 1, column: 0 },
  center: { row: 1, column: 1 },
  centerRight: { row: 1, column: 2 },
  bottomLeft: { row: 2, column: 0 },
  bottomCenter: { row: 2, column: 1 },
  bottomRight: { row: 2, column: 2 },
};

const ANCHOR_LABELS: Record<AnchorValue, string> = {
  topLeft: 'Top Left',
  topCenter: 'Top Center',
  topRight: 'Top Right',
  centerLeft: 'Center Left',
  center: 'Center',
  centerRight: 'Center Right',
  bottomLeft: 'Bottom Left',
  bottomCenter: 'Bottom Center',
  bottomRight: 'Bottom Right',
};

const LEGACY_ANCHOR_ALIASES: Partial<Record<string, AnchorValue>> = {
  'top-left': 'topLeft',
  'top-center': 'topCenter',
  'top-right': 'topRight',
  'center-left': 'centerLeft',
  center: 'center',
  'center-right': 'centerRight',
  'bottom-left': 'bottomLeft',
  'bottom-center': 'bottomCenter',
  'bottom-right': 'bottomRight',
};

export function isAnchorValue(value: string): value is AnchorValue {
  return (ANCHOR_VALUES as readonly string[]).includes(value);
}

export function normalizeAnchorValue(value: unknown): AnchorValue | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  if (isAnchorValue(value)) return value;
  return LEGACY_ANCHOR_ALIASES[value] ?? null;
}

export function anchorLabel(value: AnchorValue): string {
  return ANCHOR_LABELS[value];
}

export function anchorCoordinate(value: AnchorValue): AnchorCoordinate {
  return ANCHOR_COORDINATES[value];
}

export function normalizeAllowedAnchors(values: readonly string[]): AnchorValue[] {
  const seen = new Set<AnchorValue>();
  const anchors: AnchorValue[] = [];
  for (const value of values) {
    const normalized = normalizeAnchorValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    anchors.push(normalized);
  }
  anchors.sort((left, right) => {
    const leftCoordinate = anchorCoordinate(left);
    const rightCoordinate = anchorCoordinate(right);
    return leftCoordinate.row - rightCoordinate.row || leftCoordinate.column - rightCoordinate.column;
  });
  return anchors;
}

export function areAnchorValues(values: readonly string[]): values is readonly AnchorValue[] {
  return values.every((value) => normalizeAnchorValue(value) !== null);
}

export function buildAnchorPickerLayout(values: readonly string[]): AnchorPickerLayout {
  const anchors = normalizeAllowedAnchors(values);
  const rows = [0, 1, 2];
  const columns = [0, 1, 2];
  const cells = rows.map((row) =>
    columns.map((column) =>
      ANCHOR_VALUES.find((anchor) => {
        const coordinate = anchorCoordinate(anchor);
        return coordinate.row === row && coordinate.column === column;
      }) ?? null,
    ),
  );
  return { rows, columns, cells, anchors };
}
