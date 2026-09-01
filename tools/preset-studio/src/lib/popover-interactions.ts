const POPOVER_LAYER_CONTENT_ATTRIBUTE = 'data-popover-layer-content';
const POPOVER_LAYER_TRIGGER_ATTRIBUTE = 'data-popover-layer-trigger';

interface PopoverLayer {
  id: string;
  close: () => void;
  dismissOnOutside?: boolean;
  parentLayerId?: string;
}

const openPopoverLayers: PopoverLayer[] = [];
let outsideListenerAttached = false;
let pendingInteractionTarget: EventTarget | null = null;
let pendingInteractionClearTimer: number | null = null;

export function isPopoverPortalInteraction(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        '[data-slot="popover-content"], [data-slot="select-content"]',
      ),
    )
  );
}

function isLayerElementInteraction(target: EventTarget | null, attribute: string, layerId: string): boolean {
  if (!(target instanceof Element)) return false;
  const layerElement = target.closest(`[${attribute}]`);
  return layerElement?.getAttribute(attribute) === layerId;
}

function triggerLayerIdForInteraction(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return (
    target.closest(`[${POPOVER_LAYER_TRIGGER_ATTRIBUTE}]`)?.getAttribute(POPOVER_LAYER_TRIGGER_ATTRIBUTE) ?? undefined
  );
}

function rememberInteractionTarget(target: EventTarget | null): void {
  pendingInteractionTarget = target;
  if (pendingInteractionClearTimer !== null) window.clearTimeout(pendingInteractionClearTimer);
  pendingInteractionClearTimer = window.setTimeout(() => {
    pendingInteractionTarget = null;
    pendingInteractionClearTimer = null;
  }, 100);
}

function parentLayerIdForInteraction(target: EventTarget | null): string | undefined {
  for (let index = openPopoverLayers.length - 1; index >= 0; index -= 1) {
    const layer = openPopoverLayers[index];
    if (isLayerElementInteraction(target, POPOVER_LAYER_CONTENT_ATTRIBUTE, layer.id)) return layer.id;
  }
  return undefined;
}

function parentLayerIdForTrigger(layerId: string): string | undefined {
  const trigger = Array.from(document.querySelectorAll(`[${POPOVER_LAYER_TRIGGER_ATTRIBUTE}]`)).find(
    (element) => element.getAttribute(POPOVER_LAYER_TRIGGER_ATTRIBUTE) === layerId,
  );
  return parentLayerIdForInteraction(trigger ?? null);
}

function parentLayerIdsForLayer(parentLayerId: string | undefined): Set<string> {
  const parentLayerIds = new Set<string>();
  let currentLayerId = parentLayerId;

  while (currentLayerId && !parentLayerIds.has(currentLayerId)) {
    parentLayerIds.add(currentLayerId);
    currentLayerId = openPopoverLayers.find((layer) => layer.id === currentLayerId)?.parentLayerId;
  }

  return parentLayerIds;
}

function isLayerDescendant(layerId: string, ancestorLayerId: string): boolean {
  let currentLayerId = openPopoverLayers.find((layer) => layer.id === layerId)?.parentLayerId;

  while (currentLayerId) {
    if (currentLayerId === ancestorLayerId) return true;
    currentLayerId = openPopoverLayers.find((layer) => layer.id === currentLayerId)?.parentLayerId;
  }

  return false;
}

export function isPopoverLayerInteraction(target: EventTarget | null, layerId: string): boolean {
  return (
    isLayerElementInteraction(target, POPOVER_LAYER_CONTENT_ATTRIBUTE, layerId) ||
    isLayerElementInteraction(target, POPOVER_LAYER_TRIGGER_ATTRIBUTE, layerId) ||
    (target instanceof Element && Boolean(target.closest('[data-slot="select-content"]')))
  );
}

function handleOutsidePointerDown(event: PointerEvent): void {
  rememberInteractionTarget(event.target);
  const topLayer = openPopoverLayers.at(-1);
  if (
    !topLayer ||
    topLayer.dismissOnOutside === false ||
    isPopoverLayerInteraction(event.target, topLayer.id)
  ) {
    return;
  }
  topLayer.close();
}

function attachOutsideListener(): void {
  if (outsideListenerAttached) return;
  document.addEventListener('pointerdown', handleOutsidePointerDown, true);
  outsideListenerAttached = true;
}

function detachOutsideListener(): void {
  if (!outsideListenerAttached || openPopoverLayers.length > 0) return;
  document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  outsideListenerAttached = false;
}

export function registerPopoverLayer(layer: PopoverLayer): () => void {
  const existingLayer = openPopoverLayers.find((entry) => entry.id === layer.id);
  const existingLayerIndex = openPopoverLayers.findIndex((entry) => entry.id === layer.id);
  const hasPendingInteraction = pendingInteractionTarget !== null;
  const pendingLayerId = triggerLayerIdForInteraction(pendingInteractionTarget);
  const consumesPendingInteraction =
    hasPendingInteraction && (pendingLayerId === undefined || pendingLayerId === layer.id);
  const interactionTarget =
    consumesPendingInteraction
      ? pendingInteractionTarget ?? document.activeElement
      : null;
  const parentLayerId =
    layer.parentLayerId ??
    parentLayerIdForTrigger(layer.id) ??
    parentLayerIdForInteraction(interactionTarget) ??
    existingLayer?.parentLayerId;
  const parentLayerIds = parentLayerIdsForLayer(parentLayerId);
  for (const existingLayer of openPopoverLayers) {
    if (
      existingLayer.id === layer.id ||
      parentLayerIds.has(existingLayer.id) ||
      isLayerDescendant(existingLayer.id, layer.id)
    ) {
      continue;
    }
    existingLayer.close();
  }
  if (consumesPendingInteraction) {
    pendingInteractionTarget = null;
    if (pendingInteractionClearTimer !== null) {
      window.clearTimeout(pendingInteractionClearTimer);
      pendingInteractionClearTimer = null;
    }
  }
  const registeredLayer = { ...layer, parentLayerId };
  if (existingLayerIndex >= 0) {
    openPopoverLayers.splice(existingLayerIndex, 1, registeredLayer);
  } else {
    const firstDescendantIndex = openPopoverLayers.findIndex((entry) => isLayerDescendant(entry.id, layer.id));
    if (firstDescendantIndex >= 0) openPopoverLayers.splice(firstDescendantIndex, 0, registeredLayer);
    else openPopoverLayers.push(registeredLayer);
  }
  attachOutsideListener();

  return () => {
    const layerIndex = openPopoverLayers.findIndex((entry) => entry === registeredLayer);
    if (layerIndex >= 0) openPopoverLayers.splice(layerIndex, 1);
    detachOutsideListener();
  };
}

export { POPOVER_LAYER_CONTENT_ATTRIBUTE, POPOVER_LAYER_TRIGGER_ATTRIBUTE };
