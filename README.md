# 精炼台

精炼台是一款轻量的 macOS 菜单栏提示词优化工具。输入一句自然语言需求，点击闪光图标即可调用 Trae 的提示词优化能力，结果会直接替换原文；再次点击同一位置即可撤销。

应用不需要安装或运行 TraeCode。首次优化时会在应用内打开 Trae 官方登录页面，登录成功后即可独立使用。

## 主要功能

- **极简菜单栏界面**：左键菜单栏图标打开输入框，右键打开功能菜单。
- **原位优化与撤销**：优化结果直接替换输入内容，并保留一次内存撤销。
- **剪贴板优化**：可从右键菜单直接优化剪贴板，成功后覆盖原内容，失败时不修改。
- **全局快捷键**：默认使用 `⌥⌘P` 唤起输入框。
- **登录时启动**：可在右键菜单中开启或关闭。
- **无模型回退**：只调用 Trae `input_optimization / no_thinking_model`，不会转用 GPT、Codex CLI 或其他模型。
- **本地隐私保护**：不保存提示词和优化历史；登录令牌由 macOS 钥匙串支持的 `safeStorage` 加密保存。

## 系统要求

- Apple Silicon Mac（M1、M2、M3、M4 或更新芯片）
- 可访问 Trae 中国版服务
- 有效的 Trae CN 账号和可用 Credits

当前版本不支持 Intel Mac。

## 下载安装

1. 从 [Releases](https://github.com/tianpeng-dev/prompt-refiner-mac/releases/latest) 下载 `JingLianTai-v1.0.0-mac-arm64.zip`。
2. 解压后将“精炼台.app”移动到 `/Applications`。
3. 当前版本未进行 Apple 签名和公证。首次启动若被 macOS 拦截，请右键点击应用并选择“打开”。
4. 点击顶部菜单栏的闪光图标开始使用。
5. 首次优化时完成一次 Trae 官方网页登录；以后会复用该电脑上加密保存的登录凭证。

登录状态不会打包在应用内，也不会随 `.app` 复制到其他电脑。每台新电脑首次使用时都需要登录一次，但不需要安装 TraeCode。

## 使用方式

### 优化输入内容

1. 左键点击菜单栏图标，或按下 `⌥⌘P`。
2. 输入需要优化的提示词。
3. 点击右下角闪光图标，或按 `⌘↩`。
4. 优化完成后，闪光图标会变成撤销图标。

### 右键菜单

右键点击菜单栏图标可以：

- 打开精炼台
- 优化剪贴板
- 撤销上次剪贴板替换
- 设置登录时启动
- 修改全局快捷键
- 退出应用

## 隐私与安全

- Renderer 无权访问文件系统、Trae Token、任意网络地址或执行命令。
- Trae 登录窗口使用隔离的 Electron 会话。
- Token 只在 Electron 主进程内存中使用，并通过 macOS `safeStorage` 加密后以 `0600` 权限保存。
- 普通提示词和优化结果不会写入磁盘；只有应用设置和加密登录令牌会被保存。
- Token 失效后，应用会再次打开 Trae 官方登录页面，不会回退到其他模型。

## 本地开发

需要 Node.js 24、pnpm 9 和 Xcode Command Line Tools。

```bash
pnpm install
pnpm dev
```

## 测试与构建

```bash
pnpm test
pnpm build
pnpm pack:mac
```

Apple Silicon 应用输出到：

```text
release/mac-arm64/精炼台.app
```

## 技术说明与限制

- Electron 43 + TypeScript。
- 仅提供 macOS 菜单栏应用，不包含 Web 服务或 HTTP API。
- Trae 的优化接口属于未公开的内部接口，Trae 修改登录流程、端点或协议后，应用可能需要同步更新。
- 每次优化可能消耗 Trae Credits。
- 当前构建未签名、未公证，也不支持自动更新。
- 本项目为独立工具，与 Trae 官方无隶属或授权关系。

