import type { OptimizeResponse } from "../src/types.js";
import type { TraeHealth } from "../src/trae-health.js";

export const IPC_CHANNELS = {
  optimizerHealth: "optimizer:health",
  optimizerOptimize: "optimizer:optimize",
  clipboardOptimize: "clipboard:optimize",
  clipboardUndo: "clipboard:undo",
  clipboardWrite: "clipboard:write",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  windowHide: "window:hide",
} as const;

export const RENDERER_EVENTS = {
  blankRequested: "window:blank-requested",
  focusEditor: "window:focus-editor",
  clipboardOptimized: "clipboard:optimized",
  clipboardRestored: "clipboard:restored",
  openSettings: "settings:open",
  settingsChanged: "settings:changed",
  shortcutOptimizeRequested: "shortcut:optimize-requested",
  authStatus: "auth:status",
  operationError: "operation:error",
} as const;

export type WindowPosition = {
  x: number;
  y: number;
};

export type DesktopSettings = {
  schemaVersion: 2;
  launchAtLogin: boolean;
  optimizeClipboardOnShortcut: boolean;
  shortcut: string;
  alwaysOnTop: boolean;
  windowPosition: WindowPosition | null;
};

export type DesktopPlatform = "darwin" | "win32" | "other";

export type SettingsUpdate = {
  launchAtLogin?: boolean;
  optimizeClipboardOnShortcut?: boolean;
  shortcut?: string;
  alwaysOnTop?: boolean;
};

export type SettingsSnapshot = {
  platform: DesktopPlatform;
  settings: DesktopSettings;
  shortcutRegistered: boolean;
  shortcutError: string | null;
};

export type ClipboardOptimizeResult = {
  source: string;
  response: OptimizeResponse;
};

export type ClipboardUndoResult = {
  restored: boolean;
  text?: string;
};

export type DesktopBridge = {
  optimizer: {
    health(): Promise<TraeHealth>;
    optimize(input: string): Promise<OptimizeResponse>;
  };
  clipboard: {
    optimize(): Promise<ClipboardOptimizeResult>;
    undo(): Promise<ClipboardUndoResult>;
    write(text: string): Promise<void>;
  };
  settings: {
    get(): Promise<SettingsSnapshot>;
    update(input: SettingsUpdate): Promise<SettingsSnapshot>;
  };
  window: {
    hide(): Promise<void>;
  };
};
