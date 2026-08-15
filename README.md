# 精炼台

精炼台是一款轻量的 macOS 菜单栏与 Windows 系统托盘提示词优化工具。输入一句自然语言需求，点击闪光图标即可调用 Trae 的提示词优化能力，结果会直接替换原文；再次点击同一位置即可撤销。

应用不需要安装或运行 TraeCode。首次优化时会在应用内打开 Trae 官方登录页面，登录成功后即可独立使用。

## 主要功能

- **极简托盘界面**：左键系统图标打开输入框，右键打开功能菜单。
- **原位优化与撤销**：优化结果直接替换输入内容，并保留一次内存撤销。
- **剪贴板优化**：可从右键菜单直接优化剪贴板，成功后覆盖原内容，失败时不修改。
- **全局快捷键**：macOS 默认使用 `⌥⌘P`，Windows 默认使用 `Ctrl+Alt+P`。
- **登录时启动**：可在右键菜单中开启或关闭。
- **无模型回退**：只调用 Trae `input_optimization / no_thinking_model`，不会转用 GPT、Codex CLI 或其他模型。
- **本地隐私保护**：不保存提示词和优化历史；登录令牌由系统 `safeStorage` 加密保存。

## 系统要求

- Apple Silicon Mac（M1、M2、M3、M4 或更新芯片）
- Windows 10/11 x64
- 可访问 Trae 中国版服务
- 有效的 Trae CN 账号和可用 Credits

当前版本不支持 Intel Mac 和 Windows ARM64。

## 下载安装

从 [Releases](https://github.com/tianpeng-dev/prompt-refiner-mac/releases/latest) 下载对应平台的安装包。

### macOS

1. 下载 macOS arm64 压缩包，解压后将“精炼台.app”移动到 `/Applications`。
2. 当前版本未进行 Apple 签名和公证。首次启动若被 macOS 拦截，请右键点击应用并选择“打开”。
3. 点击顶部菜单栏的闪光图标开始使用。

### Windows

1. 下载 `JingLianTai-1.1.0-win-x64.exe` 并运行安装程序。
2. 当前版本未进行 Windows 代码签名，Microsoft Defender SmartScreen 可能提示“Windows 已保护你的电脑”；确认来源后选择“更多信息”再运行。
3. 安装完成后，从开始菜单打开精炼台，应用会驻留在任务栏通知区域。

首次优化时完成一次 Trae 官方网页登录；以后会复用该电脑上加密保存的登录凭证。

登录状态不会打包在应用内，也不会随 `.app` 或 `.exe` 复制到其他电脑。每台新电脑首次使用时都需要登录一次，但不需要安装 TraeCode。

## 使用方式

### 优化输入内容

1. 左键点击系统图标；也可以在 macOS 按下 `⌥⌘P`，或在 Windows 按下 `Ctrl+Alt+P`。
2. 输入需要优化的提示词。
3. 点击右下角闪光图标；也可以在 macOS 按 `⌘↩`，或在 Windows 按 `Ctrl+Enter`。
4. 优化完成后，闪光图标会变成撤销图标。

### 右键菜单

右键点击菜单栏或任务栏通知区域中的精炼台图标可以：

- 打开精炼台
- 优化剪贴板
- 撤销上次剪贴板替换
- 设置登录时启动
- 修改全局快捷键
- 退出应用

## 隐私与安全

- Renderer 无权访问文件系统、Trae Token、任意网络地址或执行命令。
- Trae 登录窗口使用隔离的 Electron 会话。
- Token 只在 Electron 主进程内存中使用；macOS 使用钥匙串、Windows 使用 DPAPI 支撑的 `safeStorage` 加密保存。
- 普通提示词和优化结果不会写入磁盘；只有应用设置和加密登录令牌会被保存。
- Token 失效后，应用会再次打开 Trae 官方登录页面，不会回退到其他模型。

## 本地开发

需要 Node.js 24 和 pnpm 9。构建 macOS 图标还需要 Xcode Command Line Tools。

```bash
pnpm install
pnpm dev
```

## 测试与构建

```bash
pnpm test
pnpm build
pnpm pack:mac
pnpm pack:win
```

构建产物输出到：

```text
release/mac-arm64/精炼台.app
release/JingLianTai-1.1.0-win-x64.exe
```

## 技术说明与限制

- Electron 43 + TypeScript。
- 提供 macOS 菜单栏和 Windows 系统托盘应用，不包含 Web 服务或 HTTP API。
- Trae 的优化接口属于未公开的内部接口，Trae 修改登录流程、端点或协议后，应用可能需要同步更新。
- 每次优化可能消耗 Trae Credits。
- 当前 macOS 构建未签名、未公证，Windows 构建未进行代码签名；两者都不支持自动更新。
- 本项目为独立工具，与 Trae 官方无隶属或授权关系。
