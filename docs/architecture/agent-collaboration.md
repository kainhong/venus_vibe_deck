# Agent 协同 Workspace Daemon

状态：探索中

本文记录 Venus 多 Agent 协同方向的阶段性想法，并以 Orca 的设计作为参考。

## 背景

Venus 当前已经可以通过 PTY session 管理多个 CLI Agent（`claude`、`codex`、`opencode`），并支持 workspace 选择、git worktree 创建和 CLI hooks。下一步探索方向是 workspace 级协同：当一个 workspace 下存在主 Agent 和多个运行在不同 worktree 中的 worker Agent 时，Venus 可以启动一个 workspace daemon 统一协调状态、交接和 review。

## Orca 参考

Orca 的参考价值在于：它并不依赖 Agent 直接共享模型内部上下文，而是通过一个编排 runtime 作为中间层完成协同。

参考链接：

- <https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md>
- <https://www.onorca.dev/docs/model/worktrees>
- <https://www.onorca.dev/docs/cli/orchestration>

Orca 的关键思路：

- worktree 隔离：每个任务或 Agent 运行在独立 git worktree 和分支中。
- terminal handle：每个 Agent terminal 都有可寻址的 handle。
- inbox 模型：协同消息由 runtime 持久化并路由。
- 显式消息类型：`status`、`dispatch`、`worker_done`、`escalation`、`decision_gate`、`heartbeat`。
- task / dispatch 跟踪：通过 `taskId` 和 `dispatchId` 关联任务分派和完成回报，避免旧任务或重试任务误报。
- worker preamble 注入：分派任务时向 worker terminal 注入协同协议，约定如何回报完成、发送心跳和升级阻塞问题。
- decision gate：worker 遇到阻塞时向 coordinator 提问，而不是在本地 terminal 静默等待。
- coordinator loop：coordinator 可以拆分任务、分派给 Agent、收集 `worker_done` 并处理 gate。

核心结论：Agent 之间不应直接无约束对话，而应通过一个结构化 runtime 负责路由、状态和责任归属。

## Venus 目标模型

Venus 可以把协同建模为 workspace 级服务：

```text
Workspace root
  ├─ main agent session
  ├─ worker worktree A -> claude/codex/opencode
  ├─ worker worktree B -> claude/codex/opencode
  └─ Venus workspace daemon
       ├─ agent registry
       ├─ message inbox
       ├─ task records
       ├─ dispatch records
       ├─ worker done events
       ├─ heartbeats
       ├─ decision gates
       └─ git status/diff snapshots
```

daemon 应位于 Agent 之间。第一版不要求 Agent 之间直接协议互通，也不依赖 ACP。

## 初始职责

- 按 `sessionId`、CLI 类型、workspace root、worktree path、角色和状态登记 Agent。
- 监听 hook 事件，例如 Claude `Stop`，后续扩展 Codex/OpenCode 等价事件。
- 记录 workspace 事件日志。
- 采集每个 worktree 的 git 状态：
  - `git status --short`
  - `git diff --stat`
  - `git diff --name-only`
  - 当前分支和最后一次提交
- 根据 worker 完成事件生成 handoff packet。
- 检测简单冲突，尤其是多个 worktree 修改同一文件。
- 第一版通过 PTY 注入向 Agent 路由消息。

## 协同消息模型

候选消息结构：

```ts
interface CollaborationMessage {
  id: string;
  workspaceId: string;
  fromSessionId?: string;
  toSessionId?: string;
  type: 'status' | 'dispatch' | 'worker_done' | 'escalation' | 'decision_gate' | 'heartbeat' | 'handoff';
  taskId?: string;
  dispatchId?: string;
  summary: string;
  files?: string[];
  diffStat?: string;
  createdAt: number;
  status: 'pending' | 'sent' | 'ack' | 'resolved';
}
```

候选 Agent 登记结构：

```ts
interface WorkspaceAgent {
  sessionId: string;
  cli: 'claude' | 'codex' | 'opencode';
  workspaceRoot: string;
  worktreePath: string;
  role: 'main' | 'worker';
  status: 'idle' | 'running' | 'waiting' | 'done' | 'blocked';
  lastEventAt: number;
}
```

## MVP 方向

第一版不从 ACP 开始，先复用当前 PTY、hooks 和 git worktree 基础设施。

MVP 内容：

- `WorkspaceDaemonManager`：每个 workspace root 一个 daemon。
- `WorkspaceDaemon`：内存登记表 + 追加式事件日志。
- 创建 session 时，如果它属于某个 workspace/worktree，就注册到 daemon。
- worker `Stop` 时采集摘要和 git diff 状态。
- 为 main agent 生成 `worker_done` 或 `handoff` 消息。
- 移动端 UI 展示 daemon 状态：
  - 当前 workspace 下的 Agent 列表
  - worktree 路径
  - 当前状态
  - 未读完成摘要
  - 变更文件数量
  - 冲突提示
- 第一版跨 Agent 注入保持手动确认，由用户决定是否发送 handoff。

## 后续 ACP 集成

ACP 可以作为后续 Agent backend，而不是第一阶段前置依赖。

```ts
interface AgentChannel {
  sendMessage(sessionId: string, message: string): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): void;
}
```

初始实现：

- `PtyAgentChannel`

未来实现：

- `AcpAgentChannel`

这样可以让 Venus 先基于现有 CLI 行为产生价值，同时保留接入结构化协议的空间。

## 约束

- 不共享模型隐藏上下文，只共享显式摘要、diff、文件、任务 ID 和用户确认的 handoff 消息。
- 不允许 Agent 无限制互相发消息。第一版跨 Agent 注入应由用户确认。
- 默认以 worktree 作为协同隔离边界。
- daemon 介导的每次 handoff 都必须可审计：谁发给谁、基于什么 diff、何时注入。
- 冲突检测应作为一等能力，而不是后补功能。

## 开放问题

- daemon 状态应该持久化到哪里：`~/.venus-vibe-deck/workspaces/{hash}/daemon.jsonl`、项目本地元数据，还是两者都要？
- UI 如何呈现 main agent 与 worker agent 的角色？
- daemon 应如何识别 workspace root：git root、用户选择的 workspace，还是显式项目配置？
- 每种 CLI 的最小安全 worker preamble 应如何设计？
- decision gate 在移动端应如何呈现？
- 哪些 handoff 可以自动发送，哪些必须用户确认？
