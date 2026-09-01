import { createContext } from 'react';

import type { RandomizerScope } from '@captioncat/caption-engine/browser';

export const RandomizerScopeAvailabilityContext = createContext<readonly RandomizerScope[] | null>(null);
export type { RandomizerScope };
