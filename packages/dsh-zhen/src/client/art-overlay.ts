/** Browser-owned art and explicit preferences always win over Host defaults. */
export function overlayArt<Asset, Preferences extends { x: number; y: number; scale: number }>(localAssets: Record<string, Asset>, localPreferences: Preferences, savedPreferences: boolean, defaultAssets: Record<string, Asset>, focus?: { x: number; y: number; scale: number }): { assets: Record<string, Asset>; preferences: Preferences } {
  return { assets: { ...defaultAssets, ...localAssets }, preferences: focus && !savedPreferences && Object.keys(localAssets).length === 0 ? { ...localPreferences, ...focus } : localPreferences };
}
