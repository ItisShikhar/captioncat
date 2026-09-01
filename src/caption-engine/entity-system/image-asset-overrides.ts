const imageAssetSourceOverrides = new Map<string, string>();

export function setImageAssetSourceOverrides(overrides: Readonly<Record<string, string>>): void {
  imageAssetSourceOverrides.clear();
  for (const [asset, source] of Object.entries(overrides)) {
    if (asset.trim().length > 0 && source.trim().length > 0) {
      imageAssetSourceOverrides.set(asset, source);
    }
  }
}

export function imageAssetSourceOverride(asset: string): string | undefined {
  return imageAssetSourceOverrides.get(asset);
}
