import {
  Crop,
  Image,
  Maximize,
  MousePointer2,
  Paintbrush,
  StickyNote,
  TextAlignStart,
  VectorSquare,
  Video,
  WholeWord,
  type LucideIcon,
} from 'lucide-react';

import type { DebugEntityKind } from './entity-debug';

/** One icon registry shared by hierarchy entity icons and preview overlay menus. */
export const DEBUG_ENTITY_ICONS: Record<DebugEntityKind, LucideIcon> = {
  viewport: Maximize,
  videoArea: VectorSquare,
  video: Video,
  compositionArea: Crop,
  page: StickyNote,
  row: TextAlignStart,
  word: WholeWord,
  background: Paintbrush,
  image: Image,
  marker: MousePointer2,
};
