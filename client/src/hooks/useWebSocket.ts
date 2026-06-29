import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../api/http';
import type { ClientMessage, ServerMessage, SessionInfo } from '../types';

/** 单进程同源:页面与 WebSocket 共用同一 host:port(server 同时托管静态页与 WS) */
function buildWsUrl(): string {
  const proto = globalThis.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = new URL(`${proto}://${location.host}`);
  const token = getAuthToken();
  if (token) url.searchParams.set('auth', token);
  return url.toString();
}

const SESSION_PARAM = 'session';
const SESSION_ID_LEN = 8;

function shortSessionId(id: string): string {
  return id.slice(0, SESSION_ID_LEN);
}

function readSessionToken(): string | undefined {
  const token = new URLSearchParams(globalThis.location.search).get(SESSION_PARAM)?.trim();
  return token || undefined;
}

function writeSessionToken(id: string | undefined): void {
  const url = new URL(globalThis.location.href);
  if (id) url.searchParams.set(SESSION_PARAM, shortSessionId(id));
  else url.searchParams.delete(SESSION_PARAM);
  globalThis.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function resolveSessionId(sessions: SessionInfo[], token: string | undefined): string | undefined {
  if (!token) return undefined;
  if (sessions.some((s) => s.id === token)) return token;
  const matches = sessions.filter((s) => s.id.startsWith(token));
  return matches.length === 1 ? matches[0].id : undefined;
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
  /** 新建前是否准备 Git worktree(仅前端使用) */
  useGitWorktree?: boolean;
  /** 用户输入/前端生成的 worktree 名称(仅前端使用) */
  requestedWorktreeName?: string;
  /** 本地历史元数据:原始 git workspace,不发送给后端使用 */
  sourceWorkspace?: string;
  /** 本地历史元数据:worktree 名称 */
  worktreeName?: string;
  /** 本地历史元数据:worktree 分支 */
  worktreeBranch?: string;
}

export interface WebSocketApi {
  connected: boolean;
  sessions: SessionInfo[];
  currentSessionId: string | undefined;
  lastCreatedSessionId: string | undefined;
  lastNotification: { sessionId?: string; at: number; source?: string; message?: string } | undefined;
  lastBellAt: number | undefined;
  lastBellMessage: string | undefined;
  lastBellSource: string | undefined;
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
export function useWebSocket(onTerminalData: (data: string) => void, onTerminalReset?: () => void): WebSocketApi {
  const onDataRef = useRef(onTerminalData);
  const onResetRef = useRef(onTerminalReset);
  onDataRef.current = onTerminalData;
  onResetRef.current = onTerminalReset;

  const wsRef = useRef<WebSocket | null>(null);
  const currentRef = useRef<string | undefined>(undefined);
  // sessions 的 ref 镜像:供 session_destroyed 闭包读到最新列表(切换到下一个存活)
  const sessionsRef = useRef<SessionInfo[]>([]);
  // 最近一次终端尺寸,供会话切换/首次绑定时补发给 PTY
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [lastCreatedSessionId, setLastCreatedSessionId] = useState<string | undefined>(undefined);
  const [lastNotification, setLastNotification] = useState<{ sessionId?: string; at: number; source?: string; message?: string } | undefined>(undefined);
  const [lastBellAt, setLastBellAt] = useState<number | undefined>(undefined);
  const [lastBellMessage, setLastBellMessage] = useState<string | undefined>(undefined);
  const [lastBellSource, setLastBellSource] = useState<string | undefined>(undefined);
  currentRef.current = currentSessionId;
  sessionsRef.current = sessions;

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;
    let refreshAfterHidden = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };

    const sendHello = (ws: WebSocket) => {
      ws.send(JSON.stringify({ action: 'system', command: 'hello', targetSessionId: readSessionToken() } satisfies ClientMessage));
    };

    const scheduleReconnect = () => {
      if (disposed || document.visibilityState === 'hidden' || reconnectTimer !== undefined) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, 800);
    };

    const connect = () => {
      if (disposed) return;
      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        clearReconnectTimer();
        setConnected(true);
        sendHello(ws);
      };
      ws.onclose = () => {
        if (wsRef.current === ws) {
          setConnected(false);
          scheduleReconnect();
        }
      };
      ws.onerror = () => {
        if (wsRef.current === ws) setConnected(false);
      };
      ws.onmessage = (ev) => {
        if (wsRef.current !== ws) return;
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
          case 'terminal_bell':
            setLastNotification({
              sessionId: msg.sessionId,
              at: msg.at,
              source: msg.source,
              message: msg.message,
            });
            if (!msg.sessionId || msg.sessionId === currentRef.current) {
              setLastBellAt(msg.at);
              setLastBellMessage(msg.message);
              setLastBellSource(msg.source);
            }
            break;
          case 'cli_session_end':
            setLastNotification({
              sessionId: msg.sessionId,
              at: msg.at,
              source: msg.source,
              message: msg.message,
            });
            if (!msg.sessionId || msg.sessionId === currentRef.current) {
              setLastBellAt(msg.at);
              setLastBellMessage(msg.message);
              setLastBellSource(msg.source);
            }
            break;
          case 'session_list':
            sessionsRef.current = msg.sessions;
            setSessions(msg.sessions);
            // 首次拿到列表时自动绑定第一个会话;空列表时明确清空当前会话。
            setCurrentSessionId((prev) => {
              const next =
                resolveSessionId(msg.sessions, readSessionToken()) ??
                (prev && msg.sessions.some((s) => s.id === prev) ? prev : undefined) ??
                msg.sessions[0]?.id;
              if (next !== currentRef.current) onResetRef.current?.();
              writeSessionToken(next);
              currentRef.current = next;
              return next;
            });
            break;
          case 'session_created':
            // 同步更新 ref(不等 render):紧随其后的 attach scrollback 才能按 sid 匹配
            onResetRef.current?.();
            currentRef.current = msg.sessionId;
            setCurrentSessionId(msg.sessionId);
            setLastCreatedSessionId(msg.sessionId);
            writeSessionToken(msg.sessionId);
            break;
          case 'session_destroyed':
            // 当前会话被关:切到第一个仍存活的,并通知后端 attach(无存活则置空)
            if (currentRef.current === msg.sessionId) {
              const next = sessionsRef.current.find((s) => s.id !== msg.sessionId && s.alive)?.id;
              onResetRef.current?.();
              currentRef.current = next;
              setCurrentSessionId(next);
              writeSessionToken(next);
              if (next) send({ action: 'system', command: 'switch_session', targetSessionId: next });
            }
            break;
          case 'error':
            console.error('[ws] server error:', msg.message);
            break;
        }
      };
    };

    const recoverConnection = (forceReconnect = false) => {
      if (document.visibilityState === 'hidden') return;
      const ws = wsRef.current;
      if (!forceReconnect && ws?.readyState === WebSocket.OPEN) {
        sendHello(ws);
        setConnected(true);
        return;
      }
      setConnected(false);
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      wsRef.current = null;
      connect();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        refreshAfterHidden = true;
        return;
      }
      recoverConnection(refreshAfterHidden);
      refreshAfterHidden = false;
    };

    const onPageShow = (event: PageTransitionEvent) => {
      recoverConnection(event.persisted || refreshAfterHidden);
      refreshAfterHidden = false;
    };

    const onFocus = () => recoverConnection();
    const onOnline = () => recoverConnection();

    connect();
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      clearReconnectTimer();
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wsRef.current?.close();
      wsRef.current = null;
    };
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
      if (id !== currentRef.current) onResetRef.current?.();
      currentRef.current = id;
      setCurrentSessionId(id);
      writeSessionToken(id);
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
    lastCreatedSessionId,
    lastNotification,
    lastBellAt,
    lastBellMessage,
    lastBellSource,
    sendInput,
    sendResize,
    switchSession,
    createSession,
    destroySession,
  };
}
