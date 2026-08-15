import { BrowserWindow, safeStorage, session } from "electron";
import type { Session } from "electron";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkTraeBackend } from "../src/trae-client.js";
import {
  isTraeWebsiteUrl,
  parseTraeWebTokenResponse,
  TRAE_WEB_LOGIN_URL,
  TRAE_WEB_TOKEN_STORAGE_KEY,
  TRAE_WEB_TOKEN_URL,
} from "../src/trae-web-session.js";

const AUTH_PARTITION = "persist:trae-web-auth";
const LOGIN_POLL_MS = 1_200;

export class TraeLoginRequiredError extends Error {
  constructor(message = "请先登录 Trae。") {
    super(message);
    this.name = "TraeLoginRequiredError";
  }
}

type TraeWebAuthOptions = {
  onLoginStarted(): void;
  onLoginFinished(authenticated: boolean): void;
  devTools: boolean;
  tokenPath: string;
  validateToken?(token: string): Promise<boolean>;
};

export class TraeWebAuth {
  private readonly authSession: Session;
  private readonly validateToken: (token: string) => Promise<boolean>;
  private cachedToken: string | null = null;
  private storedTokenChecked = false;
  private loginTask: Promise<string> | null = null;
  private loginWindow: BrowserWindow | null = null;

  constructor(private readonly options: TraeWebAuthOptions) {
    this.authSession = session.fromPartition(AUTH_PARTITION, { cache: true });
    this.validateToken = options.validateToken ?? checkTraeBackend;
  }

  get authenticated(): boolean {
    return this.cachedToken !== null;
  }

  invalidate(): void {
    this.cachedToken = null;
    this.storedTokenChecked = true;
    void this.clearStoredToken();
  }

  async warmup(): Promise<boolean> {
    try {
      return Boolean(await this.getToken(false));
    } catch {
      return false;
    }
  }

  async getToken(interactive: boolean): Promise<string> {
    if (this.cachedToken) return this.cachedToken;

    if (!this.storedTokenChecked) {
      this.storedTokenChecked = true;
      const storedToken = await this.readStoredToken();
      if (storedToken && (await this.validateToken(storedToken))) {
        this.cachedToken = storedToken;
        return storedToken;
      }
      await this.clearStoredToken();
    }

    const sessionToken = await this.readSessionToken();
    if (sessionToken && (await this.validateToken(sessionToken))) {
      this.cachedToken = sessionToken;
      return sessionToken;
    }
    if (!interactive) throw new TraeLoginRequiredError();
    return this.login(false);
  }

  async login(force = false): Promise<string> {
    if (this.loginTask) return this.loginTask;
    if (force) {
      this.cachedToken = null;
      this.storedTokenChecked = true;
      await this.clearStoredToken();
      await this.authSession.clearStorageData({
        storages: ["cookies", "localstorage"],
      });
    } else if (this.cachedToken) {
      return this.cachedToken;
    }

    this.loginTask = this.runLogin();
    try {
      return await this.loginTask;
    } finally {
      this.loginTask = null;
    }
  }

  private async readSessionToken(): Promise<string | null> {
    let response: Response;
    try {
      response = await this.authSession.fetch(TRAE_WEB_TOKEN_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
      });
    } catch {
      return null;
    }
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) return null;
    return parseTraeWebTokenResponse(await response.json().catch(() => null));
  }

  private async readStoredToken(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const encrypted = Buffer.from(
        (await readFile(this.options.tokenPath, "utf8")).trim(),
        "base64",
      );
      return safeStorage.decryptString(encrypted).trim() || null;
    } catch {
      return null;
    }
  }

  private async storeToken(token: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统无法安全保存 Trae 登录状态。");
    }
    await mkdir(path.dirname(this.options.tokenPath), { recursive: true });
    const temporaryPath = `${this.options.tokenPath}.${process.pid}.tmp`;
    const encrypted = safeStorage.encryptString(token).toString("base64");
    await writeFile(temporaryPath, `${encrypted}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.options.tokenPath);
  }

  private async clearStoredToken(): Promise<void> {
    await unlink(this.options.tokenPath).catch(() => undefined);
  }

  private async readWindowToken(window: BrowserWindow): Promise<string | null> {
    if (window.isDestroyed() || !isTraeWebsiteUrl(window.webContents.getURL())) {
      return null;
    }
    const value: unknown = await window.webContents.executeJavaScript(
      `window.localStorage.getItem(${JSON.stringify(TRAE_WEB_TOKEN_STORAGE_KEY)})`,
      true,
    );
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private async clearWindowToken(window: BrowserWindow): Promise<void> {
    if (window.isDestroyed() || !isTraeWebsiteUrl(window.webContents.getURL())) {
      return;
    }
    await window.webContents
      .executeJavaScript(
        `window.localStorage.removeItem(${JSON.stringify(TRAE_WEB_TOKEN_STORAGE_KEY)})`,
        true,
      )
      .catch(() => undefined);
  }

  private runLogin(): Promise<string> {
    this.options.onLoginStarted();
    const window = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 560,
      show: false,
      title: "登录 Trae",
      backgroundColor: "#111827",
      autoHideMenuBar: true,
      alwaysOnTop: true,
      webPreferences: {
        session: this.authSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: this.options.devTools,
      },
    });
    this.loginWindow = window;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let checking = false;
      const cookieListener = () => void probe();
      const poll = setInterval(() => void probe(), LOGIN_POLL_MS);

      const cleanup = () => {
        clearInterval(poll);
        this.authSession.cookies.removeListener("changed", cookieListener);
        if (this.loginWindow === window) this.loginWindow = null;
      };

      const finish = async (token: string | null, error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (token) {
          try {
            await this.storeToken(token);
            this.cachedToken = token;
            await this.clearWindowToken(window);
            if (!window.isDestroyed()) window.destroy();
            this.options.onLoginFinished(true);
            resolve(token);
          } catch (storageError) {
            this.options.onLoginFinished(false);
            if (!window.isDestroyed()) window.destroy();
            reject(
              storageError instanceof Error
                ? storageError
                : new Error("无法安全保存 Trae 登录状态。"),
            );
          }
          return;
        }
        this.options.onLoginFinished(false);
        if (!window.isDestroyed()) window.destroy();
        reject(error ?? new TraeLoginRequiredError("已取消 Trae 登录。"));
      };

      const probe = async () => {
        if (settled || checking || window.isDestroyed()) return;
        checking = true;
        try {
          const token =
            (await this.readWindowToken(window).catch(() => null)) ??
            (await this.readSessionToken());
          if (token && (await this.validateToken(token))) {
            await finish(token);
          }
        } finally {
          checking = false;
        }
      };

      this.authSession.cookies.on("changed", cookieListener);
      window.once("ready-to-show", () => window.show());
      window.on("closed", () => {
        void finish(null, new TraeLoginRequiredError("已取消 Trae 登录。"));
      });
      window.webContents.on("did-finish-load", () => void probe());
      window.webContents.on("did-navigate", () => void probe());
      window.webContents.on("did-redirect-navigation", () => void probe());
      window.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith("https://")) event.preventDefault();
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void window.loadURL(url);
        return { action: "deny" };
      });

      void window.loadURL(TRAE_WEB_LOGIN_URL).catch((error: unknown) => {
        void finish(
          null,
          new Error(
            error instanceof Error
              ? `无法打开 Trae 登录页：${error.message}`
              : "无法打开 Trae 登录页。",
          ),
        );
      });
    });
  }
}
