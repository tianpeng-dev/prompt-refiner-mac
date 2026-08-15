import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  Tray,
} from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getTraeHealth } from "../src/trae-health.js";
import { TraeApiError } from "../src/trae-client.js";
import type { OptimizeResponse } from "../src/types.js";
import { validateInput } from "../src/validation.js";
import {
  calculateWindowPosition,
  createClipboardController,
  DEFAULT_SETTINGS,
  formatShortcut,
  normalizeSettings,
  validateShortcut,
} from "./logic.js";
import {
  TraeLoginRequiredError,
  TraeWebAuth,
} from "./trae-web-auth.js";
import {
  IPC_CHANNELS,
  RENDERER_EVENTS,
  type DesktopSettings,
  type SettingsSnapshot,
  type SettingsUpdate,
} from "./types.js";

const WINDOW_SIZE = { width: 440, height: 240 };
const SETTINGS_FILE = "settings.json";
const TRAE_TOKEN_FILE = "trae-token.enc";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayMenu: Menu | null = null;
let quitting = false;
let operationInProgress = false;
let settings = { ...DEFAULT_SETTINGS };
let settingsPath = "";
let registeredShortcut: string | null = null;
let shortcutError: string | null = null;
let optimizePrompt:
  | ((input: unknown, token: string) => Promise<OptimizeResponse>)
  | null = null;
let clipboardController: ReturnType<typeof createClipboardController> | null = null;
let traeAuth: TraeWebAuth | null = null;

function userMessage(error: unknown): string {
  if (
    error instanceof TraeApiError ||
    error instanceof TraeLoginRequiredError ||
    error instanceof TypeError ||
    error instanceof RangeError
  ) {
    return error.message;
  }
  if (error instanceof Error) {
    if (
      /^(?:请先登录 Trae|已取消 Trae 登录|无法打开 Trae 登录页|正在处理另一项优化)/.test(
        error.message,
      )
    ) {
      return error.message;
    }
  }
  return "操作未完成，请稍后重试。";
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: true }).show();
}

async function readSettings(): Promise<DesktopSettings> {
  try {
    return normalizeSettings(JSON.parse(await readFile(settingsPath, "utf8")));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(value: DesktopSettings): Promise<void> {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, settingsPath);
}

function applyLoginItem(): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    type: "mainAppService",
  });
}

function settingsSnapshot(): SettingsSnapshot {
  return {
    settings: { ...settings },
    shortcutRegistered: registeredShortcut === settings.shortcut,
    shortcutError,
  };
}

function sendRendererEvent(channel: string, payload?: unknown): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  const send = () => window.webContents.send(channel, payload);
  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

function windowPosition(): { x: number; y: number } {
  if (!tray) return { x: 24, y: 48 };
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  return calculateWindowPosition(trayBounds, display.workArea, WINDOW_SIZE);
}

function showWindow(blank = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setPosition(windowPosition().x, windowPosition().y, false);
  mainWindow.show();
  mainWindow.focus();
  if (blank) sendRendererEvent(RENDERER_EVENTS.blankRequested);
  sendRendererEvent(RENDERER_EVENTS.focusEditor);
}

function toggleWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function registerShortcut(shortcut: string): boolean {
  const registered = globalShortcut.register(shortcut, () => showWindow(true));
  if (registered) {
    registeredShortcut = shortcut;
    shortcutError = null;
  } else {
    shortcutError = `${formatShortcut(shortcut)} 已被其他应用占用。`;
  }
  return registered;
}

async function updateSettings(update: SettingsUpdate): Promise<SettingsSnapshot> {
  const next = { ...settings };
  if (typeof update.launchAtLogin === "boolean") {
    next.launchAtLogin = update.launchAtLogin;
  }

  if (update.shortcut !== undefined) {
    const candidate = validateShortcut(update.shortcut);
    if (candidate !== registeredShortcut) {
      if (!globalShortcut.register(candidate, () => showWindow(true))) {
        shortcutError = `${formatShortcut(candidate)} 已被其他应用占用，原快捷键仍然有效。`;
        return settingsSnapshot();
      }
      if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
      registeredShortcut = candidate;
    }
    next.shortcut = candidate;
    shortcutError = null;
  }

  settings = next;
  await saveSettings(settings);
  applyLoginItem();
  rebuildTrayMenu();
  const snapshot = settingsSnapshot();
  sendRendererEvent(RENDERER_EVENTS.settingsChanged, snapshot);
  return snapshot;
}

async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  if (operationInProgress) throw new Error("正在处理另一项优化，请稍候。");
  operationInProgress = true;
  try {
    return await operation();
  } finally {
    operationInProgress = false;
  }
}

async function optimizeWithWebAuth(input: unknown): Promise<OptimizeResponse> {
  if (!optimizePrompt || !traeAuth) throw new Error("应用尚未准备完成。");
  const validated = validateInput(input);
  let token = await traeAuth.getToken(true);
  try {
    return await optimizePrompt(validated, token);
  } catch (error) {
    if (!(error instanceof TraeApiError) || error.kind !== "auth") throw error;
    traeAuth.invalidate();
    token = await traeAuth.login(false);
    return optimizePrompt(validated, token);
  }
}

function loginFromTray(): void {
  if (!traeAuth) return;
  const force = traeAuth.authenticated;
  void traeAuth
    .login(force)
    .then(() => notify("精炼台", "Trae 登录成功。"))
    .catch((error) => notify("Trae 登录未完成", userMessage(error)));
}

async function optimizeClipboardWithFeedback() {
  if (!clipboardController) throw new Error("应用尚未准备完成。");
  try {
    const result = await runExclusive(() => clipboardController!.optimize());
    rebuildTrayMenu();
    notify("精炼台", "已优化并更新剪贴板。");
    return result;
  } catch (error) {
    const message = userMessage(error);
    notify("剪贴板未修改", message);
    throw new Error(message);
  }
}

function undoClipboard() {
  if (!clipboardController) return { restored: false };
  const result = clipboardController.undo();
  rebuildTrayMenu();
  if (result.restored) notify("精炼台", "已恢复优化前的剪贴板内容。");
  return result;
}

function optimizeClipboardFromTray(): void {
  void optimizeClipboardWithFeedback()
    .then((result) => {
      showWindow();
      sendRendererEvent(RENDERER_EVENTS.clipboardOptimized, result);
    })
    .catch((error) => {
      showWindow();
      sendRendererEvent(RENDERER_EVENTS.operationError, userMessage(error));
    });
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const template: MenuItemConstructorOptions[] = [
    { label: "打开精炼台", click: () => showWindow() },
    { label: "优化剪贴板", click: optimizeClipboardFromTray },
    {
      label: "撤销上次剪贴板替换",
      enabled: clipboardController?.canUndo() ?? false,
      click: () => {
        const result = undoClipboard();
        if (result.restored) {
          showWindow();
          sendRendererEvent(RENDERER_EVENTS.clipboardRestored, result);
        }
      },
    },
    { type: "separator" },
    {
      label: traeAuth?.authenticated ? "重新登录 Trae…" : "登录 Trae…",
      click: loginFromTray,
    },
    { type: "separator" },
    {
      label: "登录时启动",
      type: "checkbox",
      checked: settings.launchAtLogin,
      click: (item) => {
        void updateSettings({ launchAtLogin: item.checked }).catch((error) => {
          notify("设置未保存", userMessage(error));
        });
      },
    },
    {
      label: `快捷键设置…  ${formatShortcut(settings.shortcut)}`,
      click: () => {
        showWindow();
        sendRendererEvent(RENDERER_EVENTS.openSettings);
      },
    },
    { type: "separator" },
    {
      label: "退出精炼台",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ];
  trayMenu = Menu.buildFromTemplate(template);
}

function trayImage() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "tray-iconTemplate.png")
    : path.join(app.getAppPath(), "assets", "tray-iconTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);
  return image;
}

async function createWindow(): Promise<void> {
  const appRoot = app.getAppPath();
  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: "#1D1E21",
    webPreferences: {
      preload: path.join(appRoot, "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("blur", () => {
    if (!mainWindow?.webContents.isDevToolsOpened()) mainWindow?.hide();
  });
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  await mainWindow.loadFile(path.join(appRoot, "desktop", "renderer", "index.html"));
}

function createTray(): void {
  const image = trayImage();
  tray = new Tray(image);
  tray.setToolTip("精炼台");
  tray.on("click", toggleWindow);
  tray.on("right-click", () => {
    if (trayMenu) tray?.popUpContextMenu(trayMenu);
  });
  rebuildTrayMenu();
}

function setupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.optimizerHealth, () =>
    getTraeHealth(() => {
      if (!traeAuth) throw new TraeLoginRequiredError();
      return traeAuth.getToken(false);
    }),
  );
  ipcMain.handle(IPC_CHANNELS.optimizerOptimize, async (_event, input: unknown) => {
    try {
      return await runExclusive(() => optimizeWithWebAuth(input));
    } catch (error) {
      throw new Error(userMessage(error));
    }
  });
  ipcMain.handle(IPC_CHANNELS.clipboardOptimize, () =>
    optimizeClipboardWithFeedback(),
  );
  ipcMain.handle(IPC_CHANNELS.clipboardUndo, () => undoClipboard());
  ipcMain.handle(IPC_CHANNELS.clipboardWrite, (_event, value: unknown) => {
    if (typeof value !== "string" || value.length > 10_000) {
      throw new TypeError("复制内容无效。");
    }
    clipboard.writeText(value);
  });
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settingsSnapshot());
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, (_event, value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("设置内容无效。");
    }
    const update = value as SettingsUpdate;
    if (
      update.launchAtLogin !== undefined &&
      typeof update.launchAtLogin !== "boolean"
    ) {
      throw new TypeError("登录启动设置无效。");
    }
    return updateSettings(update);
  });
  ipcMain.handle(IPC_CHANNELS.windowHide, () => mainWindow?.hide());
}

async function initialize(): Promise<void> {
  process.env.PROMPT_REFINER_ROOT = app.getAppPath();
  settingsPath = path.join(app.getPath("userData"), SETTINGS_FILE);
  settings = await readSettings();
  await saveSettings(settings);

  const optimizerModule = await import("../src/trae-optimizer.js");
  optimizePrompt = optimizerModule.optimizePromptWithTrae;
  traeAuth = new TraeWebAuth({
    devTools: !app.isPackaged,
    tokenPath: path.join(app.getPath("userData"), TRAE_TOKEN_FILE),
    onLoginStarted: () => {
      sendRendererEvent(RENDERER_EVENTS.authStatus, {
        message: "请在 Trae 窗口完成登录",
        tone: "neutral",
        persistent: true,
      });
    },
    onLoginFinished: (authenticated) => {
      rebuildTrayMenu();
      showWindow();
      sendRendererEvent(RENDERER_EVENTS.authStatus, {
        message: authenticated ? "登录成功，继续优化…" : "Trae 登录已取消",
        tone: authenticated ? "ready" : "error",
        persistent: !authenticated,
      });
    },
  });
  clipboardController = createClipboardController({
    clipboard,
    optimize: (input) => optimizeWithWebAuth(input),
  });

  setupIpc();
  await createWindow();
  createTray();
  registerShortcut(settings.shortcut);
  applyLoginItem();
  rebuildTrayMenu();
  void traeAuth.warmup().then(() => rebuildTrayMenu());

  const wasOpenedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  if (!wasOpenedAtLogin) showWindow();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("activate", () => showWindow());
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => {
    // A menu-bar utility stays alive until the user chooses Quit.
  });
  app.whenReady().then(initialize).catch((error) => {
    notify("精炼台无法启动", userMessage(error));
    app.quit();
  });
}
