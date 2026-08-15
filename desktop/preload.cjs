const { contextBridge, ipcRenderer } = require("electron");

const channels = {
  optimizerHealth: "optimizer:health",
  optimizerOptimize: "optimizer:optimize",
  clipboardOptimize: "clipboard:optimize",
  clipboardUndo: "clipboard:undo",
  clipboardWrite: "clipboard:write",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  windowHide: "window:hide",
};

const events = {
  blankRequested: "window:blank-requested",
  focusEditor: "window:focus-editor",
  clipboardOptimized: "clipboard:optimized",
  clipboardRestored: "clipboard:restored",
  openSettings: "settings:open",
  settingsChanged: "settings:changed",
  authStatus: "auth:status",
  operationError: "operation:error",
};

function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("refiner", {
  optimizer: {
    health: () => ipcRenderer.invoke(channels.optimizerHealth),
    optimize: (input) => ipcRenderer.invoke(channels.optimizerOptimize, input),
  },
  clipboard: {
    optimize: () => ipcRenderer.invoke(channels.clipboardOptimize),
    undo: () => ipcRenderer.invoke(channels.clipboardUndo),
    write: (text) => ipcRenderer.invoke(channels.clipboardWrite, text),
  },
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet),
    update: (input) => ipcRenderer.invoke(channels.settingsUpdate, input),
  },
  window: {
    hide: () => ipcRenderer.invoke(channels.windowHide),
    onBlankRequested: (callback) => subscribe(events.blankRequested, callback),
    onFocusEditor: (callback) => subscribe(events.focusEditor, callback),
    onClipboardOptimized: (callback) =>
      subscribe(events.clipboardOptimized, callback),
    onClipboardRestored: (callback) =>
      subscribe(events.clipboardRestored, callback),
    onOpenSettings: (callback) => subscribe(events.openSettings, callback),
    onSettingsChanged: (callback) =>
      subscribe(events.settingsChanged, callback),
    onAuthStatus: (callback) => subscribe(events.authStatus, callback),
    onOperationError: (callback) =>
      subscribe(events.operationError, callback),
  },
});
