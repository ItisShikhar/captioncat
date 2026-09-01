import { useEffect, useState, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/ui/shadcn/alert-dialog';
import { Button } from '@/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/shadcn/dialog';
import { Input } from '@/ui/shadcn/input';
import { Label } from '@/ui/shadcn/label';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
  validateValue?: (value: string) => string | undefined;
  children?: ReactNode;
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  validateValue,
  children,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const validationMessage = validateValue?.(value);
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || validationMessage) return;
    void onConfirm(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prompt-dialog-input">{label}</Label>
          <Input
            id="prompt-dialog-input"
            value={value}
            autoFocus
            aria-invalid={Boolean(validationMessage)}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          {validationMessage && (
            <p className="text-destructive text-xs" role="alert">
              {validationMessage}
            </p>
          )}
        </div>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" disabled={!value.trim() || Boolean(validationMessage)} onClick={submit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  icon?: ReactNode;
  mediaClassName?: string;
  confirmVariant?: React.ComponentProps<typeof AlertDialogAction>['variant'];
  cancelVariant?: React.ComponentProps<typeof AlertDialogCancel>['variant'];
  size?: 'default' | 'sm';
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  icon,
  mediaClassName,
  confirmVariant = 'default',
  cancelVariant = 'outline',
  size = 'sm',
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size={size}>
        <AlertDialogHeader>
          {icon && <AlertDialogMedia className={mediaClassName}>{icon}</AlertDialogMedia>}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant={cancelVariant}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant={confirmVariant} onClick={() => void onConfirm()}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
