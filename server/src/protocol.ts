/**
 * 共享消息协议 — 前后端共用同一套类型定义。
 * 后端 protocol.ts / 前端 types.ts 保持结构一致,避免类型漂移。
 */

/** 单个会话的描述信息 */
export interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  alive: boolean;
}

// ───────────────────────── Client → Server ─────────────────────────

/** 向当前绑定会话写入输入(键码或语音转写文本) */
export interface InputMessage {
  action: 'input';
  sessionId: string;
  data: string;
}

/** 终端尺寸变化:同步给 PTY,使输出按真实 cols/rows 排版(换行/TUI 布局) */
export interface ResizeMessage {
  action: 'resize';
  sessionId: string;
  cols: number;
  rows: number;
}

/** 系统控制:会话生命周期与切换 */
export type SystemCommand =
  | { command: 'hello'; targetSessionId?: string }
  | {
      command: 'create_session';
      name?: string;
      /** 引用的 CLI 配置 id(审计/命名用,后端不查配置,保持无状态) */
      cliConfigId?: string;
      /** 可执行命令(claude/bash/...),缺失则用 server 默认 */
      command_bin?: string;
      /** 启动参数 */
      args?: string[];
      /** workspace 路径,PTY 以此为 cwd */
      cwd?: string;
      /** 继续参数(如 -c),resume=true 时拼到 args 前 */
      resumeArg?: string;
      /** 是否继续上次 CLI 会话(spec-ui §4:CLI 自身会话,非 PTY 存活) */
      resume?: boolean;
    }
  | { command: 'destroy_session'; sessionId: string }
  | { command: 'switch_session'; targetSessionId: string };

export interface SystemMessage {
  action: 'system';
}

/** Client → Server 的全部消息 */
export type ClientMessage =
  | InputMessage
  | ResizeMessage
  | (SystemMessage & SystemCommand);

// ───────────────────────── Server → Client ─────────────────────────

export type ServerMessage =
  | { type: 'terminal_out'; sessionId: string; data: string }
  | { type: 'terminal_bell'; sessionId?: string; at: number; source?: string; message?: string }
  | { type: 'session_list'; sessions: SessionInfo[] }
  | { type: 'session_created'; sessionId: string; name: string }
  | { type: 'session_destroyed'; sessionId: string }
  | { type: 'error'; message: string };
