import { PromptDialog } from '@/ui/app-dialogs';
import { validatePresetName } from '@/lib/preset-name';
import {
  BACKGROUND_FIXTURES,
  CAPTION_STORIES,
  DEFAULT_BACKGROUND_ID,
  DEFAULT_STORY_ID,
} from '@/ui/preview/data';
import {
  ASPECT_RATIO_OPTIONS,
  isPreviewAspectRatioId,
  type PreviewAspectRatioId,
} from '@/ui/preview/aspect-ratios';
import { Label } from '@/ui/shadcn/label';
import { Input } from '@/ui/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PresetNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialValue: string;
  initialAspectRatioId: PreviewAspectRatioId;
  confirmLabel: string;
  initialTags?: readonly string[];
  initialPreviewBackgroundId?: string;
  initialPreviewStoryId?: string;
  onConfirm: (
    name: string,
    aspectRatioId: PreviewAspectRatioId,
    tags: string[],
    previewSelection?: PresetPreviewSelection,
  ) => void;
}

export interface PresetPreviewSelection {
  backgroundId: string;
  storyId: string;
}

/** Reusable preset name and preferred aspect-ratio dialog. */
export function PresetNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  initialAspectRatioId,
  confirmLabel,
  initialTags,
  initialPreviewBackgroundId,
  initialPreviewStoryId,
  onConfirm,
}: PresetNameDialogProps) {
  const [aspectRatioId, setAspectRatioId] = useState(initialAspectRatioId);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [previewBackgroundId, setPreviewBackgroundId] = useState(initialPreviewBackgroundId ?? DEFAULT_BACKGROUND_ID);
  const [previewStoryId, setPreviewStoryId] = useState(initialPreviewStoryId ?? DEFAULT_STORY_ID);
  const hasPreviewSelection = initialPreviewBackgroundId !== undefined && initialPreviewStoryId !== undefined;

  useEffect(() => {
    if (!open) return;
    setAspectRatioId(initialAspectRatioId);
    setTags(initialTags ? [...initialTags] : []);
    setTagInput('');
    if (initialPreviewBackgroundId !== undefined) setPreviewBackgroundId(initialPreviewBackgroundId);
    if (initialPreviewStoryId !== undefined) setPreviewStoryId(initialPreviewStoryId);
  }, [open, initialAspectRatioId, initialTags, initialPreviewBackgroundId, initialPreviewStoryId]);

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || tags.some((existingTag) => existingTag.toLowerCase() === tag.toLowerCase())) return;
    setTags((current) => [...current, tag]);
    setTagInput('');
  };

  return (
    <PromptDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      label="Preset name"
      initialValue={initialValue}
      confirmLabel={confirmLabel}
      validateValue={validatePresetName}
      onConfirm={(name) => {
        const pendingTag = tagInput.trim();
        const confirmedTags =
          pendingTag && !tags.some((tag) => tag.toLowerCase() === pendingTag.toLowerCase())
            ? [...tags, pendingTag]
            : tags;
        onConfirm(
          name,
          aspectRatioId,
          confirmedTags,
          hasPreviewSelection ? { backgroundId: previewBackgroundId, storyId: previewStoryId } : undefined,
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preset-name-dialog-aspect-ratio">
          Preferred preview aspect ratio
        </Label>
        <Select
          value={aspectRatioId}
          onValueChange={(value) => {
            if (isPreviewAspectRatioId(value)) setAspectRatioId(value);
          }}
        >
          <SelectTrigger id="preset-name-dialog-aspect-ratio" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_RATIO_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasPreviewSelection && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-name-dialog-preview-background">Preview background</Label>
            <Select value={previewBackgroundId} onValueChange={setPreviewBackgroundId}>
              <SelectTrigger id="preset-name-dialog-preview-background" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BACKGROUND_FIXTURES.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-name-dialog-preview-content">Premade preview content</Label>
            <Select value={previewStoryId} onValueChange={setPreviewStoryId}>
              <SelectTrigger id="preset-name-dialog-preview-content" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_STORIES.map((story) => (
                  <SelectItem key={story.id} value={story.id}>
                    {story.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preset-name-dialog-tags">Tags</Label>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Preset tags">
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
              >
                {tag}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground rounded-sm"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => setTags((current) => current.filter((existingTag) => existingTag !== tag))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input
          id="preset-name-dialog-tags"
          value={tagInput}
          placeholder="Add a tag"
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              event.stopPropagation();
              addTag();
            }
          }}
          onBlur={addTag}
        />
      </div>
    </PromptDialog>
  );
}
