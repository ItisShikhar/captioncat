import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Textarea } from '@/ui/shadcn/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PreviewControlLabel } from './preview-playback-controls';

export type PreviewTextMode = 'premade' | 'custom';
export const MAX_CUSTOM_PREVIEW_TEXT_LENGTH = 512;
export const MAX_CUSTOM_PREVIEW_WORDS = 32;

export function limitCustomPreviewText(text: string): string {
  const characterLimitedText = text.slice(0, MAX_CUSTOM_PREVIEW_TEXT_LENGTH);
  const words = [...characterLimitedText.matchAll(/\S+/g)];
  if (words.length <= MAX_CUSTOM_PREVIEW_WORDS) return characterLimitedText;

  const lastAllowedWord = words[MAX_CUSTOM_PREVIEW_WORDS - 1];
  const end = (lastAllowedWord.index ?? 0) + lastAllowedWord[0].length;
  return characterLimitedText.slice(0, end);
}

function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

export interface PreviewTextSourceControlsProps {
  textMode: PreviewTextMode;
  onTextModeChange: (mode: PreviewTextMode) => void;
  customText: string;
  onCustomTextChange: (text: string) => void;
  children: ReactNode;
}

export function PreviewTextSourceControls({
  textMode,
  onTextModeChange,
  customText,
  onCustomTextChange,
  children,
}: PreviewTextSourceControlsProps) {
  const [customTextDraft, setCustomTextDraft] = useState(customText);

  useEffect(() => {
    setCustomTextDraft(customText);
  }, [customText]);

  const commitCustomText = useCallback(() => {
    if (customTextDraft === customText) return;
    onCustomTextChange(customTextDraft);
  }, [customText, customTextDraft, onCustomTextChange]);

  return (
    <>
      <div className="flex shrink-0 flex-col gap-1">
        <PreviewControlLabel>Text source</PreviewControlLabel>
        <Select
          value={textMode}
          onValueChange={(value) => {
            if (value === 'premade' || value === 'custom') onTextModeChange(value);
          }}
        >
          <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer" aria-label="Preview text source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="premade" className="cursor-pointer">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">Premade texts</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64 text-xs whitespace-pre-line">
                  <strong>Use the built-in preview text.</strong>
                  <br />
                  Compare the preset without entering sample text.
                </TooltipContent>
              </Tooltip>
            </SelectItem>
            <SelectItem value="custom" className="cursor-pointer">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">Custom text</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-64 text-xs whitespace-pre-line">
                  <strong>Preview your own text.</strong>
                  <br />
                  The editor allows up to {MAX_CUSTOM_PREVIEW_WORDS} words and {MAX_CUSTOM_PREVIEW_TEXT_LENGTH} characters.
                </TooltipContent>
              </Tooltip>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {textMode === 'custom' ? (
        <div className="flex shrink-0 flex-col gap-1">
          <div className="flex items-center gap-1">
            <PreviewControlLabel>Custom text</PreviewControlLabel>
            <InfoTooltip ariaLabel="Explain custom preview text">
              <strong>Use text that matches your target caption.</strong>
              <br />
              Longer text takes longer to generate previews.
            </InfoTooltip>
          </div>
          <Textarea
            value={customTextDraft}
            onChange={(event) => setCustomTextDraft(limitCustomPreviewText(event.target.value))}
            onBlur={commitCustomText}
            maxLength={MAX_CUSTOM_PREVIEW_TEXT_LENGTH}
            rows={4}
            placeholder="Enter preview text"
            aria-label="Custom preview text"
            className="h-24 w-64 resize"
          />
          <span className="text-muted-foreground text-right text-[10px]">
            {countWords(customTextDraft)}/{MAX_CUSTOM_PREVIEW_WORDS} words | {customTextDraft.length}/
            {MAX_CUSTOM_PREVIEW_TEXT_LENGTH}
          </span>
        </div>
      ) : (
        children
      )}
    </>
  );
}
