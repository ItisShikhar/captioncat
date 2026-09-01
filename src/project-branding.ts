import projectBranding from './project-branding.json';

export interface ProjectBranding {
  projectName: string;
  projectSlug: string;
  authorName: string;
  logoPath: string;
  links: {
    github: string;
    linkedin: string;
  };
}

export const PROJECT_BRANDING = projectBranding satisfies ProjectBranding;

export const PROJECT_CAPTION_METADATA = {
  title: `Captioned by ${PROJECT_BRANDING.projectName}`,
  artist: PROJECT_BRANDING.projectName,
  encodedBy: PROJECT_BRANDING.projectName,
  comment: `GitHub: ${PROJECT_BRANDING.links.github}`,
  copyright: PROJECT_BRANDING.links.github,
  github: PROJECT_BRANDING.links.github,
} as const;

export function projectVideoMetadataArgs(sourceTags: Readonly<Record<string, string>> = {}): string[] {
  const append = (tag: string, value: string): string => {
    const sourceValue = sourceTags[tag.toLowerCase()];
    return sourceValue ? `${sourceValue} | ${value}` : value;
  };

  return [
    '-metadata',
    `title=${append('title', PROJECT_CAPTION_METADATA.title)}`,
    '-metadata',
    `comment=${append('comment', PROJECT_CAPTION_METADATA.comment)}`,
    '-metadata',
    `artist=${append('artist', PROJECT_CAPTION_METADATA.artist)}`,
    '-metadata',
    `copyright=${append('copyright', PROJECT_CAPTION_METADATA.copyright)}`,
  ];
}
