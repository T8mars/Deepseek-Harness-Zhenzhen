import { discoverCanvasInstalls } from './canvas-discovery.ts';
import type { CanvasSetupDiscovery } from './canvas-setup-schema.ts';
export declare const canvasDesktopQuery = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process -Filter \"Name='T8-PenguinCanvas.exe'\" | Where-Object { $_.ExecutablePath } | Select-Object -ExpandProperty ExecutablePath -Unique | Select-Object -First 16) | ConvertTo-Json -Compress";
export declare function readCanvasDesktopPaths(): Promise<string[]>;
/** Separate from the legacy inert managed inventory: reads only OS executable paths and CLI metadata. */
export declare function discoverCanvasSetup(options?: {
    desktopPaths?: () => Promise<string[]>;
    managed?: Parameters<typeof discoverCanvasInstalls>[0];
}): Promise<CanvasSetupDiscovery>;
