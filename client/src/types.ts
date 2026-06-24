/**
 * 前端消息类型 — 与 server/src/protocol.ts 保持结构一致。
 * (单仓内复制一份,避免跨 workspace 的类型解析复杂度)
 */

export interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  alive: boolean;
}

export type ClientMessage =
  | { action: 'input'; sessionId: string; data: string }
  | { action: 'resize'; sessionId: string; cols: number; rows: number }
  | { action: 'system'; command: 'hello'; targetSessionId?: string }
  | {
      action: 'system';
      command: 'create_session';
      name?: string;
      /** 引用的 CLI 配置 id(后端不查配置,仅审计/命名) */
      cliConfigId?: string;
      /** 可执行命令(claude/bash/...),缺失则用 server 默认 */
      command_bin?: string;
      /** 启动参数 */
      args?: string[];
      /** workspace 路径,PTY 以此为 cwd */
      cwd?: string;
      /** 继续参数(如 -c),resume=true 时拼到 args 前 */
      resumeArg?: string;
      /** 是否继续上次 CLI 会话 */
      resume?: boolean;
    }
  | { action: 'system'; command: 'destroy_session'; sessionId: string }
  | { action: 'system'; command: 'switch_session'; targetSessionId: string };

export type ServerMessage =
  | { type: 'terminal_out'; sessionId: string; data: string }
  | { type: 'terminal_bell'; sessionId?: string; at: number; source?: string; message?: string }
  | { type: 'session_list'; sessions: SessionInfo[] }
  | { type: 'session_created'; sessionId: string; name: string }
  | { type: 'session_destroyed'; sessionId: string }
  | { type: 'error'; message: string };

// ───────────────────────── HTTP API 类型(镜像 server storage) ─────────────────────────

export interface CliConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  /** 继续会话参数,如 claude 的 -c */
  resumeArg: string;
  /** 是否默认(新建 session 时预选),全局唯一 */
  isDefault: boolean;
}

export interface ConfigDoc {
  cliConfigs: CliConfig[];
  voiceSettings?: {
    useServerVoice: boolean;
    commands: VoiceCommandConfig[];
  };
}

export interface VoiceCommandConfig {
  id: string;
  label: string;
  input: string;
  keyboard: string;
  aliases: string[];
}

export type SpeechResult =
  | {
      type: 'text';
      message: string;
      confidence?: number;
      provider?: string;
      durationMs?: number;
    }
  | {
      type: 'command';
      message: string;
      command: string;
      confidence?: number;
      provider?: string;
      durationMs?: number;
    };

export interface SpeechTranscribeRequest {
  audio: string;
  sampleRate: number;
  language?: string;
  submitMode?: 'insert' | 'submit';
}

export interface WorkspaceHistoryEntry {
  path: string;
  lastUsedAt: number;
  count: number;
}

export interface HistoryDoc {
  workspaces: WorkspaceHistoryEntry[];
}

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface DirListing {
  path: string;
  entries: DirEntry[];
}
