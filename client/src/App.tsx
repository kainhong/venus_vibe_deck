import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWebSocket, type CreateSessionOptions } from './hooks/useWebSocket';
import { useApp } from './state/AppContext';
import { TerminalView, type TerminalWriter } from './components/Terminal';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsPage } from './components/SettingsPage';
import { SpeechTestPanel } from './components/SpeechTestPanel';
import { NewSessionPanel } from './components/NewSessionPanel';
import { SessionHistoryPanel, type SessionHistoryEntry } from './components/SessionHistoryPanel';
import { AboutPanel } from './components/AboutPanel';
import { useBrowserSpeechRecognition, type SpeechResult } from './hooks/useBrowserSpeechRecognition';
import { usePushNotifications } from './hooks/usePushNotifications';
import { api as httpApi } from './api/http';
import voiceIcon from './asserts/icons/voice.svg';
import type { HandMode } from './types';

const IMMERSIVE_LONG_PRESS_MS = 400;
const SESSION_HISTORY_STORAGE_KEY = 'venus-vibe-deck.session-history.v1';
const SESSION_HISTORY_LIMIT = 10;
const DISPLAY_HAND_STORAGE_KEY = 'venus-vibe-deck.display-hand.v1';
const BROWSER_SPEECH_STORAGE_KEY = 'venus-vibe-deck.browser-speech.v1';

type View = 'terminal' | 'settings' | 'speechTest' | 'newSession' | 'history' | 'about';
type SessionAlert = { at: number; source?: string; message?: string };

export default function App() {
  usePushNotifications();
  const writerRef = useRef<TerminalWriter | null>(null);
  const handleData = useCallback((data: string) => writerRef.current?.write(data), []);
  const handleReset = useCallback(() => writerRef.current?.clear(), []);
  const registerWriter = useCallback((writer: TerminalWriter) => {
    writerRef.current = writer;
  }, []);

  const api = useWebSocket(handleData, handleReset);
  const { config, recordWorkspace } = useApp();
  const [view, setView] = useState<View>('terminal');
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>(() => readSessionHistory());
  const [sessionAlerts, setSessionAlerts] = useState<Record<string, SessionAlert>>({});
  const pendingHistoryRef = useRef<SessionHistoryEntry | null>(null);
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [handMode, setHandModeState] = useState<HandMode>(() => readHandMode());
  const [browserSpeechPreference, setBrowserSpeechPreference] = useState<boolean | null>(() => readBrowserSpeechPreference());
  const [immersive, setImmersive] = useState(false);
  const [immersivePending, setImmersivePending] = useState(false);
  const immersivePendingRef = useRef(false);
  const setPending = useCallback((v: boolean) => {
    immersivePendingRef.current = v;
    setImmersivePending(v);
  }, []);
  const [bellActive, setBellActive] = useState(false);
  const pendingHiddenBellRef = useRef(false);
  const [immersiveVoicePoint, setImmersiveVoicePoint] = useState<{ x: number; y: number } | null>(null);
  const immersivePressTimerRef = useRef<number | undefined>(undefined);
  const immersiveLongPressRef = useRef(false);
  const immersiveStartYRef = useRef(0);
  const immersiveLastYRef = useRef(0);
  const immersiveScrollingRef = useRef(false);

  const handleSpeechResult = useCallback((result: SpeechResult) => {
    if (result.type === 'text') {
      const text = result.message;
      if (immersive && immersivePendingRef.current) {
        const lastChar = text.charAt(0);
        const needSep = !/^[，。！？、,.!?\s]/.test(lastChar);
        api.sendInput(needSep ? '，' + text : text);
      } else {
        api.sendInput(text);
      }
      if (immersive) setPending(true);
    } else {
      // command:若沉浸下有 pending 文本,先提交再执行命令
      if (immersive && immersivePendingRef.current) {
        api.sendInput('\r');
        setPending(false);
      }
      const command = config?.voiceSettings?.commands.find((item) => item.id === result.command);
      const input = command?.keyboard ?? '';
      if (input) api.sendInput(input);
    }
  }, [api, config, immersive, setPending]);

  const speech = useBrowserSpeechRecognition({
    lang: 'zh-CN',
    submitMode: 'insert',
    useServerVoice: (config?.voiceSettings?.useServerVoice ?? false) && !getUseBrowserSpeechApi(config?.voiceSettings?.useServerVoice ?? false, browserSpeechPreference),
    commands: config?.voiceSettings?.commands ?? [],
    onResult: handleSpeechResult,
    onError: (message) => alert(message),
  });

  useEffect(() => {
    const notification = api.lastNotification;
    if (!notification?.sessionId) return;
    if (notification.sessionId === api.currentSessionId) return;
    setSessionAlerts((prev) => ({
      ...prev,
      [notification.sessionId!]: {
        at: notification.at,
        source: notification.source,
        message: notification.message,
      },
    }));
    if (document.visibilityState === 'hidden') {
      pendingHiddenBellRef.current = true;
      return;
    }
    setBellActive(true);
    navigator.vibrate?.(80);
    const timer = window.setTimeout(() => {
      setBellActive(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [api.currentSessionId, api.lastNotification]);

  useEffect(() => {
    if (!api.currentSessionId) return;
    setSessionAlerts((prev) => {
      if (!prev[api.currentSessionId!]) return prev;
      const next = { ...prev };
      delete next[api.currentSessionId!];
      return next;
    });
  }, [api.currentSessionId]);

  useEffect(() => {
    if (!api.lastBellAt) return;
    if (document.visibilityState === 'hidden') {
      pendingHiddenBellRef.current = true;
      return;
    }
    setBellActive(true);
    navigator.vibrate?.(80);
    const timer = window.setTimeout(() => {
      setBellActive(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [api.lastBellAt]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !pendingHiddenBellRef.current) return;
      pendingHiddenBellRef.current = false;
      setBellActive(true);
      navigator.vibrate?.(80);
      window.setTimeout(() => setBellActive(false), 1800);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu, { capture: true });
    return () => document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) api.sendInput(text);
    } catch { /* clipboard permission denied */ }
  }, [api]);

  const handleToggleKeyboard = useCallback(() => {
    setKeyboardEnabled((v) => !v);
  }, []);

  const handleHandModeChange = useCallback((mode: HandMode) => {
    setHandModeState(persistHandMode(mode));
  }, []);

  const handleBrowserSpeechChange = useCallback((enabled: boolean) => {
    setBrowserSpeechPreference(persistBrowserSpeechPreference(enabled));
  }, []);

  const enterImmersive = useCallback(() => {
    setImmersive(true);
    setKeyboardEnabled(false);
    setView('terminal');
    document.documentElement.requestFullscreen?.().catch(() => {
      // 浏览器可能要求用户手势或不支持,页面内沉浸模式仍可用
    });
  }, []);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    setImmersiveVoicePoint(null);
    setPending(false);
    speech.cancel();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // ignore
      });
    }
  }, [speech, setPending]);

  const clearImmersiveTimer = useCallback(() => {
    if (immersivePressTimerRef.current !== undefined) {
      window.clearTimeout(immersivePressTimerRef.current);
      immersivePressTimerRef.current = undefined;
    }
  }, []);

  const startImmersivePress = useCallback((point: { x: number; y: number }) => {
    if (speech.state === 'processing') return;
    if (!speech.supported) {
      alert('当前浏览器不支持本地语音识别');
      return;
    }
    setImmersiveVoicePoint(point);
    immersiveLongPressRef.current = false;
    clearImmersiveTimer();
    immersivePressTimerRef.current = window.setTimeout(() => {
      immersiveLongPressRef.current = true;
      setPending(false);
      speech.start();
    }, IMMERSIVE_LONG_PRESS_MS);
  }, [clearImmersiveTimer, speech, setPending]);

  const endImmersivePress = useCallback(() => {
    clearImmersiveTimer();
    if (!immersiveLongPressRef.current) {
      setImmersiveVoicePoint(null);
      return;
    }
    immersiveLongPressRef.current = false;
    speech.stop();
  }, [clearImmersiveTimer, speech]);

  const submitImmersivePending = useCallback(() => {
    if (!immersivePendingRef.current) return;
    api.sendInput('\r');
    setPending(false);
  }, [api, setPending]);

  const immersiveVoiceStyle = immersiveVoicePoint ? {
    '--voice-x': `${immersiveVoicePoint.x}px`,
    '--voice-y': `${immersiveVoicePoint.y}px`,
  } as CSSProperties : undefined;

  const handleCreate = useCallback(
    async (opts: CreateSessionOptions) => {
      try {
        const prepared = opts.useGitWorktree && opts.cwd && opts.requestedWorktreeName
          ? await httpApi.prepareWorktree({ cwd: opts.cwd, name: opts.requestedWorktreeName })
          : null;
        const finalOpts: CreateSessionOptions = prepared
          ? {
              ...opts,
              cwd: prepared.cwd,
              sourceWorkspace: prepared.sourceWorkspace,
              worktreeName: prepared.worktreeName,
              worktreeBranch: prepared.worktreeBranch,
            }
          : opts;
        if (finalOpts.cwd) pendingHistoryRef.current = buildHistoryEntry(finalOpts);
        api.createSession(toWsCreateOptions(finalOpts));
        if (finalOpts.cwd) recordWorkspace(finalOpts.cwd); // 乐观记录 workspace 历史
      } catch (err) {
        alert((err as Error).message || '创建 worktree 失败');
        return;
      }
      setView('terminal');
    },
    [api, recordWorkspace],
  );

  useEffect(() => {
    const pending = pendingHistoryRef.current;
    if (!pending || !api.lastCreatedSessionId) return;
    pendingHistoryRef.current = null;
    setSessionHistory((prev) => persistSessionHistory(upsertSessionHistory(prev, {
      ...pending,
      sessionId: api.lastCreatedSessionId,
      updatedAt: Date.now(),
    })));
  }, [api.lastCreatedSessionId]);

  const clearSessionAlert = useCallback((sessionId: string | undefined) => {
    if (!sessionId) return;
    setSessionAlerts((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    clearSessionAlert(sessionId);
    api.switchSession(sessionId);
  }, [api, clearSessionAlert]);

  const connectHistory = useCallback((entry: SessionHistoryEntry) => {
    const live = entry.sessionId && api.sessions.some((s) => s.id === entry.sessionId && s.alive);
    setSessionHistory((prev) => persistSessionHistory(upsertSessionHistory(prev, { ...entry, updatedAt: Date.now() })));
    if (live && entry.sessionId) {
      clearSessionAlert(entry.sessionId);
      api.switchSession(entry.sessionId);
      setView('terminal');
      return;
    }
    const opts: CreateSessionOptions = {
      cliConfigId: entry.cliConfigId,
      command_bin: entry.command,
      args: entry.args,
      cwd: entry.cwd,
      resumeArg: entry.resumeArg,
      resume: !!entry.resumeArg,
      name: entry.cliName,
      sourceWorkspace: entry.sourceWorkspace,
      worktreeName: entry.worktreeName,
      worktreeBranch: entry.worktreeBranch,
    };
    pendingHistoryRef.current = buildHistoryEntry(opts);
    api.createSession(toWsCreateOptions(opts));
    if (entry.cwd) void recordWorkspace(entry.cwd);
    setView('terminal');
  }, [api, clearSessionAlert, recordWorkspace]);

  const deleteHistory = useCallback((entry: SessionHistoryEntry) => {
    if (entry.sessionId && api.sessions.some((s) => s.id === entry.sessionId && s.alive)) {
      api.destroySession(entry.sessionId);
    }
    clearSessionAlert(entry.sessionId);
    setSessionHistory((prev) => persistSessionHistory(prev.filter((item) => item.key !== entry.key)));
  }, [api, clearSessionAlert]);

  const closeCurrent = useCallback(() => {
    if (api.currentSessionId) api.destroySession(api.currentSessionId);
  }, [api]);

  return (
    <div className={`app${immersive ? ' immersive-mode' : ''}`}>
      <StatusBar
        connected={api.connected}
        sessions={api.sessions}
        currentSessionId={api.currentSessionId}
        onSelect={switchSession}
        onNew={() => setView('newSession')}
        onHistory={() => setView('history')}
        onSettings={() => setView('settings')}
        onSpeechTest={() => setView('speechTest')}
        onAbout={() => setView('about')}
        onCloseCurrent={closeCurrent}
        bellActive={bellActive}
      />

      <main className="terminal-area">
        <TerminalView onData={api.sendInput} onResize={api.sendResize} registerWriter={registerWriter} keyboardEnabled={keyboardEnabled && !immersive} />
        {immersive && (
          <div
            className={`immersive-hit-layer${speech.listening ? ' listening' : ''}${speech.state === 'processing' ? ' processing' : ''}${immersivePending ? ' pending' : ''}`}
            style={immersiveVoiceStyle}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (speech.state === 'processing') return;
              immersiveScrollingRef.current = false;
              immersiveStartYRef.current = e.clientY;
              immersiveLastYRef.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
              startImmersivePress({ x: e.clientX, y: e.clientY });
            }}
            onPointerMove={(e) => {
              if (immersiveLongPressRef.current) return;
              if (immersiveScrollingRef.current) {
                writerRef.current?.scrollByPixels(immersiveLastYRef.current - e.clientY);
                immersiveLastYRef.current = e.clientY;
                return;
              }
              const dy = Math.abs(e.clientY - immersiveStartYRef.current);
              if (dy > 10) {
                immersiveScrollingRef.current = true;
                writerRef.current?.scrollByPixels(immersiveStartYRef.current - e.clientY);
                immersiveLastYRef.current = e.clientY;
                clearImmersiveTimer();
                setImmersiveVoicePoint(null);
              }
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              if (immersiveScrollingRef.current) {
                immersiveScrollingRef.current = false;
                return;
              }
              if (immersiveLongPressRef.current) {
                endImmersivePress();
                return;
              }
              clearImmersiveTimer();
              if (immersivePendingRef.current) {
                const vp = immersiveVoicePoint;
                if (vp) {
                  const dx = Math.abs(e.clientX - vp.x);
                  const dy = Math.abs(e.clientY - vp.y);
                  if (dx < 40 && dy < 40) {
                    submitImmersivePending();
                  } else {
                    api.sendInput('\x15');
                    setPending(false);
                  }
                }
              }
              setImmersiveVoicePoint(null);
            }}
            onPointerCancel={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              clearImmersiveTimer();
              if (immersiveLongPressRef.current) speech.cancel();
              immersiveLongPressRef.current = false;
              setImmersiveVoicePoint(null);
            }}
          >
            {(speech.listening || speech.state === 'processing' || immersivePending) && immersiveVoicePoint && (
              <div
                className="immersive-voice-float"
                style={{ left: immersiveVoicePoint.x, top: immersiveVoicePoint.y }}
              >
                <img src={voiceIcon} alt="" className="immersive-voice-icon" aria-hidden />
              </div>
            )}
          </div>
        )}
      </main>

      <ControlPanel
        onKey={api.sendInput}
        speech={speech}
        keyboardEnabled={keyboardEnabled}
        handMode={handMode}
        onToggleKeyboard={handleToggleKeyboard}
        onPaste={handlePaste}
        onEnterImmersive={enterImmersive}
      />

      {immersive && (
        <button type="button" className="immersive-close" onClick={exitImmersive} aria-label="退出沉浸模式">
          <span aria-hidden />
        </button>
      )}

      {view === 'settings' && (
        <SettingsPage
          handMode={handMode}
          useBrowserSpeechApi={getUseBrowserSpeechApi(config?.voiceSettings?.useServerVoice ?? false, browserSpeechPreference)}
          serverVoiceEnabled={config?.voiceSettings?.useServerVoice ?? false}
          onHandModeChange={handleHandModeChange}
          onBrowserSpeechChange={handleBrowserSpeechChange}
          onClose={() => setView('terminal')}
        />
      )}
      {view === 'speechTest' && (
        <SpeechTestPanel
          useBrowserSpeechApi={config ? getUseBrowserSpeechApi(config.voiceSettings?.useServerVoice ?? false, browserSpeechPreference) : null}
          serverVoiceEnabled={config?.voiceSettings?.useServerVoice ?? null}
          asrProvider={config?.voiceSettings?.asrProvider ?? null}
          onClose={() => setView('terminal')}
        />
      )}
      {view === 'about' && <AboutPanel onClose={() => setView('terminal')} />}
      {view === 'history' && (
        <SessionHistoryPanel
          entries={sessionHistory}
          sessions={api.sessions}
          currentSessionId={api.currentSessionId}
          alerts={sessionAlerts}
          onClose={() => setView('terminal')}
          onConnect={connectHistory}
          onDelete={deleteHistory}
        />
      )}
      {view === 'newSession' && (
        <NewSessionPanel onClose={() => setView('terminal')} onCreate={handleCreate} />
      )}
    </div>
  );
}

function buildHistoryEntry(opts: CreateSessionOptions): SessionHistoryEntry {
  const cwd = opts.cwd?.trim() ?? '';
  const typeKey = opts.cliConfigId || opts.command_bin || opts.name || 'default';
  return {
    key: `${typeKey}::${cwd}`,
    cliConfigId: opts.cliConfigId,
    cliName: opts.name || opts.command_bin || opts.cliConfigId || '默认会话',
    command: opts.command_bin,
    args: opts.args,
    resumeArg: opts.resumeArg,
    cwd,
    sourceWorkspace: opts.sourceWorkspace,
    worktreeName: opts.worktreeName,
    worktreeBranch: opts.worktreeBranch,
    updatedAt: Date.now(),
  };
}

function toWsCreateOptions(opts: CreateSessionOptions): CreateSessionOptions {
  return {
    name: opts.name,
    cliConfigId: opts.cliConfigId,
    command_bin: opts.command_bin,
    args: opts.args,
    cwd: opts.cwd,
    resumeArg: opts.resumeArg,
    resume: opts.resume,
  };
}

function readSessionHistory(): SessionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.key === 'string' && typeof item.cwd === 'string')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, SESSION_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function upsertSessionHistory(entries: SessionHistoryEntry[], entry: SessionHistoryEntry): SessionHistoryEntry[] {
  return [entry, ...entries.filter((item) => item.key !== entry.key)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SESSION_HISTORY_LIMIT);
}

function persistSessionHistory(entries: SessionHistoryEntry[]): SessionHistoryEntry[] {
  const limited = entries
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SESSION_HISTORY_LIMIT);
  try {
    localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(limited));
  } catch {
    // 历史持久化失败不影响会话连接。
  }
  return limited;
}

function readHandMode(): HandMode {
  try {
    return localStorage.getItem(DISPLAY_HAND_STORAGE_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

function persistHandMode(mode: HandMode): HandMode {
  try {
    localStorage.setItem(DISPLAY_HAND_STORAGE_KEY, mode);
  } catch {
    // 显示偏好持久化失败时只影响下次进入的默认值。
  }
  return mode;
}

function getUseBrowserSpeechApi(serverVoiceEnabled: boolean, preference: boolean | null): boolean {
  return preference ?? !serverVoiceEnabled;
}

function readBrowserSpeechPreference(): boolean | null {
  try {
    const value = localStorage.getItem(BROWSER_SPEECH_STORAGE_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function persistBrowserSpeechPreference(enabled: boolean): boolean {
  try {
    localStorage.setItem(BROWSER_SPEECH_STORAGE_KEY, String(enabled));
  } catch {
    // 语音识别偏好持久化失败时只影响下次进入的默认值。
  }
  return enabled;
}
