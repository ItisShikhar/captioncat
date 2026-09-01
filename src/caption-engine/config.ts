import { RenderRequest } from './types';

export function createDefaultConfig(overrides: Partial<RenderRequest> = {}): RenderRequest {
  return {
    ...overrides,
  };
}
