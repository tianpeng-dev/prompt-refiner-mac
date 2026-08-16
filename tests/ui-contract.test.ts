import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../src/paths.js";

describe("compact menu-bar UI", () => {
  it("keeps the main surface to one editor and one optimize/undo button", async () => {
    const html = await readFile(
      path.join(PROJECT_ROOT, "desktop", "renderer", "index.html"),
      "utf8",
    );
    expect(html.match(/<textarea\b/g)).toHaveLength(1);
    expect(html).toContain('id="action-button"');
    expect(html).toContain('data-mode="optimize"');
    expect(html).not.toContain('id="clipboard-button"');
    expect(html).not.toContain('id="copy-button"');
    expect(html).not.toContain("CONSTRAINT RAIL");
  });

  it("uses less than half of the previous 480 by 680 window area", async () => {
    const source = await readFile(
      path.join(PROJECT_ROOT, "desktop", "main.ts"),
      "utf8",
    );
    expect(source).toContain("const WINDOW_SIZE = { width: 440, height: 240 }");
    expect((440 * 240) / (480 * 680)).toBeLessThan(0.5);
  });

  it("returns to optimize mode when the editor is cleared", async () => {
    const renderer = await readFile(
      path.join(PROJECT_ROOT, "desktop", "renderer", "app.js"),
      "utf8",
    );
    expect(renderer).toContain(
      'if (!editor.value && actionButton.dataset.mode === "undo")',
    );
    expect(renderer).toContain('editor.addEventListener("input", handleEditorInput)');
  });

  it("can optimize and replace clipboard text when the global shortcut setting is enabled", async () => {
    const [source, preload, html, renderer] = await Promise.all([
      readFile(path.join(PROJECT_ROOT, "desktop", "main.ts"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "preload.cjs"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "renderer", "index.html"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "renderer", "app.js"), "utf8"),
    ]);
    expect(html).toContain('id="shortcut-clipboard-toggle"');
    expect(source).toContain("settings.optimizeClipboardOnShortcut");
    expect(source).toContain("validateInput(clipboard.readText())");
    expect(source).toContain("RENDERER_EVENTS.shortcutOptimizeRequested");
    expect(preload).toContain("onShortcutOptimizeRequested");
    const shortcutHandler = renderer.slice(
      renderer.indexOf("bridge.window.onShortcutOptimizeRequested"),
      renderer.indexOf("bridge.window.onAuthStatus"),
    );
    expect(shortcutHandler).toContain("void optimizeEditor(true)");
    expect(renderer).toContain("await bridge.clipboard.write(response.optimized)");
    expect(renderer).toContain('previous.kind === "shortcut-clipboard"');
    expect(renderer).toContain("await bridge.clipboard.write(previous.text)");
  });

  it("places the caret at the end of an optimized result", async () => {
    const renderer = await readFile(
      path.join(PROJECT_ROOT, "desktop", "renderer", "app.js"),
      "utf8",
    );
    const applyOptimization = renderer.slice(
      renderer.indexOf("function applyOptimization"),
      renderer.indexOf("async function optimizeEditor"),
    );
    expect(applyOptimization).toContain("const end = editor.value.length");
    expect(applyOptimization).toContain("editor.setSelectionRange(end, end)");
    expect(applyOptimization).toContain("editor.scrollTop = editor.scrollHeight");
    expect(applyOptimization).not.toContain("editor.setSelectionRange(0, 0)");
  });

  it("shimmers the source text until optimization returns", async () => {
    const [html, styles, renderer] = await Promise.all([
      readFile(path.join(PROJECT_ROOT, "desktop", "renderer", "index.html"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "renderer", "styles.css"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "renderer", "app.js"), "utf8"),
    ]);

    expect(html).toContain('class="refresh-layer" aria-hidden="true"');
    expect(html).toContain('id="refresh-text"');
    expect(styles).toContain("background-clip: text");
    expect(styles).toContain("@keyframes prompt-refresh");
    expect(styles).toContain("animation: prompt-refresh 1.15s linear infinite");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    const start = renderer.indexOf("startRefreshAnimation(source)");
    const request = renderer.indexOf("await bridge.optimizer.optimize(source)");
    const applyOptimization = renderer.slice(
      renderer.indexOf("function applyOptimization"),
      renderer.indexOf("async function optimizeEditor"),
    );
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(request);
    expect(applyOptimization.indexOf("stopRefreshAnimation()")).toBeLessThan(
      applyOptimization.indexOf("setEditorValue(response.optimized)"),
    );
    expect(renderer).not.toContain("startRefreshAnimation(response.optimized)");
  });

  it("uses a transparent icon-only tray entry and separates mouse actions", async () => {
    const [source, preload, renderer, icon, iconBuilder] = await Promise.all([
      readFile(path.join(PROJECT_ROOT, "desktop", "main.ts"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "preload.cjs"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "desktop", "renderer", "app.js"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "assets", "tray-icon.svg"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "scripts", "build-icons.sh"), "utf8"),
    ]);

    expect(source).toContain('tray.on("click", toggleWindow)');
    expect(source).toContain('tray.on("right-click"');
    expect(source).toContain("popUpContextMenu(trayMenu)");
    expect(source).not.toContain("tray.setContextMenu(");
    expect(source).not.toContain("tray.setTitle(");
    expect(preload).toContain("onFocusEditor");
    expect(renderer).toContain("bridge.window.onFocusEditor");
    expect(icon.match(/<path\b/g)).toHaveLength(2);
    expect(icon).not.toContain("<rect");
    expect(iconBuilder).toContain(
      '-s format png "$project_root/assets/tray-icon.svg"',
    );
    expect(iconBuilder).not.toContain("tray_source=");
  });

  it("uses an isolated Trae web session without reading TraeCode storage", async () => {
    const [authSource, sessionSource, optimizerSource, healthSource] = await Promise.all([
      readFile(path.join(PROJECT_ROOT, "desktop", "trae-web-auth.ts"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "src", "trae-web-session.ts"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "src", "trae-optimizer.ts"), "utf8"),
      readFile(path.join(PROJECT_ROOT, "src", "trae-health.ts"), "utf8"),
    ]);
    const combined = `${authSource}\n${sessionSource}\n${optimizerSource}\n${healthSource}`;

    expect(authSource).toContain('"persist:trae-web-auth"');
    expect(authSource).toContain("safeStorage.encryptString");
    expect(authSource).toContain("mode: 0o600");
    expect(sessionSource).toContain("GetUserToken");
    expect(authSource).toContain("clearWindowToken");
    expect(combined).not.toContain("Application Support");
    expect(combined).not.toContain("readTraeAuthToken");
  });
});
