import { Download } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { toast } from 'sonner';
import { downloadBlobFile } from '@/lib/file-io';
import { Button } from '@/ui/shadcn/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

export interface PreviewFrameExportButtonProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  presetId: string;
  languageId: string;
  frameIndex: number;
  disabled?: boolean;
}

export function PreviewFrameExportButton({
  canvasRef,
  presetId,
  languageId,
  frameIndex,
  disabled = false,
}: PreviewFrameExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const frameNumber = Math.max(0, Math.floor(frameIndex)) + 1;
  const fileName = `${presetId}_${languageId}_${frameNumber}.png`;

  const handleExport = async (): Promise<void> => {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isExporting) return;

    setIsExporting(true);
    try {
      const blob = await canvasToPngBlob(canvas);
      downloadBlobFile(fileName, blob);
      toast.success(`Exported ${fileName}`, { position: 'bottom-center' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Unable to export ${fileName}: ${message}`, { position: 'bottom-center' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 w-8 justify-center px-0"
          aria-label={`Export current frame as ${fileName}`}
          data-preview-frame-export="true"
          disabled={disabled || isExporting}
          onClick={handleExport}
        >
          <Download className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-xs">
        Export current frame as <strong>{fileName}</strong>
      </TooltipContent>
    </Tooltip>
  );
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('The browser did not create a PNG image.'));
      }
    }, 'image/png');
  });
}
