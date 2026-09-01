import { createContext } from 'react';

import type { CaptionLayoutPolicy } from '@captioncat/caption-engine/browser';

export const CaptionLayoutContext = createContext<CaptionLayoutPolicy | null>(null);
