import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage, SessionInfo } from '../types';

/** 单进程同源:页面与 WebSocket 共用同一 host:port(server 同时托管静态页与 WS) */
function buildWsUrl(): string {
  const proto = globalThis.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}//${location.host}`;
}

/** 新建会话的可选项(对应 protocol 的 create_session 字段) */
export interface CreateSessionOptions {
  name?: string;
  /** 引用的 CLI 配置 id(后端仅审计/命名) */
  cliConfigId?: string;
  /** 可执行命令(claude/bash/...),缺失则用 server 默认 */
  command_bin?: string;
  /** 启动参数(不含 resumeArg,resume 时由后端拼到前面) */
  args?: string[];
  /** workspace 路径,PTY 以此为 cwd */
  cwd?: string;
  /** 继续参数(如 -c) */
  resumeArg?: string;
  /** 是否继续上次 CLI 会话 */
  resume?: boolean;
}

export interface WebSocketApi {
  connected: boolean;
  sessions: SessionInfo[];
  currentSessionId: string | undefined;
  sendInput: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  switchSession: (id: string) => void;
  createSession: (opts?: CreateSessionOptions) => void;
  destroySession: (id: string) => void;
}

/**
 * WebSocket 连接管理:连接、收发、会话切换。
 * 用 ref 持有最新回调/状态,保证 effect 只建立一次连接却能读到最新值。
 */
export function useWebSocket(onTerminalData: (data: string) => void): WebSocketApi {
  const onDataRef = useRef(onTerminalData);
  onDataRef.current = onTerminalData;

  const wsRef = useRef<WebSocket | null>(null);
  const currentRef = useRef<string | undefined>(undefined);
  // sessions 的 ref 镜像:供 session_destroyed 闭包读到最新列表(切换到下一个存活)
  const sessionsRef = useRef<SessionInfo[]>([]);
  // 最近一次终端尺寸,供会话切换/首次绑定时补发给 PTY
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  currentRef.current = currentSessionId;
  sessionsRef.current = sessions;

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      send({ action: 'system', command: 'hello' });
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'terminal_out':
          if (msg.sessionId === currentRef.current) onDataRef.current(msg.data);
          break;
        case 'session_list':
          sessionsRef.current = msg.sessions;
          setSessions(msg.sessions);
          // 首次拿到列表时自动绑定第一个会话
          setCurrentSessionId((prev) => prev ?? msg.sessions[0]?.id);
          break;
        case 'session_created':
          // 同步更新 ref(不等 render):紧随其后的 attach scrollback 才能按 sid 匹配
          currentRef.current = msg.sessionId;
          setCurrentSessionId(msg.sessionId);
          break;
        case 'session_destroyed':
          // 当前会话被关:切到第一个仍存活的,并通知后端 attach(无存活则置空)
          if (currentRef.current === msg.sessionId) {
            const next = sessionsRef.current.find((s) => s.id !== msg.sessionId && s.alive)?.id;
            setCurrentSessionId(next);
            if (next) send({ action: 'system', command: 'switch_session', targetSessionId: next });
          }
          break;
        case 'error':
          console.error('[ws] server error:', msg.message);
          break;
      }
    };

    return () => ws.close();
  }, [send]);

  const sendInput = useCallback(
    (data: string) => {
      const id = currentRef.current;
      if (id) send({ action: 'input', sessionId: id, data });
    },
    [send],
  );

  /** 上报终端尺寸:记下最新值,若有当前会话则即时同步给 PTY */
  const sendResize = useCallback(
    (cols: number, rows: number) => {
      lastSizeRef.current = { cols, rows };
      const id = currentRef.current;
      if (id) send({ action: 'resize', sessionId: id, cols, rows });
    },
    [send],
  );

  const switchSession = useCallback(
    (id: string) => {
      setCurrentSessionId(id);
      send({ action: 'system', command: 'switch_session', targetSessionId: id });
    },
    [send],
  );

  const createSession = useCallback(
    (opts: CreateSessionOptions = {}) => {
      send({ action: 'system', command: 'create_session', ...opts });
    },
    [send],
  );

  const destroySession = useCallback(
    (id: string) => {
      send({ action: 'system', command: 'destroy_session', sessionId: id });
    },
    [send],
  );

  // 会话切换/首次绑定时,把最近尺寸补发给新会话的 PTY
  // 解决"尺寸先到、session 后到"的时序漏发
  useEffect(() => {
    const size = lastSizeRef.current;
    if (currentSessionId && size) {
      send({ action: 'resize', sessionId: currentSessionId, cols: size.cols, rows: size.rows });
    }
  }, [currentSessionId, send]);

  return {
    connected,
    sessions,
    currentSessionId,
    sendInput,
    sendResize,
    switchSession,
    createSession,
    destroySession,
  };
}
