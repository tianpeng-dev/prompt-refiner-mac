import type { OptimizeResponse } from "../src/types.js";
import { validateInput } from "../src/validation.js";
import type {
  ClipboardOptimizeResult,
  ClipboardUndoResult,
  DesktopSettings,
} from "./types.js";

export const DEFAULT_SETTINGS: DesktopSettings = {
  schemaVersion: 1,
  launchAtLogin: true,
  shortcut: "Command+Alt+P",
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
  ["command", "Command"],
  ["cmd", "Command"],
  ["meta", "Command"],
  ["control", "Control"],
  ["ctrl", "Control"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"],
]);

const MODIFIER_ORDER = ["Command", "Control", "Alt", "Shift"];

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
  if (!modifiers.has("Command")) {
    throw new RangeError("快捷键必须包含 Command。");
  }
  if (!["Control", "Alt", "Shift"].some((item) => modifiers.has(item))) {
    throw new RangeError("请在 Command 之外再加入 Option、Control 或 Shift。");
  }

  return [
    ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    keys[0],
  ].join("+");
}

export function formatShortcut(value: string): string {
  const tokens = validateShortcut(value).split("+");
  const key = tokens.at(-1) ?? "";
  const symbols = [
    ["Control", "⌃"],
    ["Alt", "⌥"],
    ["Shift", "⇧"],
    ["Command", "⌘"],
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
  const x = clamp(
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
  const y = clamp(
    preferredY,
    workArea.y + gap,
    workArea.y + workArea.height - windowSize.height - gap,
  );
  return { x, y };
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
