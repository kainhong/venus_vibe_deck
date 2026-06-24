import { useCallback, useRef, useState } from 'react';
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
  const { recordWorkspace } = useApp();
  const [view, setView] = useState<View>('terminal');
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [immersiveVoicePoint, setImmersiveVoicePoint] = useState<{ x: number; y: number } | null>(null);
  const immersivePressTimerRef = useRef<number | undefined>(undefined);
  const immersiveLongPressRef = useRef(false);

  const handleSpeechResult = useCallback((result: SpeechResult) => {
    if (result.type === 'text') api.sendInput(result.message);
  }, [api]);

  const speech = useBrowserSpeechRecognition({
    lang: 'zh-CN',
    submitMode: immersive ? 'submit' : 'insert',
    onResult: handleSpeechResult,
    onError: (message) => alert(message),
  });

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
      />

      <main className="terminal-area">
        <TerminalView onData={api.sendInput} onResize={api.sendResize} registerWriter={registerWriter} keyboardEnabled={keyboardEnabled && !immersive} />
        {immersive && (
          <div
            className={`immersive-hit-layer${speech.listening ? ' listening' : ''}${speech.state === 'processing' ? ' processing' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
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
          ×
        </button>
      )}

      {view === 'settings' && <SettingsPage onClose={() => setView('terminal')} />}
      {view === 'newSession' && (
        <NewSessionPanel onClose={() => setView('terminal')} onCreate={handleCreate} />
      )}
    </div>
  );
}
