# 前端交互

> 移动端 AI 编程 HUD 的前端交互规格。描述目标 UI 与交互,并在每条需求下钉死实现约束(数据模型 / 边界 / 默认值),供实现直接对齐。
> 标注约定:**【决策】** = 已与需求方确认;**【假设·待确认】** = 实现方的默认推断,可调整。

---

## 1. 核心需求

- **主体常规 terminal**:终端文本输入策略分阶段 —— 当前保留 xterm 键盘输入;语音输入先用 Web Speech API 快速验证,稳定后再考虑禁用终端软键盘(详见 §3 与 `docs/voice-input.md`)。
- **头部工具栏**:含连接状态、Session 信息(当前会话名 / 短 id)、菜单入口(详见 §5)。
- **底部快捷按钮**:热键工具带 + 操作区,**语音输入为主按钮**(详见 §6 与 `docs/voice-input.md`)。
- **可关闭当前 session**:工具栏 / 菜单提供关闭入口(详见 §5)。
- **新建 session**:需选择 CLI(claude / codex / 自定义)、workspace(必选),可选「继续上次会话」(带 resume 参数)。CLI 与 resume 参数在设置页配置(详见 §2、§4)。
- **先切 workspace 再启动**:PTY 以 `cwd = workspace` 启动。
- **继续 CLI 历史会话**:用 CLI 自身的 resume 参数(如 `claude -c`)新建 PTY 恢复,**不依赖 PTY 是否存活**(详见 §4)。
- **整体紧凑流畅、符合现代设计审美**。

---

## 2. CLI 配置数据模型(设置页)

每条 CLI 配置字段:

| 字段 | 说明 | 示例 |
|---|---|---|
| `id` | 配置唯一标识 | `claude-default` |
| `name` | 显示名 | `Claude` |
| `command` | 可执行命令 | `claude` |
| `args` | 启动参数(数组) | `["--dangerously-skip-permissions"]` |
| `resumeArg` | 继续会话参数 | `-c` / `--resume` |
| `isDefault` | 是否默认(新建时预选) | `true` |

- 设置页可增删改查 CLI 配置。
- 「默认」标记全局唯一;新建 session 时若存在默认则预选。
- **【决策】配置后端文件持久化**(详见 §7),多设备共享。

---

## 3. 键盘与语音策略

- **【决策】当前保留 xterm 键盘输入**:键盘输入经 `onData` 发回后端 PTY,作为语音能力未稳定前的兜底。
- **【决策】语音输入第一阶段使用 Web Speech API 快速验证**:默认只插入识别文本,不自动回车。完整方案见 `docs/voice-input.md`。
- **【决策】语音稳定后再评估 terminal 纯显示模式**:是否禁用本地键盘输入,取决于语音输入可用性与移动端浏览器表现。
- 设置页 / workspace 输入:始终允许键盘(表单输入)。【假设·待确认】

---

## 4. Session 模型(澄清)

两层概念,不混淆:

1. **PTY session(活着的)**:顶部下拉列表,当前开着的 PTY 进程,切换用。已实现。
2. **CLI 历史会话(继续)**:**【决策】指 CLI 自身的会话**,不是 PTY 存活与否。用 CLI 的 resume 参数**新建** PTY 恢复 CLI 上次状态(如 `claude -c`)。

- 「继续上次会话」= 选中 CLI 配置 + workspace,勾选「继续」→ 以 `command + resumeArg + args` 启动新 PTY。
- **【假设·待确认】** server 端持久化「会话历史」(曾用过的 CLI + workspace 组合),供「继续」入口快速复用;也可不做、仅靠新建面板手动勾选。

---

## 5. 头部工具栏与菜单

- 左:连接状态点 + 文字。
- 中:当前 session 名 + 短 id;session 切换(下拉或抽屉)。
- 右:菜单按钮,项含:**新建会话 / 设置 / 关闭当前 session**。【假设·待确认】
- **关闭当前 session 后**:自动切到列表中下一个存活会话;无存活则回空状态(引导新建)。【假设·待确认】

---

## 6. 底部控制区

- 热键工具带包含 `@`、`/`、上移、下移、空格、更多。
- 操作区包含 Esc、语音、回车,其中**语音为主按钮**。
- 热键点击 → 直接发送原始控制字符(`\x1b[A` 等),`pointerdown` 触发,`preventDefault` 防拉起键盘 / 焦点。
- **【决策】语音第一阶段**:Web Speech API,支持长按录音与点击切换;默认不自动回车。详见 `docs/voice-input.md`。

---

## 7. 配置与会话历史存储

- **【决策】后端文件持久化**:server 维护配置文件(如 `~/.venus-hube/config.json` 存 CLI 配置、`history.json` 存 workspace / 会话历史)。
- 新增 HTTP API:GET/PUT 配置、GET/PUT 历史、`list-dir`(workspace 浏览,§8)。
- 当前**无鉴权**,默认局域网可信;后续公网部署需加 token。【假设·待确认】

---

## 8. workspace 选择

- **【决策】手动输入 + 常用历史 + 目录浏览**,三者结合。
- 输入框:手动填路径;记录常用 workspace 历史,快速复用。
- 「浏览」按钮:调用后端 `list-dir` API 展开目录树选择。
- **【假设·待确认】安全**:`list-dir` 限制可访问根(允许的根目录白名单,配置项),防止越权遍历任意目录。

---

## 9. 实现优先级建议

1. terminal 键盘输入:现阶段**保留键盘输入**作为兜底,语音输入先用 Web Speech API 验证;后续再评估是否禁用终端本地键盘(§3)。
2. 扩协议:新建 session 携带 CLI / workspace / resume(§2、§4)+ 后端配置持久化与 API(§7)。
3. workspace 选择 UI + `list-dir` API + 越权防护(§8)。
4. 头部菜单 / 关闭 session / 新建会话面板 / 设置页(§5、§6)。
5. Web Speech API 语音输入第一阶段(§6,`docs/voice-input.md`)。
