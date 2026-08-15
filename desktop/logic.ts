import type { OptimizeResponse } from "../src/types.js";
import { validateInput } from "../src/validation.js";
import type {
  ClipboardOptimizeResult,
  ClipboardUndoResult,
  DesktopPlatform,
  DesktopSettings,
} from "./types.js";

export const DEFAULT_SETTINGS: DesktopSettings = {
  schemaVersion: 1,
  launchAtLogin: true,
  shortcut: "CommandOrControl+Alt+P",
};

type Rectangle = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSettings(value: unknown): DesktopSettings {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return { ...DEFAULT_SETTINGS };
  }
  let shortcut = DEFAULT_SETTINGS.shortcut;
  try {
    shortcut = validateShortcut(value.shortcut);
  } catch {
    // Invalid persisted shortcuts fall back to a known-safe default.
  }
  return {
    schemaVersion: 1,
    launchAtLogin:
      typeof value.launchAtLogin === "boolean"
        ? value.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    shortcut,
  };
}

const MODIFIER_ALIASES = new Map([
  ["commandorcontrol", "CommandOrControl"],
  ["cmdorctrl", "CommandOrControl"],
  ["command", "CommandOrControl"],
  ["cmd", "CommandOrControl"],
  ["meta", "CommandOrControl"],
  ["control", "Control"],
  ["ctrl", "Control"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"],
]);

const MODIFIER_ORDER = ["CommandOrControl", "Control", "Alt", "Shift"];

export function validateShortcut(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("快捷键必须是字符串。");
  }
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  const keys: string[] = [];

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES.get(part.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
    } else {
      keys.push(part.toUpperCase());
    }
  }

  if (keys.length !== 1 || !/^(?:[A-Z0-9]|F(?:[1-9]|1\d|20))$/.test(keys[0]!)) {
    throw new RangeError("快捷键需要且只能包含一个字母、数字或功能键。");
  }
  const primaryModifier = modifiers.has("CommandOrControl")
    ? "CommandOrControl"
    : modifiers.has("Control")
      ? "Control"
      : null;
  if (!primaryModifier) {
    throw new RangeError("快捷键必须包含 Command 或 Ctrl。");
  }
  const additionalModifiers = primaryModifier === "CommandOrControl"
    ? ["Control", "Alt", "Shift"]
    : ["Alt", "Shift"];
  if (!additionalModifiers.some((item) => modifiers.has(item))) {
    throw new RangeError("请再加入 Alt、Control 或 Shift。");
  }

  return [
    ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    keys[0],
  ].join("+");
}

export function formatShortcut(
  value: string,
  platform: DesktopPlatform = "darwin",
): string {
  const tokens = validateShortcut(value).split("+");
  const key = tokens.at(-1) ?? "";
  if (platform !== "darwin") {
    const labels = [
      tokens.includes("CommandOrControl") || tokens.includes("Control")
        ? "Ctrl"
        : null,
      tokens.includes("Alt") ? "Alt" : null,
      tokens.includes("Shift") ? "Shift" : null,
      key,
    ].filter(Boolean);
    return labels.join("+");
  }
  const symbols = [
    ["Control", "⌃"],
    ["Alt", "⌥"],
    ["Shift", "⇧"],
    ["CommandOrControl", "⌘"],
  ]
    .filter(([modifier]) => tokens.includes(modifier))
    .map(([, symbol]) => symbol)
    .join("");
  return `${symbols}${key}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function calculateWindowPosition(
  trayBounds: Rectangle,
  workArea: Rectangle,
  windowSize: Size,
  gap = 8,
): { x: number; y: number } {
  const centeredX = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowSize.width / 2,
  );
  const centeredY = Math.round(
    trayBounds.y + trayBounds.height / 2 - windowSize.height / 2,
  );
  let x = clamp(
    centeredX,
    workArea.x + gap,
    workArea.x + workArea.width - windowSize.width - gap,
  );

  const belowTray = trayBounds.y + trayBounds.height + gap;
  const aboveTray = trayBounds.y - windowSize.height - gap;
  const preferredY =
    belowTray + windowSize.height <= workArea.y + workArea.height
      ? belowTray
      : aboveTray;
  let y = clamp(
    preferredY,
    workArea.y + gap,
    workArea.y + workArea.height - windowSize.height - gap,
  );

  if (trayBounds.x >= workArea.x + workArea.width) {
    x = workArea.x + workArea.width - windowSize.width - gap;
    y = clamp(
      centeredY,
      workArea.y + gap,
      workArea.y + workArea.height - windowSize.height - gap,
    );
  } else if (trayBounds.x + trayBounds.width <= workArea.x) {
    x = workArea.x + gap;
    y = clamp(
      centeredY,
      workArea.y + gap,
      workArea.y + workArea.height - windowSize.height - gap,
    );
  }
  return { x, y };
}

export function desktopPlatform(value: NodeJS.Platform): DesktopPlatform {
  if (value === "darwin" || value === "win32") return value;
  return "other";
}

export function loginItemSettings(
  platform: DesktopPlatform,
  launchAtLogin: boolean,
  executablePath: string,
) {
  if (platform === "darwin") {
    return { openAtLogin: launchAtLogin, type: "mainAppService" as const };
  }
  return {
    openAtLogin: launchAtLogin,
    path: executablePath,
    args: ["--hidden"],
    enabled: launchAtLogin,
    name: "精炼台",
  };
}

export function trayIconName(platform: DesktopPlatform): string {
  return platform === "darwin"
    ? "tray-iconTemplate.png"
    : "tray-icon-win.png";
}

export function shouldShowWindowAtStartup(
  platform: DesktopPlatform,
  argv: string[],
  wasOpenedAtLogin: boolean,
): boolean {
  if (platform === "win32") return !argv.includes("--hidden");
  if (platform === "darwin") return !wasOpenedAtLogin;
  return true;
}

export type ClipboardAdapter = {
  readText(): string;
  writeText(value: string): void;
};

export function createClipboardController(dependencies: {
  clipboard: ClipboardAdapter;
  optimize(input: string): Promise<OptimizeResponse>;
}) {
  let undoText: string | null = null;

  return {
    async optimize(): Promise<ClipboardOptimizeResult> {
      const source = validateInput(dependencies.clipboard.readText());
      const response = await dependencies.optimize(source);
      dependencies.clipboard.writeText(response.optimized);
      undoText = source;
      return { source, response };
    },
    undo(): ClipboardUndoResult {
      if (undoText === null) return { restored: false };
      const text = undoText;
      dependencies.clipboard.writeText(text);
      undoText = null;
      return { restored: true, text };
    },
    canUndo(): boolean {
      return undoText !== null;
    },
  };
}
