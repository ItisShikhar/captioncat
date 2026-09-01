import { ChevronDown, ChevronRight, Eye, EyeDashed, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { headerIconForComponent } from '@/ui/panels/property-tree-view';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';

import {
  DEBUG_ENTITY_COLORS,
  DEBUG_ENTITY_LABELS,
  DEBUG_ROW_STATES,
  DEBUG_WORD_STATES,
  hasPreviewOverlaySelection,
  type DebugEntityKind,
  type DebugOverlayOptions,
  type DebugRowState,
  type DebugWordState,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
  previewOverlayControlState,
  previewOverlayEntitySelectionState,
  previewOverlayPaddingStateIsSelected,
  previewOverlayPositionStateIsSelected,
  resolvePreviewOverlayVisibility,
  setPreviewOverlaySelection,
  togglePreviewOverlayEntity,
  togglePreviewOverlayGlobalVisibility,
  togglePreviewOverlayPadding,
  togglePreviewOverlayPaddingState,
  togglePreviewOverlayPosition,
  togglePreviewOverlayPositionState,
  togglePreviewOverlayRowState,
  togglePreviewOverlayWordState,
  previewOverlaySelectionIsComplete,
  type PreviewOverlayVisibility,
} from './entity-debug';
import { DEBUG_ENTITY_ICONS } from './debug-entity-icons';
import { PreviewControlLabel } from './preview-playback-controls';

const STATE_LABELS: Record<DebugWordState | DebugRowState, string> = {
  default: 'Default',
  past: 'Past',
  previous: 'Previous',
  current: 'Current',
  next: 'Next',
  future: 'Future',
};
const CHECKBOX_ITEM_CLASS = '[&>span:first-child]:size-3.5 [&>span:first-child>svg]:size-3.5';
const DROPDOWN_SCREEN_GUTTER = 8;

function isStatefulEntity(kind: DebugEntityKind): kind is 'row' | 'word' {
  return kind === 'row' || kind === 'word';
}

export interface PreviewOverlayControlsProps {
  previewTitle: string;
  visibility: PreviewOverlayVisibility;
  options: DebugOverlayOptions;
  onChange: (updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility) => void;
}

export function PreviewOverlayControls({
  previewTitle,
  visibility,
  options,
  onChange,
}: PreviewOverlayControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(options.entities));
  const eyeButtonRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const menuScrollTopRef = useRef(0);
  const knownEntityKindsRef = useRef(new Set(options.entities));
  const resolvedVisibility = resolvePreviewOverlayVisibility(visibility, options);
  const overlayState = previewOverlayControlState(visibility, options);
  const overlaysVisible = visibility.enabled && hasPreviewOverlaySelection(resolvedVisibility);
  const allOverlayOptionsSelected = previewOverlaySelectionIsComplete(resolvedVisibility, options);
  const overlayButtonLabel =
    overlayState === 'off'
      ? `Show ${previewTitle} debug overlays`
      : visibility.enabled
        ? `Hide ${previewTitle} debug overlays`
        : `Show selected ${previewTitle} debug overlays`;
  const positionIcon = headerIconForComponent('transform');
  const paddingIcon = headerIconForComponent('layout');

  useEffect(() => {
    const newKinds = options.entities.filter((kind) => !knownEntityKindsRef.current.has(kind));
    if (newKinds.length > 0) {
      setExpandedKeys((current) => {
        const next = new Set(current);
        for (const kind of newKinds) next.add(kind);
        return next;
      });
    }
    knownEntityKindsRef.current = new Set(options.entities);
  }, [options.entities]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => {
      if (menuContentRef.current) menuContentRef.current.scrollTop = menuScrollTopRef.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (menuContentRef.current?.contains(event.target)) return;
      if (eyeButtonRef.current?.contains(event.target)) return;
      if (menuTriggerRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [menuOpen]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateEntity = (kind: DebugEntityKind) => {
    onChange((current) => togglePreviewOverlayEntity(current, kind, options));
  };

  const updatePadding = (target: PaddingPreviewTarget) => {
    onChange((current) => togglePreviewOverlayPadding(current, target, options));
  };

  const updatePosition = (target: PositionPreviewTarget) => {
    onChange((current) => togglePreviewOverlayPosition(current, target, options));
  };

  const updatePaddingState = (kind: 'row' | 'word', state: DebugWordState | DebugRowState) => {
    onChange((current) => togglePreviewOverlayPaddingState(current, kind, state, options));
  };

  const updatePositionState = (kind: 'row' | 'word', state: DebugWordState | DebugRowState) => {
    onChange((current) => togglePreviewOverlayPositionState(current, kind, state, options));
  };

  const updateWordState = (state: DebugWordState) => {
    onChange((current) => togglePreviewOverlayWordState(current, state, options));
  };

  const updateRowState = (state: DebugRowState) => {
    onChange((current) => togglePreviewOverlayRowState(current, state, options));
  };

  const toggleAll = () => {
    const selectAll = !allOverlayOptionsSelected;
    onChange((current) => setPreviewOverlaySelection(current, options, selectAll));
  };

  const toggleVisibility = () => {
    onChange((current) => togglePreviewOverlayGlobalVisibility(current));
  };

  const renderChildOption = ({
    key,
    label,
    icon,
    checked,
    onCheckedChange,
  }: {
    key: string;
    label: string;
    icon: ReactNode;
    checked: boolean;
    onCheckedChange: () => void;
  }) => (
    <DropdownMenuCheckboxItem
      key={key}
      checked={checked}
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={onCheckedChange}
      className={cn(CHECKBOX_ITEM_CLASS, 'text-muted-foreground min-h-7 py-1.5 pl-7 text-[11px] font-normal')}
    >
      {icon}
      <span>{label}</span>
    </DropdownMenuCheckboxItem>
  );

  const renderEntityChildren = (
    kind: DebugEntityKind,
    keyPrefix: string,
    state?: DebugWordState | DebugRowState,
  ) => {
    const positionTarget = options.positionTargets.find((target) => target.kind === kind);
    const paddingTarget = options.paddingTargets.find((target) => target.kind === kind);
    const stateTarget = state !== undefined && isStatefulEntity(kind) ? { kind, state } : null;
    const children = [
      positionTarget
        ? renderChildOption({
            key: `${keyPrefix}-position`,
            label: 'Position',
            icon: positionIcon,
            checked: stateTarget
              ? previewOverlayPositionStateIsSelected(resolvedVisibility, stateTarget.kind, stateTarget.state)
              : resolvedVisibility.positionTargets.some((target) => target.kind === kind),
            onCheckedChange: () =>
              stateTarget
                ? updatePositionState(stateTarget.kind, stateTarget.state)
                : updatePosition(positionTarget),
          })
        : null,
      paddingTarget
        ? renderChildOption({
            key: `${keyPrefix}-padding`,
            label: 'Padding',
            icon: paddingIcon,
            checked: stateTarget
              ? previewOverlayPaddingStateIsSelected(resolvedVisibility, stateTarget.kind, stateTarget.state)
              : resolvedVisibility.paddingTargets.some((target) => target.kind === kind),
            onCheckedChange: () =>
              stateTarget
                ? updatePaddingState(stateTarget.kind, stateTarget.state)
                : updatePadding(paddingTarget),
          })
        : null,
    ];
    return <div className="space-y-0.5 pl-[18px]">{children}</div>;
  };

  const renderStateChildren = (kind: 'row' | 'word') => {
    const states = kind === 'word' ? DEBUG_WORD_STATES : DEBUG_ROW_STATES;
    const stateSelected = (state: DebugWordState | DebugRowState) =>
      kind === 'word'
        ? resolvedVisibility.wordStates.includes(state as DebugWordState)
        : resolvedVisibility.rowStates.includes(state);
    const updateState = (state: DebugWordState | DebugRowState) =>
      kind === 'word'
        ? updateWordState(state as DebugWordState)
        : updateRowState(state as DebugRowState);

    return (
      <div className="space-y-0.5 pl-2">
        {states.map((state) => {
          const stateKey = `${kind}:${state}`;
          const expanded = expandedKeys.has(stateKey);
          return (
            <div key={stateKey}>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm p-0"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${DEBUG_ENTITY_LABELS[kind]} ${STATE_LABELS[state]}`}
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleExpanded(stateKey);
                  }}
                >
                  {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <DropdownMenuCheckboxItem
                  checked={stateSelected(state)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => updateState(state)}
                  className={cn(
                    CHECKBOX_ITEM_CLASS,
                    'text-muted-foreground min-w-0 flex-1 py-1.5 pl-7 text-[11px] font-normal',
                  )}
                >
                  {(() => {
                    const Icon = DEBUG_ENTITY_ICONS[kind];
                    return <Icon aria-hidden="true" className="size-3.5 shrink-0" style={{ color: DEBUG_ENTITY_COLORS[kind] }} />;
                  })()}
                  <span>
                    {DEBUG_ENTITY_LABELS[kind]} {STATE_LABELS[state]}
                  </span>
                </DropdownMenuCheckboxItem>
              </div>
              {expanded && renderEntityChildren(kind, stateKey, state)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <PreviewControlLabel>Overlays</PreviewControlLabel>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ButtonGroup aria-label={`${previewTitle} debug overlay controls`}>
          <Button
            ref={eyeButtonRef}
            type="button"
            variant="outline"
            size="icon-xs"
            className={cn(
              'h-8 w-8 cursor-pointer',
              overlaysVisible &&
                'border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-600 dark:text-white dark:hover:border-blue-700 dark:hover:bg-blue-700',
            )}
            aria-label={overlayButtonLabel}
            aria-pressed={overlaysVisible}
            data-preview-overlay-toggle="true"
            onClick={toggleVisibility}
          >
            {overlayState === 'off' ? (
              <EyeOff className="size-3.5" />
            ) : overlayState === 'mixed' ? (
              <EyeDashed className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </Button>
          <DropdownMenuTrigger asChild>
            <Button
              ref={menuTriggerRef}
              type="button"
              variant="outline"
              size="icon-xs"
              className="h-8 w-6 cursor-pointer rounded-l-none px-0"
              aria-label={`Choose ${previewTitle} debug overlays`}
              data-preview-overlay-menu="true"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </ButtonGroup>
        <DropdownMenuContent
          ref={menuContentRef}
          align="end"
          collisionPadding={DROPDOWN_SCREEN_GUTTER}
          className="max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] w-fit min-w-0 overflow-y-auto px-2"
          style={{ width: 'fit-content', minWidth: 0 }}
          onScroll={(event) => {
            menuScrollTopRef.current = event.currentTarget.scrollTop;
          }}
          onPointerDownOutside={(event) => {
            if (event.target instanceof Node && eyeButtonRef.current?.contains(event.target)) {
              event.preventDefault();
            }
          }}
        >
          <DropdownMenuCheckboxItem
            checked={allOverlayOptionsSelected}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={toggleAll}
            className={cn(CHECKBOX_ITEM_CLASS, 'py-1.5 font-medium')}
          >
            <span>Toggle all</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuLabel>Overlay Entities</DropdownMenuLabel>
          {options.entities.map((kind) => {
            const Icon = DEBUG_ENTITY_ICONS[kind];
            const expanded = expandedKeys.has(kind);
            return (
              <div key={kind}>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm p-0"
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${DEBUG_ENTITY_LABELS[kind]}`}
                    aria-expanded={expanded}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleExpanded(kind);
                    }}
                  >
                    {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </button>
                  <DropdownMenuCheckboxItem
                    checked={
                      isStatefulEntity(kind)
                        ? previewOverlayEntitySelectionState(resolvedVisibility, kind)
                        : resolvedVisibility.entityKinds.includes(kind)
                    }
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={() => updateEntity(kind)}
                    className={cn(CHECKBOX_ITEM_CLASS, 'min-w-0 flex-1 py-1.5 pl-7')}
                  >
                    <Icon aria-hidden="true" className="size-3.5 shrink-0" style={{ color: DEBUG_ENTITY_COLORS[kind] }} />
                    <span>{DEBUG_ENTITY_LABELS[kind]}</span>
                  </DropdownMenuCheckboxItem>
                </div>
                {expanded &&
                  (isStatefulEntity(kind)
                    ? renderStateChildren(kind)
                    : renderEntityChildren(kind, kind))}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
