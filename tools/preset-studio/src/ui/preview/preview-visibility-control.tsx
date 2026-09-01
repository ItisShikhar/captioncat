import { ChevronDown, Eye, EyeDashed, EyeOff } from 'lucide-react';

import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import {
  PREVIEW_SURFACE_IDS,
  type PreviewSurfaceId,
  type PreviewSurfaceVisibilityById,
} from './use-preview-culling';

const PREVIEW_SURFACE_LABELS: Record<PreviewSurfaceId, string> = {
  live: 'Live preview',
  word: 'Full cycle preview',
  style: 'Word state preview',
};

export interface PreviewVisibilityControlProps {
  visibility: PreviewSurfaceVisibilityById;
  onPreviewVisibilityChange: (previewId: PreviewSurfaceId, visible: boolean) => void;
  onAllPreviewVisibilityChange: (visible: boolean) => void;
}

export function PreviewVisibilityControl({
  visibility,
  onPreviewVisibilityChange,
  onAllPreviewVisibilityChange,
}: PreviewVisibilityControlProps) {
  const visiblePreviewCount = PREVIEW_SURFACE_IDS.filter((previewId) => visibility[previewId]).length;
  const areAllPreviewsVisible = visiblePreviewCount === PREVIEW_SURFACE_IDS.length;
  const areAnyPreviewsVisible = visiblePreviewCount > 0;
  const buttonLabel = areAnyPreviewsVisible ? 'Hide all previews' : 'Show all previews';
  const VisibilityIcon = areAllPreviewsVisible ? Eye : areAnyPreviewsVisible ? EyeDashed : EyeOff;

  return (
    <ButtonGroup aria-label="Preview visibility controls">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-full"
            aria-label={buttonLabel}
            aria-pressed={areAllPreviewsVisible ? true : areAnyPreviewsVisible ? 'mixed' : false}
            data-preview-visibility-toggle="true"
            onClick={() => onAllPreviewVisibilityChange(!areAnyPreviewsVisible)}
          >
            <VisibilityIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs whitespace-pre-line">
          <strong>{buttonLabel}.</strong>
          <br />
          Toggle every preview surface at once.
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-full w-6 rounded-l-none px-0"
                aria-label="Configure preview visibility"
                data-preview-visibility-control="true"
              >
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64 text-xs whitespace-pre-line">
            <strong>Choose preview surfaces.</strong>
            <br />
            Show or hide each preview independently.
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Preview surfaces</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={areAllPreviewsVisible}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={onAllPreviewVisibilityChange}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block w-full">All previews</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-64 text-xs whitespace-pre-line">
                <strong>Toggle every preview surface.</strong>
                <br />
                Use the main eye button for the same action.
              </TooltipContent>
            </Tooltip>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {PREVIEW_SURFACE_IDS.map((previewId) => (
            <DropdownMenuCheckboxItem
              key={previewId}
              checked={visibility[previewId]}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(visible) => onPreviewVisibilityChange(previewId, visible)}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">{PREVIEW_SURFACE_LABELS[previewId]}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64 text-xs whitespace-pre-line">
                  <strong>{PREVIEW_SURFACE_LABELS[previewId]}.</strong>
                  <br />
                  Toggle this preview surface without changing the others.
                </TooltipContent>
              </Tooltip>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
