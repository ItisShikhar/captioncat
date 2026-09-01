import { ClipboardPaste, Copy } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import type { Paint, PaintCapability } from '@/schema/paint';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import {
  clearRememberedPaint,
  copyPaintToClipboard,
  getPasteableRememberedPaint,
  getRememberedPaint,
  pasteRememberedPaint,
  rememberCopiedPaint,
  subscribeToRememberedPaint,
} from './paint-clipboard';

export interface PaintClipboardActionsProps {
  value: Paint;
  capabilities: readonly PaintCapability[];
  onPaste: (paint: Paint) => void;
  itemLabel?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PaintClipboardActions({
  value,
  capabilities,
  onPaste,
  itemLabel = 'paint',
  className,
  compact = false,
  disabled = false,
}: PaintClipboardActionsProps) {
  const rememberedPaint = useSyncExternalStore(subscribeToRememberedPaint, getRememberedPaint, getRememberedPaint);
  const canPaste = rememberedPaint !== null && getPasteableRememberedPaint(capabilities) !== null;

  const handleCopy = async () => {
    try {
      await copyPaintToClipboard(value);
      rememberCopiedPaint(value);
      toast.success(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} copied`, { position: 'bottom-center' });
    } catch (error) {
      toast.error(`Could not copy ${itemLabel}: ${errorMessage(error)}`, { position: 'bottom-center' });
    }
  };

  const handlePaste = () => {
    try {
      const paint = pasteRememberedPaint(capabilities);
      onPaste(paint);
      clearRememberedPaint();
      toast.success(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} pasted`, { position: 'bottom-center' });
    } catch (error) {
      toast.error(`Could not paste ${itemLabel}: ${errorMessage(error)}`, { position: 'bottom-center' });
    }
  };

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <Button
        type="button"
        variant="ghost"
        size={compact ? 'icon-xs' : 'icon'}
        className="size-4 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
        aria-label={`Copy ${itemLabel}`}
        title={`Copy ${itemLabel}`}
        onClick={handleCopy}
        disabled={disabled}
      >
        <Copy className="size-3.5" />
      </Button>
      {canPaste && (
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon-xs' : 'icon'}
          className="size-4 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
          aria-label={`Paste ${itemLabel}`}
          title={`Paste ${itemLabel}`}
          onClick={handlePaste}
          disabled={disabled}
        >
          <ClipboardPaste className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
