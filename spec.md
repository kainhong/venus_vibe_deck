# Vibe Coding: 移动端 AI 编程 HUD 系统设计文档

## 1. 产品概述 (Product Vision)

### 1.1 核心理念

本项目旨在打造一个“免键盘、纯语音+热键”的移动端 Web HUD（平视显示器），作为运行在服务器端的 AI 命令行 Agent（如 Claude Code）的物理控制面板。
通过将终端渲染与输入层分离，彻底解决移动端编程时“虚拟键盘遮挡屏幕、操作交互繁琐”的痛点，实现基于“直觉语音”与“盲操热键”的 Vibe Coding（氛围感编程）体验。

### 1.2 核心用户场景

开发者将复杂环境（代码库、AI Agent、MCP 守护进程）部署在云服务器或局域网开发机上。在办公桌前或移动场景下，将手机/iPad 作为独立的“数字调音台”，通过语音下发重构指令，通过大颗粒物理热键处理 AI 抛出的多选菜单、确认请求和错误打断。

---

## 2. 系统架构设计 (System Architecture)

系统采用 **B/S 架构 + WebSocket 双向实时通信 + PTY 虚拟终端**的模式。

* **客户端 (Mobile Web)**：负责全屏 UI 呈现、ANSI 终端流渲染、触摸事件捕获及语音音频流采集。
* **通信层 (WebSocket)**：维持低延迟的持久长连接，双向透传终端标准输出 (stdout) 和控制指令 (stdin)。
* **服务端 (Node.js/Python)**：负责 WebSocket 连接管理、管理 PTY (伪终端) 生命周期，并作为本地 AI Agent 的宿主。

---

## 3. 功能模块详细说明 (Functional Specifications)

### 3.1 前端 UI 与渲染层 (Frontend)

前端页面需针对移动端浏览器进行全屏优化（禁用缩放、隐藏地址栏）。

* **布局规范**：
* **顶部 (10%)**：状态栏与 Session 切换下拉菜单（展示当前连接状态、网络延迟）。
* **中部 (60%)**：只读终端渲染区。采用 `xterm.js` 引擎，字号设置偏大（适配移动端阅读），高对比度深色主题。
* **底部 (30%)**：控制面板区。包含巨大的语音麦克风按钮，以及围绕其分布的快捷控制热键。


* **终端渲染逻辑**：
* 前端 `xterm.js` 仅作为“显示器”。不处理任何本地键盘输入事件。
* 直接接收来自后端的 ANSI 转义序列数据流并进行渲染，确保 AI CLI 工具中的高亮、彩色文本、多选框 UI 完美还原。



### 3.2 输入控制层 (Input Controls & Key Mapping)

底部热键区摒弃标准键盘，仅保留高频交互键，点击事件直接映射为原始控制字符。

| 按钮标识 / UI | 触发事件 / 动作描述 | WebSocket 发送的虚拟键码 (Payload) |
| --- | --- | --- |
| **[ ⬆️ 上移 ]** | 多选菜单光标上移 | `"\x1b[A"` |
| **[ ⬇️ 下移 ]** | 多选菜单光标下移 | `"\x1b[B"` |
| **[ 🟩 选择/取消 ]** | 多选菜单中的状态切换 | `" "` (单个空格) |
| **[ 🛑 中断/拒绝 ]** | 强制终止当前任务 | `"\x03"` (Ctrl+C) |
| **[ 🚀 确认/执行 ]** | 确认当前选项并提交 | `"\r"` (回车) |

### 3.3 语音识别模块 (Voice Input)

支持用户通过语音下发自然语言指令。

* **交互方式**：支持长按录音(移动端优先)和点击开始/再次点击结束。
* **实现路径**：
1. 第一阶段调用浏览器原生 `Web Speech API` 快速验证体验。
2. 后续技术探索包括 OpenAI 协议兼容后端 provider、前端 WASM/WebGPU 本地识别模型。


* **发送模式**：支持“只插入文本”和“插入文本后追加 `\r` 执行”两种模式,默认只插入文本。
* **返回结构**：语音识别 provider 统一返回 `{ "message": "...", "type": "text" }` 或 `{ "message": "...", "type": "command" }`;第一阶段只启用 `text`。

### 3.4 后端 PTY 守护服务 (Backend Daemon)

后端是连接 Web 界面与底层操作系统的桥梁。

* **进程挂载**：使用 `node-pty` (Node.js) 或 `pty` (Python) 衍生出真实的 TTY 进程（如启动 `claude code`），并劫持其标准输入输出。
* **多 Session 管理**：
* 支持后台同时运行多个 PTY 进程。
* 内存中维护 `SessionID -> PTY Instance` 的映射字典。
* 客户端断线重连时，根据 SessionID 重新绑定输出流，确保任务不中断。



---

## 4. 数据通信协议 (WebSocket API)

前后端采用 JSON 格式进行数据交换。

### 4.1 客户端 -> 服务端 (Client to Server)

**控制/文本输入请求**

```json
{
  "action": "input",
  "sessionId": "session_101",
  "data": "\x1b[A"  // 发送的具体键码或语音转写的文本
}

```

**系统控制请求 (切换/创建 Session)**

```json
{
  "action": "system",
  "command": "switch_session",
  "targetSessionId": "session_102"
}

```

### 4.2 服务端 -> 客户端 (Server to Client)

**终端数据推送 (高频)**

```json
{
  "type": "terminal_out",
  "sessionId": "session_101",
  "data": "[1;32m> Thinking...[0m\r\n" // 包含 ANSI 编码的原始字符串
}

```

---

## 5. 核心交互工作流 (Core Workflows)

### 5.1 复杂多选菜单交互流 (CLI Interactive Prompt)

1. **AI 输出**：Claude Code 需要用户选择要提交的文件，向 stdout 输出带有 ANSI 样式（反色、隐藏光标）的多选列表。
2. **前端渲染**：后端将字节流推给前端，`xterm.js` 渲染出多选界面，当前选中项高亮。
3. **用户操作**：用户点击 HUD 上的 `[ ⬇️ 下移 ]` 按钮。
4. **指令下发**：前端拦截点击，发送 `{ "action": "input", "data": "\x1b[B" }`。
5. **后端透传**：服务端将 `\x1b[B` 写入 PTY 进程。
6. **状态更新**：CLI 程序收到下移指令，重新绘制高亮行并输出新的 ANSI 字符，前端随之刷新，完成闭环。

---

## 6. 技术栈建议 (Tech Stack Recommendation)

* **前端**：Vue 3 或 React (保证组件化与状态管理) + `xterm.js` (含 `xterm-addon-fit` 插件自适应屏幕大小)。
* **后端**：Node.js + `Express` (静态服务) + `ws` (WebSocket) + `node-pty`。
* **部署环境**：Linux / macOS (提供原生的伪终端支持)，使用 PM2 守护后端进程。

---

## 7. 实施路径划分 (Milestones)

* **Phase 1: 核心链路打通 (MVP)**
* 搭建 Node.js WebSocket 服务与 `node-pty` 集成。
* 完成移动端 Web 页面基础布局，集成 `xterm.js` 并跑通数据的双向收发。
* 硬编码映射底部 5 个核心控制按钮。


* **Phase 2: 语音与体验优化**
* 接入 `Web Speech API` 实现长按和点击切换语音输入。
* 解决移动端软键盘防拉起、iOS Safari 音频权限与全屏兼容性问题。


* **Phase 3: 多开与工程化**
* 实现后端的多 Session 状态机，前端支持列表切换。
* 增加语音指令的意图拦截（如识别到“选第二个”，自动转换为发送向下的虚拟键码）。
