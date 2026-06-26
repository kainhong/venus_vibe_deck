# Venus Vibe Deck 使用说明

本文介绍如何启动 Venus Vibe Deck，以及如何使用移动端终端、会话、语音和快捷控制功能。

## 1. 启动服务

安装依赖：

```bash
npm install
```

构建并启动：

```bash
npm run build
npm run start
```

也可以使用辅助脚本：

```bash
./start.sh
./start.sh status
./start.sh log
./start.sh stop
```

在手机上打开：

```text
http://<服务器局域网 IP>:8001
```

服务端在同一个 host/port 上托管 Web 页面和 WebSocket。

## 2. 基础配置

从 `.env.example` 创建 `.env`。

常用配置：

```env
HOST=0.0.0.0
PORT=8001
PTY_COMMAND=bash
PTY_ARGS=
SCROLLBACK_BYTES=51200
VENUS_DATA_DIR=
```

如果不设置 `VENUS_DATA_DIR`，运行时数据默认保存到：

```text
~/.venus-vibe-deck
```

如果需要手机从局域网访问，请使用 `HOST=0.0.0.0`。

## 3. 配置 CLI

打开 **更多 → 设置**。

每条 CLI 配置包含：

| 字段 | 说明 | 示例 |
|---|---|---|
| 名称 | 显示名 | `Claude` |
| 命令 | 可执行命令 | `claude` |
| 启动参数 | CLI 启动参数 | `--dangerously-skip-permissions` |
| 继续参数 | CLI 恢复/继续参数 | `-c` |
| 默认 | 新建会话时默认选中 | 开启 |

示例：

```text
名称: Claude
命令: claude
启动参数: --dangerously-skip-permissions
继续参数: -c
```

```text
名称: Bash
命令: bash
启动参数:
继续参数:
```

设置由服务端持久化，同一服务下多设备共享。

## 4. 新建会话

点击头部 **+** 按钮。

1. 选择 CLI 配置。
2. 选择或输入 workspace 路径。
3. 如果 CLI 配置了继续参数，可以勾选继续。
4. 点击 **创建**。

服务端会以所选 workspace 作为 `cwd` 启动 PTY 进程。

## 5. 切换、关闭和重连会话

头部下拉框展示当前仍然存活的 PTY 会话。

- 选择会话即可切换连接。
- 点击 **×** 关闭当前会话。
- 页面重连后会向服务端请求现有 session，并尽量恢复绑定。

关闭 PTY 会话会终止对应的运行进程。

## 6. 历史会话

点击头部 **历史** 按钮。

历史记录保存在浏览器 `localStorage`。同一个 CLI 类型和 workspace 组合只保留一条。

每条记录包含：

- CLI 配置 id 和显示名
- 命令和启动参数
- 继续参数
- workspace 路径
- 最新使用时间
- 如果存在，关联当前在线 sessionId

列表按最新使用时间倒序排列。

点击历史项：

- 如果关联的 session 仍在线，直接切换过去。
- 如果不在线，会按保存的 CLI 和 workspace 新建 session；存在继续参数时默认启用继续。

点击回收/删除图标：

- 如果关联 session 仍在线，会先关闭 session。
- 然后从 `localStorage` 删除该历史项。

## 7. 终端控制面板

底部控制区面向触控操作 AI CLI。

主操作：

| 控件 | 动作 |
|---|---|
| `@` | 输入 `@` |
| `/` | 输入 `/` |
| 上 | 方向上 |
| 下 | 方向下 |
| 空格 | 输入空格 |
| Esc | 发送 Esc |
| 语音 | 开始或结束语音输入 |
| 退格 | 删除/退格 |
| 回车 | 发送回车 |

长按菜单：

| 控件 | 长按弹出 |
|---|---|
| 上 | 左、Home |
| 下 | 右、End |
| 空格 | Tab |
| 退格 | 清除当前行 |

更多面板：

- 粘贴
- 开启/关闭终端键盘
- 进入沉浸模式

## 8. 终端键盘

键盘开关控制点击 terminal 时是否允许唤起移动端软键盘。

- 关闭键盘：适合纯触控操作。
- 开启键盘：需要手动输入时使用。

设置页和 workspace 输入框始终允许键盘输入。

## 9. 语音输入

语音输入有两种路径：

1. **浏览器原生语音**：使用浏览器 Web Speech API。
2. **服务端语音**：浏览器录音后发送到 Node server，由 server 调 ASR。

启用服务端语音：

```env
VOICE_USE_SERVER=true
VOICE_ASR_PROVIDER=cloud
```

云端 ASR 需要：

```env
VOICE_ASR_BASE_URL=wss://dashscope.aliyuncs.com/compatible-mode/v1/realtime
VOICE_ASR_API_KEY=sk-xxx
VOICE_ASR_MODEL=qwen3-asr-flash-realtime
```

本地 ASR 需要 `stt-server`：

```env
VOICE_ASR_PROVIDER=local
VOICE_LOCAL_ASR_URL=http://127.0.0.1:7000
```

更多说明：

- [语音识别配置](../stt.md)
- [语音输入说明](../voice-input.md)

## 10. 沉浸模式

打开 **更多 → 沉浸 Vibe**。

沉浸模式中：

- terminal 全屏显示。
- 长按开始语音输入。
- 点击待提交语音位置可提交文本。
- 从待提交位置移开可取消并清除当前输入行。
- 点击关闭按钮退出沉浸模式。

## 11. Workspace 选择

新建会话时可以：

- 手动输入路径。
- 从最近 workspace 中选择。
- 通过目录浏览器选择服务端目录。

目录浏览受服务端允许根目录限制。

配置允许根：

```env
VENUS_DIR_ROOTS=/home/me/projects,/srv/workspaces
```

## 12. Web Push 通知

Web Push 可在 Agent 需要关注时通知移动设备。

说明见：

- [Web Push 通知](../web-push-notifications.md)

## 13. 常见问题

### 手机页面无法连接

- 确认服务端正在运行。
- 手机访问时不要使用 `localhost`，应使用服务器局域网 IP。
- 检查防火墙是否放行端口。
- 局域网访问请设置 `HOST=0.0.0.0`。

### 新建会话按钮变灰

WebSocket 未连接。刷新页面或查看服务端日志。

```bash
./start.sh log
```

### 服务端语音失败

- 检查 `VOICE_USE_SERVER=true`。
- 云端 ASR 检查 `VOICE_ASR_API_KEY`。
- 本地 ASR 检查 `stt-server` 是否运行。
- 确认 `VOICE_ASR_SAMPLE_RATE=16000`。

### 重连后终端输出不完整

增大 scrollback：

```env
SCROLLBACK_BYTES=200000
```

然后重启服务。

### 移动端弹出键盘或默认菜单

使用键盘开关控制 terminal 是否唤起软键盘。控制面板按钮已尽量屏蔽系统长按菜单。
