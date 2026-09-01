import type { ReactNode } from 'react';
import { Pause, Play, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import { Badge } from '@/ui/shadcn/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { PREVIEW_QUALITY_OPTIONS, PREVIEW_SPEED_OPTIONS, type PreviewQuality } from './aspect-ratios';
import { PreviewFrameExportButton, type PreviewFrameExportButtonProps } from './preview-frame-export-button';

export interface PreviewLanguageOption {
  id: string;
  name: string;
  direction?: 'ltr' | 'rtl';
}

export interface PreviewPlaybackSettings {
  quality: PreviewQuality;
  speed: number;
  languageId: string;
  rows: 1 | 2;
}

export interface PreviewPlaybackActionsProps {
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  currentTimeSeconds: number;
  durationSeconds: number;
  onSeek: (timeSeconds: number) => void;
  previewTitle: string;
  showLabels?: boolean;
  frameExport?: PreviewFrameExportButtonProps;
}

export interface PreviewPlaybackControlsProps {
  previewQuality?: PreviewQuality;
  onPreviewQualityChange?: (quality: PreviewQuality) => void;
  showQuality?: boolean;
  showLabels?: boolean;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  showSpeed?: boolean;
  languageId: string;
  languages: ReadonlyArray<PreviewLanguageOption>;
  onLanguageIdChange: (id: string) => void;
  showLanguage?: boolean;
  rows?: number;
  onRowsChange?: (rows: 1 | 2) => void;
  showRows?: boolean;
}

export function PreviewPlaybackControls({
  previewQuality,
  onPreviewQualityChange,
  showQuality = true,
  showLabels = false,
  playbackSpeed,
  onPlaybackSpeedChange,
  showSpeed = true,
  languageId,
  languages,
  onLanguageIdChange,
  showLanguage = true,
  rows,
  onRowsChange,
  showRows = false,
}: PreviewPlaybackControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2" data-preview-control-bar="true">
      {showQuality && previewQuality && onPreviewQualityChange && (
        <PreviewControlGroup label="Quality" showLabel={showLabels}>
          <div
            className="bg-background flex h-8 shrink-0 items-center rounded-lg border p-px"
            role="group"
            aria-label="Preview quality"
          >
            {PREVIEW_QUALITY_OPTIONS.map((option) => (
              <Tooltip key={option.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`h-7 rounded-md px-1.5 text-[11px] tracking-widest transition-colors ${
                      previewQuality === option.id
                        ? 'cursor-default bg-foreground text-background shadow-sm font-bold'
                        : 'cursor-pointer text-muted-foreground hover:text-foreground font-semibold'
                    }`}
                    aria-pressed={previewQuality === option.id}
                    onClick={() => onPreviewQualityChange(option.id)}
                  >
                    {option.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56 text-xs whitespace-pre-line">
                  <strong>Use {option.label} preview quality.</strong>
                  <br />
                  {option.id === 'hd' ? 'Sharper preview with higher render cost.' : 'Faster preview with lower detail.'}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </PreviewControlGroup>
      )}

      {showSpeed && (
        <PreviewControlGroup label="Speed" showLabel={showLabels}>
          <Select
            value={String(playbackSpeed)}
            onValueChange={(value) => {
              const speed = Number(value);
              if (Number.isFinite(speed) && speed > 0) onPlaybackSpeedChange(speed);
            }}
          >
            <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer" aria-label="Preview speed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREVIEW_SPEED_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)} className="cursor-pointer">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PreviewControlGroup>
      )}

      {showRows && onRowsChange && (
        <PreviewControlGroup label="Rows" showLabel={showLabels}>
          <Select
            value={String(rows ?? 1)}
            onValueChange={(value) => {
              const nextRows = Number(value);
              if (nextRows === 1 || nextRows === 2) onRowsChange(nextRows as 1 | 2);
            }}
          >
            <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer" aria-label="Preview row count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2].map((option) => (
                <SelectItem key={option} value={String(option)} className="cursor-pointer">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PreviewControlGroup>
      )}

      {showLanguage && languages.length > 0 && (
        <PreviewControlGroup label="Language" showLabel={showLabels}>
          {!showLabels && <span aria-hidden="true" className="bg-border/80 mx-1 h-6 w-px shrink-0" />}
          <Select value={languageId} onValueChange={onLanguageIdChange}>
            <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer" aria-label="Preview language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((option) => (
                <SelectItem key={option.id} value={option.id} className="cursor-pointer">
                  <PreviewLanguageOptionLabel option={option} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PreviewControlGroup>
      )}
    </div>
  );
}

export function PreviewLanguageOptionLabel({ option }: { option: PreviewLanguageOption }): ReactNode {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{option.name}</span>
      {option.direction === 'rtl' && (
        <Badge variant="outline" className="cursor-default border-border bg-background px-1 py-0 text-[9px] leading-4 text-foreground">
          RTL
        </Badge>
      )}
    </span>
  );
}

export function PreviewPlaybackActions({
  isPlaying,
  onPlayingChange,
  loop,
  onLoopChange,
  currentTimeSeconds,
  durationSeconds,
  onSeek,
  previewTitle,
  showLabels = false,
  frameExport,
}: PreviewPlaybackActionsProps) {
  const normalizedDurationSeconds =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const normalizedCurrentTimeSeconds = Math.min(
    normalizedDurationSeconds,
    Math.max(0, Number.isFinite(currentTimeSeconds) ? currentTimeSeconds : 0),
  );

  return (
    <PreviewControlGroup label="Playback" showLabel={showLabels}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5" data-preview-scrubber="true">
          <input
            type="range"
            min={0}
            max={normalizedDurationSeconds}
            step={0.01}
            value={normalizedCurrentTimeSeconds}
            disabled={normalizedDurationSeconds <= 0}
            aria-label={`${previewTitle} timeline`}
            aria-valuetext={`${formatPreviewTime(normalizedCurrentTimeSeconds)} of ${formatPreviewTime(normalizedDurationSeconds)}`}
            className="h-2 w-36 min-w-20 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
          />
          <span className="text-muted-foreground min-w-[4.5rem] text-right font-mono text-[10px] tabular-nums">
            {formatPreviewTime(normalizedCurrentTimeSeconds)} / {formatPreviewTime(normalizedDurationSeconds)}
          </span>
        </div>
        <ButtonGroup aria-label={`${previewTitle} playback controls`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'h-8 w-[4.75rem] justify-center gap-1 px-2 text-xs',
                  isPlaying &&
                    'border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-600 dark:text-white dark:hover:border-blue-700 dark:hover:bg-blue-700',
                )}
                aria-label={isPlaying ? `Pause ${previewTitle}` : `Play ${previewTitle}`}
                aria-pressed={isPlaying}
                data-preview-play-toggle="true"
                onClick={() => onPlayingChange(!isPlaying)}
              >
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
                {isPlaying ? (
                  <Pause className="size-3.5 fill-current" />
                ) : (
                  <Play className="size-3.5 fill-current" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <strong>{isPlaying ? 'Pause preview.' : 'Play preview.'}</strong>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'h-8 w-8 justify-center px-0',
                  loop &&
                    'border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-600 dark:text-white dark:hover:border-blue-700 dark:hover:bg-blue-700',
                )}
                aria-pressed={loop}
                aria-label={`Loop ${previewTitle}`}
                data-preview-loop-toggle="true"
                onClick={() => onLoopChange(!loop)}
              >
                <Repeat2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56 text-xs whitespace-pre-line">
              <strong>{loop ? 'Looping is on.' : 'Looping is off.'}</strong>
              <br />
              {loop ? 'Restart the preview after it ends.' : 'Stop the preview after one cycle.'}
            </TooltipContent>
          </Tooltip>
          {frameExport && <PreviewFrameExportButton {...frameExport} />}
        </ButtonGroup>
      </div>
    </PreviewControlGroup>
  );
}

function formatPreviewTime(timeSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function PreviewControlGroup({
  label,
  showLabel,
  children,
}: {
  label: string;
  showLabel: boolean;
  children: ReactNode;
}) {
  if (!showLabel) return <>{children}</>;

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <PreviewControlLabel>{label}</PreviewControlLabel>
      {children}
    </div>
  );
}

export function PreviewControlLabel({ children }: { children: string }) {
  return (
    <span className="text-muted-foreground whitespace-nowrap pr-1 pl-0 text-[9px] font-semibold leading-none tracking-[0.16em] uppercase">
      {children}
    </span>
  );
}
