import {
  PROJECT_BRANDING,
  PROJECT_BRANDING_GITHUB_ICON_URL,
  PROJECT_BRANDING_LINKEDIN_ICON_URL,
  PROJECT_BRANDING_LOGO_URL,
  PROJECT_BRANDING_MONOGRAM_URL,
} from '@/project-branding';
import type { PresetEditorState } from '@/schema';
import type { LibraryEntry, PresetHistoryItem } from '@/state/preset-library';
import { UnsavedChangesDot } from '@/ui/components/unsaved-changes-dot';
import { useThemeToggle } from '@/ui/hooks/use-theme-toggle';
import { PresetNameDialog, type PresetPreviewSelection } from '@/ui/library/preset-name-dialog';
import { SettingsPopover } from '@/ui/panels/design-editor';
import type { PreviewAspectRatioId } from '@/ui/preview/aspect-ratios';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { ChevronDown, Copy, FileText, FolderOpen, History, Moon, Plus, Redo2, Sun, Undo2, Upload } from 'lucide-react';
import { useState } from 'react';
import { PreviewVisibilityControl } from './preview-visibility-control';
import type { PreviewSurfaceId, PreviewSurfaceVisibilityById } from './use-preview-culling';

export interface FloatingCanvasToolbarProps {
  selected: LibraryEntry;
  languageId?: string;
  onRevealPreset?: () => void;
  dirty?: boolean;
  onUpdateTiming: (updater: (previous: PresetEditorState['timing']) => PresetEditorState['timing']) => void;
  onUpdateCaptionLayout: (
    updater: (previous: PresetEditorState['captionLayout']) => PresetEditorState['captionLayout'],
  ) => void;
  onMakePageHeightFitParent?: () => void;
  onSettingsOpenChange?: (open: boolean) => void;
  previewAspectId: PreviewAspectRatioId;
  previewBackgroundId: string;
  previewStoryId: string;
  newPresetDialogOpen: boolean;
  onNewPresetDialogOpenChange: (open: boolean) => void;
  onCreateNew: (name: string, aspectRatioId: PreviewAspectRatioId, tags: string[]) => void | Promise<void>;
  onSaveAsCopy: (
    key: string,
    name: string,
    aspectRatioId: PreviewAspectRatioId,
    tags: string[],
    previewSelection?: PresetPreviewSelection,
  ) => void | Promise<void>;
  onDuplicate: (key: string, name: string, aspectRatioId: PreviewAspectRatioId) => void | Promise<void>;
  onOpenFiles: () => void | Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  history: readonly PresetHistoryItem[];
  onUndo: () => void;
  onRedo: () => void;
  onUndoTo: (index: number) => void;
  previewVisibility: PreviewSurfaceVisibilityById;
  onPreviewVisibilityChange: (previewId: PreviewSurfaceId, visible: boolean) => void;
  onAllPreviewVisibilityChange: (visible: boolean) => void;
}

function ThemeMenuItem() {
  const { mounted, isDark, toggleTheme } = useThemeToggle();

  return (
    <DropdownMenuItem disabled={!mounted} onSelect={toggleTheme}>
      {isDark ? <Sun /> : <Moon />}
      {isDark ? 'Light mode' : 'Dark mode'}
    </DropdownMenuItem>
  );
}

/**
 * Floating editor chrome keeps document controls above the canvas without
 * taking space from the preview surface.
 */
export function FloatingCanvasToolbar({
  selected,
  languageId,
  onRevealPreset,
  dirty,
  onUpdateTiming,
  onUpdateCaptionLayout,
  onMakePageHeightFitParent,
  onSettingsOpenChange,
  previewAspectId,
  newPresetDialogOpen,
  onNewPresetDialogOpenChange,
  onCreateNew,
  onSaveAsCopy,
  onDuplicate,
  onOpenFiles,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  history,
  onUndo,
  onRedo,
  onUndoTo,
  previewVisibility,
  onPreviewVisibilityChange,
  onAllPreviewVisibilityChange,
  previewBackgroundId,
  previewStoryId,
}: FloatingCanvasToolbarProps) {
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-auto flex min-w-0 max-w-full items-stretch gap-1.5 rounded-xl border border-border/60 bg-background/70 backdrop-blur-md p-1 shadow-lg">
        <ButtonGroup aria-label="captioncat application and preset controls" className="min-w-0">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-full min-w-0 max-w-56 justify-start gap-2 px-2 py-1.5"
                    aria-label={`Open ${PROJECT_BRANDING.projectName} menu`}
                  >
                    <span
                      aria-hidden="true"
                      className="block size-6 shrink-0 bg-foreground transition-colors group-hover/btn:bg-[#2F77F4]"
                      style={{
                        maskImage: `url("${PROJECT_BRANDING_LOGO_URL}")`,
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                        maskSize: 'contain',
                        WebkitMaskImage: `url("${PROJECT_BRANDING_LOGO_URL}")`,
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                      }}
                    />
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <img
                          src={PROJECT_BRANDING_MONOGRAM_URL}
                          alt={PROJECT_BRANDING.projectName}
                          className="h-6 w-auto max-w-28 object-contain dark:invert"
                        />
                        <ChevronDown className="size-3 shrink-0" />
                      </span>
                      <span className="text-muted-foreground/75 hidden truncate text-[10px] leading-none sm:block">
                        by {PROJECT_BRANDING.authorName}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-xs whitespace-pre-line">
                <strong>Open the app menu.</strong>
                <br />
                Create, open, export, duplicate, or change the theme.
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" sideOffset={8} className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FileText />
                  File
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem onSelect={() => onNewPresetDialogOpenChange(true)}>
                    <Plus />
                    New
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onOpenFiles()}>
                    <FolderOpen />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSaveAsOpen(true)}>
                    <Upload />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDuplicateOpen(true)}>
                    <Copy />
                    Duplicate
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <ThemeMenuItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="h-auto items-start">
                <a href={PROJECT_BRANDING.links.github} target="_blank" rel="noopener noreferrer">
                  <img
                    src={PROJECT_BRANDING_GITHUB_ICON_URL}
                    alt=""
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 dark:invert"
                  />
                  <span className="flex flex-col">
                    <span>GitHub</span>
                    <span className="text-xs font-normal text-muted-foreground">View source code</span>
                  </span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="h-auto items-start">
                <a href={PROJECT_BRANDING.links.linkedin} target="_blank" rel="noopener noreferrer">
                  <img
                    src={PROJECT_BRANDING_LINKEDIN_ICON_URL}
                    alt=""
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 dark:invert"
                  />
                  <span className="flex flex-col">
                    <span>LinkedIn</span>
                    <span className="text-xs font-normal text-muted-foreground">Hire me</span>
                  </span>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>

        <span aria-hidden="true" className="bg-border/70 w-px shrink-0 self-stretch" />

        <div className="flex min-w-0 items-stretch">
          <ButtonGroup aria-label={`${selected.document.name} preset controls`} className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-full min-w-0 max-w-64 justify-start px-2.5 text-left font-semibold"
              onClick={onRevealPreset}
              aria-label={`Reveal ${selected.document.name} in the preset library`}
              title={`Reveal ${selected.document.name} in the preset library`}
            >
              {dirty && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0">
                      <UnsavedChangesDot size="md" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">Unsaved changes</TooltipContent>
                </Tooltip>
              )}
              <span className="truncate">{selected.document.name}</span>
            </Button>
            <SettingsPopover
              document={selected.document}
              languageId={languageId}
              onUpdateTiming={onUpdateTiming}
              onUpdateCaptionLayout={onUpdateCaptionLayout}
              onMakePageHeightFitParent={onMakePageHeightFitParent}
              onOpenChange={onSettingsOpenChange}
            />
          </ButtonGroup>
        </div>

        <span aria-hidden="true" className="bg-border/70 w-px shrink-0 self-stretch" />

        <PreviewVisibilityControl
          visibility={previewVisibility}
          onPreviewVisibilityChange={onPreviewVisibilityChange}
          onAllPreviewVisibilityChange={onAllPreviewVisibilityChange}
        />

        <span aria-hidden="true" className="bg-border/70 w-px shrink-0 self-stretch" />

        <ButtonGroup aria-label="History controls" className="shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-full"
                aria-label={undoLabel ? `Undo ${undoLabel}` : 'Undo'}
                disabled={!canUndo}
                onClick={onUndo}
              >
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{undoLabel ? `Undo ${undoLabel}` : 'Undo'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-full"
                aria-label={redoLabel ? `Redo ${redoLabel}` : 'Redo'}
                disabled={!canRedo}
                onClick={onRedo}
              >
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{redoLabel ? `Redo ${redoLabel}` : 'Redo'}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-full" aria-label="Open change history">
                    <History />
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs whitespace-pre-line">
                <strong>Open change history.</strong>
                <br />
                Jump to an earlier edit or review the latest changes.
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
              {history.length === 0 ? (
                <DropdownMenuItem disabled>No changes yet</DropdownMenuItem>
              ) : (
                [...history]
                  .reverse()
                  .slice(0, 12)
                  .map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      disabled={item.index === history.length - 1}
                      onSelect={() => onUndoTo(item.index)}
                    >
                      {item.label}
                    </DropdownMenuItem>
                  ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>

      <PresetNameDialog
        open={newPresetDialogOpen}
        onOpenChange={onNewPresetDialogOpenChange}
        title="New preset"
        description="Creates a fresh starter preset based on the default Arimo/white config."
        initialValue="New preset"
        initialAspectRatioId={previewAspectId}
        confirmLabel="Create"
        onConfirm={(name, aspectRatioId, tags) => onCreateNew(name, aspectRatioId, tags)}
      />

      <PresetNameDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        title="Export preset"
        description="Exports the current edits under a new preset name."
        initialValue={selected.origin === 'new' ? selected.document.name : `${selected.document.name} #2`}
        initialAspectRatioId={previewAspectId}
        initialTags={selected.document.metadata?.badges}
        initialPreviewBackgroundId={previewBackgroundId}
        initialPreviewStoryId={previewStoryId}
        confirmLabel="Export"
        onConfirm={(name, aspectRatioId, tags, previewSelection) =>
          onSaveAsCopy(selected.key, name, aspectRatioId, tags, previewSelection)
        }
      />

      <PresetNameDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        title="Duplicate preset"
        description="Creates another in-memory copy of this preset. It will not be written to disk."
        initialValue={`${selected.document.name} copy`}
        initialAspectRatioId={previewAspectId}
        confirmLabel="Duplicate"
        onConfirm={(name, aspectRatioId) => onDuplicate(selected.key, name, aspectRatioId)}
      />
    </>
  );
}
