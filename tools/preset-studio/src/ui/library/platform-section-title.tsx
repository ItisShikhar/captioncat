import { memo } from 'react';
import { Layers3 } from 'lucide-react';
import type { PlatformDefinition } from './platform-registry';

interface PlatformSectionTitleProps {
  platform: PlatformDefinition;
  count: number;
}

export const PlatformSectionTitle = memo(function PlatformSectionTitle({
  platform,
  count,
}: PlatformSectionTitleProps) {
  const PlatformIcon = platform.icon ?? Layers3;
  return (
    <span className="flex items-center gap-1.5 normal-case">
      <span
        aria-hidden="true"
        className="size-3.5 shrink-0 [&_svg]:block [&_svg]:size-full [&_*]:fill-current [&_*]:stroke-current"
      >
        {platform.logoSvg ? (
          <span dangerouslySetInnerHTML={{ __html: platform.logoSvg }} />
        ) : (
          <PlatformIcon aria-hidden="true" />
        )}
      </span>
      <span>{platform.name}</span>
      <span className="text-muted-foreground font-normal normal-case">
        {count} {count === 1 ? 'preset' : 'presets'}
      </span>
    </span>
  );
});