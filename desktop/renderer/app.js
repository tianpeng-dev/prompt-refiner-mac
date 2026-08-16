const bridge = window.refiner;

const promptBox = document.querySelector(".prompt-box");
const editor = document.querySelector("#editor");
const refreshText = document.querySelector("#refresh-text");
const actionButton = document.querySelector("#action-button");
const status = document.querySelector("#status");
const settingsPanel = document.querySelector("#settings-panel");
const settingsClose = document.querySelector("#settings-close");
const launchToggle = document.querySelector("#launch-toggle");
const shortcutClipboardToggle = document.querySelector("#shortcut-clipboard-toggle");
const shortcutRecorder = document.querySelector("#shortcut-recorder");
const shortcutLabel = document.querySelector("#shortcut-label");
const settingsStatus = document.querySelector("#settings-status");

const state = {
  busy: false,
  refreshing: false,
  undo: null,
  settingsOpen: false,
  capturingShortcut: false,
  platform: "darwin",
  settings: null,
  toastTimer: null,
};

function errorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error ?? "操作失败。");
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

function showToast(message, tone = "neutral", persistent = false) {
  if (state.toastTimer !== null) window.clearTimeout(state.toastTimer);
  status.textContent = message;
  status.dataset.tone = tone;
  status.hidden = false;
  state.toastTimer = persistent
    ? null
    : window.setTimeout(() => {
        status.hidden = true;
        state.toastTimer = null;
      }, 2_800);
}

function setMode(mode) {
  actionButton.dataset.mode = mode;
  const undoMode = mode === "undo";
  actionButton.setAttribute("aria-label", undoMode ? "撤销优化" : "优化输入内容");
  const submitShortcut = state.platform === "darwin" ? "⌘↩" : "Ctrl+Enter";
  actionButton.title = undoMode ? "撤销优化" : `优化输入内容（${submitShortcut}）`;
  updateControls();
}

function updateControls() {
  const undoMode = actionButton.dataset.mode === "undo";
  const locked = state.busy || state.refreshing;
  actionButton.disabled =
    locked || (undoMode ? state.undo === null : !editor.value.trim());
  editor.readOnly = locked;
  document.body.classList.toggle("is-busy", state.busy);
}

function syncRefreshScroll() {
  refreshText.style.transform = `translateY(-${editor.scrollTop}px)`;
}

function stopRefreshAnimation() {
  state.refreshing = false;
  promptBox.classList.remove("is-refreshing");
  refreshText.textContent = "";
  refreshText.style.transform = "";
  updateControls();
}

function startRefreshAnimation(value) {
  stopRefreshAnimation();
  refreshText.textContent = value;
  syncRefreshScroll();
  void refreshText.offsetWidth;
  state.refreshing = true;
  promptBox.classList.add("is-refreshing");
  updateControls();
}

function handleEditorInput() {
  if (state.refreshing) stopRefreshAnimation();
  if (!editor.value && actionButton.dataset.mode === "undo") {
    state.undo = null;
    setMode("optimize");
    return;
  }
  updateControls();
}

function setEditorValue(value) {
  if (state.refreshing) stopRefreshAnimation();
  editor.value = value;
  updateControls();
}

function applyOptimization(source, response, undoKind) {
  stopRefreshAnimation();
  state.undo = { kind: undoKind, text: source };
  setEditorValue(response.optimized);
  setMode("undo");
  showToast("优化完成", "ready");
  editor.focus();
  const end = editor.value.length;
  editor.setSelectionRange(end, end);
  editor.scrollTop = editor.scrollHeight;
}

async function optimizeEditor(overwriteClipboard = false) {
  const source = editor.value.trim();
  if (!source || state.busy || state.refreshing) return;
  state.busy = true;
  updateControls();
  showToast("正在优化…", "neutral", true);
  startRefreshAnimation(source);
  try {
    const response = await bridge.optimizer.optimize(source);
    if (overwriteClipboard) await bridge.clipboard.write(response.optimized);
    applyOptimization(
      source,
      response,
      overwriteClipboard ? "shortcut-clipboard" : "editor",
    );
    if (overwriteClipboard) {
      showToast("优化完成，已更新剪贴板", "ready");
    }
  } catch (error) {
    showToast(errorMessage(error), "error", true);
  } finally {
    stopRefreshAnimation();
    state.busy = false;
    updateControls();
  }
}

async function undoOptimization() {
  if (!state.undo || state.busy) return;
  const previous = state.undo;
  try {
    if (previous.kind === "clipboard") await bridge.clipboard.undo();
    if (previous.kind === "shortcut-clipboard") {
      await bridge.clipboard.write(previous.text);
    }
    state.undo = null;
    setEditorValue(previous.text);
    setMode("optimize");
    showToast("已撤销", "ready");
    editor.focus();
  } catch (error) {
    showToast(errorMessage(error), "error", true);
  }
}

function formatShortcut(value, platform = state.platform) {
  const parts = value.split("+");
  const key = parts.at(-1) ?? "";
  if (platform !== "darwin") {
    return [
      parts.includes("CommandOrControl") || parts.includes("Control")
        ? "Ctrl"
        : null,
      parts.includes("Alt") ? "Alt" : null,
      parts.includes("Shift") ? "Shift" : null,
      key,
    ]
      .filter(Boolean)
      .join("+");
  }
  const symbols = [
    ["Control", "⌃"],
    ["Alt", "⌥"],
    ["Shift", "⇧"],
    ["CommandOrControl", "⌘"],
  ]
    .filter(([modifier]) => parts.includes(modifier))
    .map(([, symbol]) => symbol)
    .join("");
  return `${symbols}${key}`;
}

function renderSettings(snapshot) {
  state.platform = snapshot.platform;
  state.settings = snapshot.settings;
  launchToggle.checked = snapshot.settings.launchAtLogin;
  shortcutClipboardToggle.checked = snapshot.settings.optimizeClipboardOnShortcut;
  shortcutLabel.textContent = formatShortcut(snapshot.settings.shortcut);
  shortcutRecorder.classList.toggle("shortcut-recorder--error", !snapshot.shortcutRegistered);
  settingsStatus.textContent = snapshot.shortcutError ?? "";
  settingsStatus.dataset.tone = snapshot.shortcutError ? "error" : "neutral";
  setMode(actionButton.dataset.mode);
}

function openSettings() {
  settingsPanel.hidden = false;
  state.settingsOpen = true;
  settingsClose.focus();
}

function closeSettings() {
  state.capturingShortcut = false;
  shortcutRecorder.classList.remove("is-recording");
  settingsPanel.hidden = true;
  state.settingsOpen = false;
  editor.focus();
}

function shortcutFromEvent(event) {
  const primaryPressed = state.platform === "darwin"
    ? event.metaKey
    : event.ctrlKey;
  const additionalPressed = state.platform === "darwin"
    ? event.altKey || event.ctrlKey || event.shiftKey
    : event.altKey || event.shiftKey;
  if (!primaryPressed || !additionalPressed) {
    throw new Error(
      state.platform === "darwin"
        ? "请使用 Command，并搭配 Option、Control 或 Shift。"
        : "请使用 Ctrl，并搭配 Alt 或 Shift。",
    );
  }
  let key = "";
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  if (/^F(?:[1-9]|1\d|20)$/.test(event.code)) key = event.code;
  if (!key) throw new Error("请再按一个字母、数字或功能键。");
  return [
    "CommandOrControl",
    state.platform === "darwin" && event.ctrlKey ? "Control" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    key,
  ]
    .filter(Boolean)
    .join("+");
}

async function captureShortcut(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    state.capturingShortcut = false;
    shortcutRecorder.classList.remove("is-recording");
    settingsStatus.textContent = "已取消录制。";
    return;
  }
  if (["Meta", "Alt", "Control", "Shift"].includes(event.key)) return;
  try {
    const candidate = shortcutFromEvent(event);
    const snapshot = await bridge.settings.update({ shortcut: candidate });
    renderSettings(snapshot);
    if (snapshot.settings.shortcut === candidate && snapshot.shortcutRegistered) {
      settingsStatus.textContent = `已更新为 ${formatShortcut(candidate)}`;
      settingsStatus.dataset.tone = "ready";
      state.capturingShortcut = false;
      shortcutRecorder.classList.remove("is-recording");
    }
  } catch (error) {
    settingsStatus.textContent = errorMessage(error);
    settingsStatus.dataset.tone = "error";
  }
}

editor.addEventListener("input", handleEditorInput);
editor.addEventListener("scroll", syncRefreshScroll);
actionButton.addEventListener("click", () => {
  if (actionButton.dataset.mode === "undo") void undoOptimization();
  else void optimizeEditor();
});
settingsClose.addEventListener("click", closeSettings);
shortcutRecorder.addEventListener("click", () => {
  state.capturingShortcut = true;
  shortcutRecorder.classList.add("is-recording");
  settingsStatus.textContent = "请按下新组合键，Escape 取消。";
});
launchToggle.addEventListener("change", async () => {
  launchToggle.disabled = true;
  try {
    renderSettings(
      await bridge.settings.update({ launchAtLogin: launchToggle.checked }),
    );
  } catch (error) {
    launchToggle.checked = state.settings?.launchAtLogin ?? true;
    settingsStatus.textContent = errorMessage(error);
    settingsStatus.dataset.tone = "error";
  } finally {
    launchToggle.disabled = false;
  }
});
shortcutClipboardToggle.addEventListener("change", async () => {
  shortcutClipboardToggle.disabled = true;
  try {
    renderSettings(
      await bridge.settings.update({
        optimizeClipboardOnShortcut: shortcutClipboardToggle.checked,
      }),
    );
  } catch (error) {
    shortcutClipboardToggle.checked =
      state.settings?.optimizeClipboardOnShortcut ?? false;
    settingsStatus.textContent = errorMessage(error);
    settingsStatus.dataset.tone = "error";
  } finally {
    shortcutClipboardToggle.disabled = false;
  }
});

window.addEventListener("keydown", (event) => {
  if (state.capturingShortcut) {
    void captureShortcut(event);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (state.settingsOpen) closeSettings();
    else void bridge.window.hide();
    return;
  }
  if (
    (state.platform === "darwin" ? event.metaKey : event.ctrlKey) &&
    event.key === "Enter" &&
    !state.settingsOpen &&
    actionButton.dataset.mode === "optimize"
  ) {
    event.preventDefault();
    void optimizeEditor();
  }
});

async function boot() {
  if (!bridge) {
    showToast("请从精炼台桌面应用打开。", "error", true);
    actionButton.disabled = true;
    editor.disabled = true;
    return;
  }

  updateControls();
  try {
    renderSettings(await bridge.settings.get());
  } catch (error) {
    showToast(errorMessage(error), "error", true);
  }

  void bridge.optimizer.health().then((health) => {
    if (!health.authenticated) {
      showToast("首次优化时会打开 Trae 登录", "neutral", true);
    } else if (!health.ok) {
      showToast("Trae 优化接口暂时不可用。", "error", true);
    }
  });

  bridge.window.onBlankRequested(() => {
    if (editor.value) {
      state.undo = { kind: "editor", text: editor.value };
      setMode("undo");
    } else {
      state.undo = null;
      setMode("optimize");
    }
    setEditorValue("");
    status.hidden = true;
    editor.focus();
  });
  bridge.window.onFocusEditor(() => {
    editor.focus();
    const end = editor.value.length;
    editor.setSelectionRange(end, end);
  });
  bridge.window.onClipboardOptimized((result) => {
    applyOptimization(result.source, result.response, "clipboard");
  });
  bridge.window.onClipboardRestored((result) => {
    if (!result?.restored) return;
    state.undo = null;
    setEditorValue(result.text ?? "");
    setMode("optimize");
    showToast("已撤销", "ready");
  });
  bridge.window.onOpenSettings(openSettings);
  bridge.window.onSettingsChanged(renderSettings);
  bridge.window.onShortcutOptimizeRequested((input) => {
    if (state.busy || state.refreshing) {
      showToast("正在处理另一项优化，请稍候。", "error", true);
      return;
    }
    if (state.settingsOpen) closeSettings();
    state.undo = null;
    setMode("optimize");
    setEditorValue(input);
    status.hidden = true;
    editor.focus();
    void optimizeEditor(true);
  });
  bridge.window.onAuthStatus((value) => {
    if (!value?.message) return;
    showToast(value.message, value.tone ?? "neutral", value.persistent ?? false);
  });
  bridge.window.onOperationError((message) => showToast(message, "error", true));
  editor.focus();
}

void boot();
