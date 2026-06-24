import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWebSocket, type CreateSessionOptions } from './hooks/useWebSocket';
import { useApp } from './state/AppContext';
import { TerminalView, type TerminalWriter } from './components/Terminal';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsPage } from './components/SettingsPage';
import { NewSessionPanel } from './components/NewSessionPanel';
import { useBrowserSpeechRecognition, type SpeechResult } from './hooks/useBrowserSpeechRecognition';

const IMMERSIVE_LONG_PRESS_MS = 160;

type View = 'terminal' | 'settings' | 'newSession';

export default function App() {
  const writerRef = useRef<TerminalWriter | null>(null);
  const handleData = useCallback((data: string) => writerRef.current?.write(data), []);
  const handleReset = useCallback(() => writerRef.current?.clear(), []);
  const registerWriter = useCallback((writer: TerminalWriter) => {
    writerRef.current = writer;
  }, []);

  const api = useWebSocket(handleData, handleReset);
  const { config, recordWorkspace } = useApp();
  const [view, setView] = useState<View>('terminal');
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [bellActive, setBellActive] = useState(false);
  const pendingHiddenBellRef = useRef(false);
  const [immersiveVoicePoint, setImmersiveVoicePoint] = useState<{ x: number; y: number } | null>(null);
  const immersivePressTimerRef = useRef<number | undefined>(undefined);
  const immersiveLongPressRef = useRef(false);

  const handleSpeechResult = useCallback((result: SpeechResult) => {
    if (result.type === 'text') api.sendInput(result.message);
    else {
      const command = config?.voiceSettings?.commands.find((item) => item.id === result.command);
      const input = command?.keyboard ?? '';
      if (input) api.sendInput(input);
    }
  }, [api, config]);

  const speech = useBrowserSpeechRecognition({
    lang: 'zh-CN',
    submitMode: immersive ? 'submit' : 'insert',
    useServerVoice: config?.voiceSettings?.useServerVoice ?? false,
    commands: config?.voiceSettings?.commands ?? [],
    onResult: handleSpeechResult,
    onError: (message) => alert(message),
  });

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

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) api.sendInput(text);
    } catch { /* clipboard permission denied */ }
  }, [api]);

  const handleToggleKeyboard = useCallback(() => {
    setKeyboardEnabled((v) => !v);
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
    speech.cancel();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // ignore
      });
    }
  }, [speech]);

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
      speech.start();
    }, IMMERSIVE_LONG_PRESS_MS);
  }, [clearImmersiveTimer, speech]);

  const endImmersivePress = useCallback(() => {
    clearImmersiveTimer();
    if (!immersiveLongPressRef.current) {
      setImmersiveVoicePoint(null);
      return;
    }
    immersiveLongPressRef.current = false;
    speech.stop();
  }, [clearImmersiveTimer, speech]);

  const immersiveVoiceStyle = immersiveVoicePoint ? {
    '--voice-x': `${immersiveVoicePoint.x}px`,
    '--voice-y': `${immersiveVoicePoint.y}px`,
  } as CSSProperties : undefined;

  const handleCreate = useCallback(
    (opts: CreateSessionOptions) => {
      api.createSession(opts);
      if (opts.cwd) recordWorkspace(opts.cwd); // 乐观记录 workspace 历史
      setView('terminal');
    },
    [api, recordWorkspace],
  );

  const closeCurrent = useCallback(() => {
    if (api.currentSessionId) api.destroySession(api.currentSessionId);
  }, [api]);

  return (
    <div className={`app${immersive ? ' immersive-mode' : ''}`}>
      <StatusBar
        connected={api.connected}
        sessions={api.sessions}
        currentSessionId={api.currentSessionId}
        onSelect={api.switchSession}
        onNew={() => setView('newSession')}
        onSettings={() => setView('settings')}
        onCloseCurrent={closeCurrent}
        bellActive={bellActive}
      />

      <main className="terminal-area">
        <TerminalView onData={api.sendInput} onResize={api.sendResize} registerWriter={registerWriter} keyboardEnabled={keyboardEnabled && !immersive} />
        {immersive && (
          <div
            className={`immersive-hit-layer${speech.listening ? ' listening' : ''}${speech.state === 'processing' ? ' processing' : ''}`}
            style={immersiveVoiceStyle}
            onPointerDown={(e) => {
              e.preventDefault();
              if (speech.state === 'processing') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              startImmersivePress({ x: e.clientX, y: e.clientY });
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              endImmersivePress();
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
            {(speech.listening || speech.state === 'processing') && immersiveVoicePoint && (
              <div
                className="immersive-voice-float"
                style={{ left: immersiveVoicePoint.x, top: immersiveVoicePoint.y }}
              >
                {speech.listening ? '松开发送语音' : '识别中'}
              </div>
            )}
          </div>
        )}
      </main>

      <ControlPanel
        onKey={api.sendInput}
        speech={speech}
        keyboardEnabled={keyboardEnabled}
        onToggleKeyboard={handleToggleKeyboard}
        onPaste={handlePaste}
        onEnterImmersive={enterImmersive}
      />

      {immersive && (
        <button type="button" className="immersive-close" onClick={exitImmersive} aria-label="退出沉浸模式">
          <span aria-hidden />
        </button>
      )}

      {view === 'settings' && <SettingsPage onClose={() => setView('terminal')} />}
      {view === 'newSession' && (
        <NewSessionPanel onClose={() => setView('terminal')} onCreate={handleCreate} />
      )}
    </div>
  );
}
