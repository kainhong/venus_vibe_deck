import { useCallback, useRef, useState } from 'react';
import { useWebSocket, type CreateSessionOptions } from './hooks/useWebSocket';
import { useApp } from './state/AppContext';
import { TerminalView, type TerminalWriter } from './components/Terminal';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsPage } from './components/SettingsPage';
import { NewSessionPanel } from './components/NewSessionPanel';

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

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) api.sendInput(text);
    } catch { /* clipboard permission denied */ }
  }, [api]);

  const handleToggleKeyboard = useCallback(() => {
    setKeyboardEnabled((v) => !v);
  }, []);

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
    <div className="app">
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
        <TerminalView onData={api.sendInput} onResize={api.sendResize} registerWriter={registerWriter} keyboardEnabled={keyboardEnabled} />
      </main>

      <ControlPanel
        onKey={api.sendInput}
        keyboardEnabled={keyboardEnabled}
        onToggleKeyboard={handleToggleKeyboard}
        onPaste={handlePaste}
      />

      {view === 'settings' && <SettingsPage onClose={() => setView('terminal')} />}
      {view === 'newSession' && (
        <NewSessionPanel onClose={() => setView('terminal')} onCreate={handleCreate} />
      )}
    </div>
  );
}
