/** Browser-owned art and explicit preferences always win over Host defaults. */
export declare function overlayArt<Asset, Preferences extends {
    x: number;
    y: number;
    scale: number;
}>(localAssets: Record<string, Asset>, localPreferences: Preferences, savedPreferences: boolean, defaultAssets: Record<string, Asset>, focus?: {
    x: number;
    y: number;
    scale: number;
}): {
    assets: Record<string, Asset>;
    preferences: Preferences;
};
