export const STATE_STYLE_SOURCES = ['default', 'past', 'previous', 'current', 'next', 'future'] as const;
export type StateStyleSource = (typeof STATE_STYLE_SOURCES)[number];
