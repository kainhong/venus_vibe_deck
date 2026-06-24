# Session 与 PTY 生命周期管理

> 本文档定义 server 端 PTY 会话的生命周期策略,以及 server 在不同退出场景下对子进程的清理行为。
> 核心目标:**断线不中断任务 · 退出不留孤儿进程 · 崩溃有兜底**。
>
> 文中"当前实现"指代码现状;"待办"指已论证、尚未落地的加固。区分二者,避免文档与代码漂移。

---

## 1. 进程模型

| 组件 | 位置 | 职责 |
|---|---|---|
| `SessionManager` | `server/src/session/SessionManager.ts` | 进程内 `Map<sessionId, PtySession>`,统一管理所有会话(create / get / destroy / list / shutdown) |
| `PtySession` | `server/src/session/PtySession.ts` | 封装一个 `node-pty` 进程(bash/claude…),维护滚动 scrollback,提供 `onData` / `write` / `resize` / `destroy` |
| `ClientConnection` | `server/src/ws/handler.ts` | 每个 WebSocket 连接一个,绑定到某个 session,路由消息;输出经它订阅并推送 |

**核心设计:PTY 进程的生命周期与 WebSocket 连接解耦。**

```
WebSocket 连接 ──┐                       ┌── PtySession(bash 进程)  ← 归 SessionManager 管
   (易断)       ├── 仅"订阅"关系 ──────►│   (持久,与连接无关)
                └─ 断开只 detach ───────►┘
```

PTY 归 `SessionManager` 持有,`ClientConnection` 只是**订阅者**。连接断开只取消订阅,**不动 PTY**。这是"断线不中断"的基础。

---

## 2. WS 断开 / 页面刷新:PTY 继续运行

刷新页面 = 旧 WS 关闭 → 新 WS 建立。行为:

1. 旧 WS `close` → `ClientConnection.detach()`:仅 `unsubscribe()`,**不调 `manager.destroy()`**。
2. 新 WS `onopen` → 发 `hello`。
3. server 返回 `session_list`(所有存活会话)。
4. `attach` 到目标会话 → **回放 scrollback** → 订阅增量输出。

**结论:刷新不会丢失或关闭 PTY,任务不中断,历史可回放。** 已实测验证:

```
阶段1:WS1 执行 echo → 关闭 WS1(模拟刷新)
阶段2:WS2 重连 → 原 session 仍在(alive=true)→ scrollback 回放刷新前输出 → 新命令正常响应(PTY 活着)
```

---

## 3. server 进程退出:PTY 命运(三场景)

> server 是 PTY 的父进程。父进程怎么死,决定子进程怎么死。

### 3.1 正常退出(SIGTERM / SIGINT)

PM2 reload、`kill <pid>`、Ctrl-C。

- 信号**可捕获** → `index.ts` 的 handler 执行 `manager.shutdown()` → 对每个 session 调 `pty.kill()`。
- **当前实现**:✅ 所有 PTY 被显式关闭。
- **当前不足**:⚠️ `pty.kill()` 默认发 **SIGHUP**,杀不掉会话内忽略 SIGHUP 的进程(见 §4)。计划改为按会话清理(见 §6-T1)。

### 3.2 不可恢复崩溃(SIGKILL / OOM / 段错误 / 容器被强杀)

`kill -9`、OOM Killer、SIGSEGV。信号**不可捕获**,`shutdown()` **完全不执行**。子进程命运**取决于它是否响应 SIGHUP**(已实测两种):

| 子进程类型 | 崩溃后行为 | 实测 |
|---|---|---|
| 多数交互式进程(bash 本身) | master fd 随 server 关闭 → controlling terminal 挂断 → **SIGHUP → 退出**(变僵尸,init 回收) | ✅ bash `kill -9` 后变 `Z` 僵尸 |
| 忽略 SIGHUP 的进程(nohup / setsid / `trap '' HUP` / daemon) | **成活孤儿**,被 init(PID 1)收养,继续运行 | ❌ `trap '' HUP` 的 sleep 崩溃后 PPID=1 仍存活 |

**结论:崩溃后 PTY 不保证全关。** 交互式 CLI 会自清理,但 nohup / 守护进程会逃逸成孤儿。这是"一不小心就泄漏"的真实路径。

### 3.3 僵尸进程(defunct)

子进程已退出但未被 `wait`。非容器环境 init 自动回收;**容器内若 PID 1 不是 init(无 tini),僵尸堆积**。

---

## 4. 为何要慎重:两个真实的泄漏盲点

**盲点 A — SIGHUP 不可靠。** 即便优雅退出(§3.1),`pty.kill()` 的 SIGHUP 对 `nohup`/daemon 进程无效,会漏。

**盲点 B — 交互式 shell 的 job control 分组。** 想用 `kill -<pgid>`(负 PID 杀进程组)更彻底?对交互式 PTY 行不通:交互式 bash 开启 job control,把每个后台 job 放**独立进程组**。实测:

```
bash  pgid=94095  sid=94095
sleep pgid=94276  sid=94095   ← 后台 job 独立进程组,但同会话
kill -9 -94095(bash 进程组) → sleep 存活 ❌
```

`kill -pgid` 只杀一个组,杀不到 job 分出去的组。

**但关键洞察**:它们 **SID 相同**(node-pty 的 bash 是 session leader,SID=PID)。所以**按会话(sid)清理**比按进程组(pgid)彻底 —— 能覆盖 job control 分出的所有进程组。

---

## 5. 生命周期事件清单

| 事件 | 是否销毁 PTY | 说明 |
|---|---|---|
| 客户端发 `destroy_session` | ✅ 是 | 显式销毁,`pty.kill()` + 移出 Map |
| WS 断开 / 页面刷新 / 浏览器关闭 | ❌ 否 | 仅 detach,PTY 保留 |
| PTY 进程自身退出(`exit` / claude 跑完) | — | 进程已死,条目标记 `alive=false`,留条目供前端展示 |
| server 收到 SIGTERM / SIGINT | ✅ 全部 | `shutdown()` 显式 kill 所有 session |
| server 被 SIGKILL / OOM / 崩溃 | ⚠️ 不保证 | shutdown 不执行;交互式进程 SIGHUP 自杀,nohup/daemon 成孤儿 |
| server 启动 | — | `ensureDefault()` 建一个默认会话 |

---

## 6. 加固策略与现状

### 当前已实现 ✅
- WS 断开不销毁 PTY(解耦设计)。
- 刷新重连 + scrollback 回放(§2)。
- SIGTERM/SIGINT → `shutdown()` 优雅关闭全部 session。
- PTY 自身退出后保留条目标记 `alive=false`。

### 待办加固(已论证)

| 编号 | 加固 | 解决的问题 | 状态 |
|---|---|---|---|
| **T1** | `shutdown()` 改为**按会话 sid 全量 SIGKILL**:遍历 `sid === pty.pid` 的所有进程逐个杀,替代 `pty.kill()` 的 SIGHUP | 优雅退出时杀干净会话内 nohup/job-control 分组的进程(§4 盲点 A/B) | 待实现 |
| **T2** | **pidfile 持久化 + 重启清理**:spawn 时记录每个 session 的 sid/pgid 到磁盘;server 启动时扫描并清理"上次遗留的孤儿" | 崩溃(§3.2)的兜底 —— 崩溃时 server 自己已无机会动手,只能靠下次启动补刀 | 待实现 |
| **T3** | **空闲超时清理**:最后一个客户端断开超过 N 分钟的 session 自动 destroy | 客户端永不重连时避免无限期占用内存/进程 | 待实现 |
| **T4** | **容器 `--init`(tini)/ cgroup / PID namespace 隔离** | 回收僵尸(§3.3)+ 进程级隔离,彻底兜底崩溃孤儿 | 部署配置(见部署文档) |

**优先级**:T1(优雅退出更干净,低成本)> T4(部署标配)> T2(崩溃兜底,中等成本)> T3(防长期泄漏)。

---

## 7. 已知边界与待办(非泄漏,但影响体验)

- **刷新后绑定 `sessions[0]`,不是"上次正在看的 session"**:多会话时刷新会回到列表第一个,需手动切回。改进:前端 `localStorage` 记 `lastSessionId`,重连优先绑定。
- **PTY 默认尺寸 80×24**:客户端连接后通过 `resize` 消息同步真实尺寸(已实现);连接前的短暂窗口内输出按 80 列。
- **`node` 若为 nvm shim**:`$!` / `pgrep -P` 会因包装层偏移,运维脚本需用 node 二进制全路径或递归遍历进程树(调试踩过的坑)。

---

## 附:实测命令参考

文档结论均经实测,关键命令(便于复现):

```bash
# 验证刷新重连不丢 PTY:见 verify-reconnect(WS1 操作→关闭→WS2 重连验证)
# 验证崩溃后交互式进程退出:kill -9 <node> 后 ps 查看 bash 变 Z 僵尸
# 验证 SIGHUP-immune 孤儿:( trap '' HUP; exec sleep 300 ) &  → kill -9 node 后 PPID=1 存活
# 验证 job control 分组:sleep 300 &  → ps -o pgid,sid 对比 bash 与 sleep 的 pgid
```
